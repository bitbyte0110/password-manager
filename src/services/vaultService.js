import * as SecureStore from 'expo-secure-store';
import bcrypt from 'react-native-bcrypt';
import { Buffer } from 'buffer';
import databaseService from './databaseService';
import encryptionService from './encryptionService';
import { getMFAEnabled } from '../utils/authUtils';
import passwordUtils from '../utils/passwordUtils';
import performanceMonitor from '../utils/performanceMonitor';

/**
 * Vault Service for handling master password and data operations
 * Provides a secure interface for vault operations with master password management
 */
class VaultService {
  constructor() {
    this.dbService = databaseService; // Use the singleton instance
    this.masterPassword = null; // Keep master password in memory during session
    this.isAuthenticated = false;
    this.sessionStartTime = null;
    this.sessionToken = null; // For secure session restoration
    this.entryCache = new Map(); // Cache for decrypted entries to avoid re-decryption
    this.cacheTimestamps = new Map(); // Track cache freshness
    this.categoryCache = new Map(); // Cache for category passwords
    this.categoryCacheTimestamps = new Map(); // Track category cache freshness
    this.CACHE_TTL = 30000; // 30 seconds cache TTL
    this.CATEGORY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL for categories
  }

  /**
   * Initialize the vault service
   * @returns {Promise<boolean>} Initialization success
   */
  async initialize() {
    try {
      console.log('VaultService: Starting initialization...');

      if (!this.dbService) {
        throw new Error('Database service is not available');
      }

      console.log('VaultService: Initializing database service...');
      await this.dbService.initialize();

      console.log('VaultService: Database service initialized successfully');

      // Run auto-cleanup of expired trash items
      await this.autoCleanupExpiredTrash();

      // Try to restore authentication if session is valid
      // Don't throw errors during initialization - session restoration is optional
      try {
        await this.tryRestoreAuthentication();
        console.log('VaultService: Session restoration completed');
      } catch (sessionError) {
        console.warn(
          'VaultService: Session restoration failed (non-critical):',
          sessionError.message
        );
        // Clear potentially corrupted session data during initialization
        try {
          await SecureStore.deleteItemAsync('vault_sessionToken');
          console.log(
            'VaultService: Cleared corrupted session token during initialization'
          );
        } catch (clearError) {
          console.warn(
            'VaultService: Could not clear session token:',
            clearError.message
          );
        }
      }

      return true;
    } catch (error) {
      console.error('VaultService initialization error:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
      });
      throw error;
    }
  }

  /**
   * Try to restore authentication from stored session
   * @returns {Promise<boolean>} Restoration success
   */
  async tryRestoreAuthentication() {
    try {
      console.log('=== SESSION RESTORATION DEBUG ===');

      // Check if we already have a master password in memory
      if (this.isAuthenticated && this.masterPassword) {
        console.log('VaultService: Already authenticated');
        return true;
      }

      console.log('VaultService: Attempting to restore session...');

      // Try to restore from session token
      const sessionToken = await SecureStore.getItemAsync('vault_sessionToken');
      if (!sessionToken) {
        console.log('VaultService: No session token found');
        return false;
      }

      console.log('VaultService: Session token found, parsing...');

      // Verify session token is still valid - timeout depends on MFA state
      let sessionData;
      try {
        sessionData = JSON.parse(sessionToken);
      } catch (parseError) {
        console.error(
          'VaultService: Invalid session token format:',
          parseError
        );
        await SecureStore.deleteItemAsync('vault_sessionToken');
        return false;
      }

      const now = Date.now();
      const sessionAge = now - sessionData.timestamp;

      // Get MFA state to determine session timeout
      const mfaEnabled = await getMFAEnabled();
      // When MFA is disabled, allow longer sessions for better UX
      const SESSION_TIMEOUT = mfaEnabled
        ? 2 * 60 * 1000 // 2 minutes when MFA enabled (more secure)
        : 24 * 60 * 60 * 1000; // 24 hours when MFA disabled (convenience)

      console.log(
        `VaultService: Session age: ${Math.round(sessionAge / 1000)}s (timeout: ${SESSION_TIMEOUT / 1000}s, MFA: ${mfaEnabled})`
      );

      if (sessionAge > SESSION_TIMEOUT) {
        console.log('VaultService: Session token expired');
        await SecureStore.deleteItemAsync('vault_sessionToken');
        return false;
      }

      console.log(
        'VaultService: Session token is valid, checking session type...'
      );

      // Check if this is an OS biometric session
      if (sessionData.type === 'os_biometric') {
        console.log(
          'VaultService: Restoring OS biometric session, attempting to retrieve stored password...'
        );

        // Try to get the stored biometric password for full functionality
        const biometricPassword = await SecureStore.getItemAsync(
          'vault_biometricPassword'
        );

        if (biometricPassword) {
          try {
            // Decrypt the stored password and restore full session
            console.log(
              'VaultService: Found stored biometric password during session restore'
            );
            const decryptedPassword =
              this.decryptBiometricPassword(biometricPassword);

            this.masterPassword = decryptedPassword;
            this.isAuthenticated = true;
            this.sessionStartTime = sessionData.timestamp;
            this.sessionToken = sessionToken;

            console.log(
              'VaultService: OS biometric session restored with full password access'
            );
            console.log('=== END SESSION RESTORATION DEBUG ===');
            return true;
          } catch (decryptError) {
            console.error(
              'VaultService: Error decrypting stored biometric password during session restore:',
              decryptError
            );
            // Clear corrupted biometric password and continue with limited session
            await SecureStore.deleteItemAsync('vault_biometricPassword');
          }
        }

        // Fall back to limited session (will prompt for password when needed)
        console.log(
          'VaultService: No stored biometric password available, restoring limited OS biometric session'
        );
        this.masterPassword = null; // Limited session - will prompt for password
        this.isAuthenticated = true;
        this.sessionStartTime = sessionData.timestamp;
        this.sessionToken = sessionToken;

        console.log(
          'VaultService: OS biometric session restored (limited - will prompt for master password when needed)'
        );
        console.log('=== END SESSION RESTORATION DEBUG ===');
        return true;
      }

      // For regular sessions, decrypt the master password from session token
      let masterPassword;
      try {
        masterPassword = this.decryptSessionToken(
          sessionData.encryptedPassword,
          sessionData.salt
        );
        console.log(
          'VaultService: Master password decrypted from session token'
        );
      } catch (decryptError) {
        console.error(
          'VaultService: Failed to decrypt session token:',
          decryptError
        );
        await SecureStore.deleteItemAsync('vault_sessionToken');
        return false;
      }

      // Skip password verification for session restore - already verified during session creation
      console.log(
        'VaultService: Skipping password verification for session restore (already verified)'
      );

      // Restore authentication state
      this.masterPassword = masterPassword;
      this.isAuthenticated = true;
      this.sessionStartTime = sessionData.timestamp;
      this.sessionToken = sessionToken;

      console.log(
        'VaultService: Authentication restored from session token successfully'
      );
      console.log(
        'VaultService: Master password length:',
        this.masterPassword.length
      );
      console.log('=== END SESSION RESTORATION DEBUG ===');
      return true;
    } catch (error) {
      console.error('=== SESSION RESTORATION ERROR ===');
      console.error('VaultService: Error restoring authentication:', error);
      console.error('=== END SESSION RESTORATION ERROR ===');

      // Clear potentially corrupted session token
      try {
        await SecureStore.deleteItemAsync('vault_sessionToken');
      } catch (clearError) {
        console.error('Failed to clear corrupted session token:', clearError);
      }

      return false;
    }
  }

  /**
   * Authenticate with biometric when MFA is disabled
   * Uses stored master password hash to establish vault access
   * @returns {Promise<boolean>} Authentication success
   */
  async authenticateWithBiometric() {
    try {
      console.log('VaultService: Attempting biometric-only authentication...');

      // Check if MFA is disabled (requirement for biometric-only access)
      const mfaEnabled = await getMFAEnabled();
      if (mfaEnabled) {
        console.log(
          'VaultService: MFA is enabled, biometric-only auth not allowed'
        );
        return false;
      }

      // Get the stored master password hash
      const storedHash = await SecureStore.getItemAsync('vault_masterHash');
      if (!storedHash) {
        console.log('VaultService: No master password hash found');
        return false;
      }

      // For biometric-only access, we need to either:
      // 1. Restore from existing session token, OR
      // 2. Use a stored password for first-time biometric setup

      // Try to restore from session token first
      const restored = await this.tryRestoreAuthentication();
      if (restored) {
        console.log(
          'VaultService: Biometric authentication successful via session restore'
        );
        return true;
      }

      // If no session available, check if we have a stored password for biometric access
      const biometricPassword = await SecureStore.getItemAsync(
        'vault_biometricPassword'
      );
      if (biometricPassword) {
        try {
          // Decrypt the stored password and authenticate
          const decryptedPassword =
            this.decryptBiometricPassword(biometricPassword);
          // Password already verified when stored - skip verification for performance
          this.masterPassword = decryptedPassword;
          this.isAuthenticated = true;
          this.sessionStartTime = Date.now();

          // Create session token for future use
          await this.createSessionToken(decryptedPassword);

          console.log(
            'VaultService: Biometric authentication successful via stored password'
          );
          return true;
        } catch (decryptError) {
          console.error(
            'VaultService: Error decrypting biometric password:',
            decryptError
          );
          // Clear corrupted biometric password
          await SecureStore.deleteItemAsync('vault_biometricPassword');
        }
      }

      console.log(
        'VaultService: Biometric authentication failed - no valid session or stored password'
      );
      return false;
    } catch (error) {
      console.error('VaultService: Biometric authentication error:', error);
      return false;
    }
  }

  /**
   * Authenticate with OS-level biometric when MFA is disabled
   * Now attempts to retrieve stored master password, fallback to requesting it
   * @returns {Promise<boolean>} Authentication success
   */
  async authenticateWithOSBiometric() {
    try {
      console.log(
        'VaultService: Attempting OS-level biometric authentication...'
      );

      // Check if MFA is disabled (requirement for OS biometric-only access)
      const mfaEnabled = await getMFAEnabled();
      if (mfaEnabled) {
        console.log(
          'VaultService: MFA is enabled, OS biometric-only auth not allowed'
        );
        return false;
      }

      // Verify vault exists
      const storedHash = await SecureStore.getItemAsync('vault_masterHash');
      if (!storedHash) {
        console.log('VaultService: No master password hash found');
        return false;
      }

      // First, try to get the stored biometric password
      const biometricPassword = await SecureStore.getItemAsync(
        'vault_biometricPassword'
      );

      if (biometricPassword) {
        try {
          // Decrypt the stored password and authenticate normally
          console.log(
            'VaultService: Found stored biometric password, decrypting...'
          );
          const decryptedPassword =
            this.decryptBiometricPassword(biometricPassword);

          // Set the master password and authenticate properly
          this.masterPassword = decryptedPassword;
          this.isAuthenticated = true;
          this.sessionStartTime = Date.now();

          // Create normal session token with actual master password
          await this.createSessionToken(decryptedPassword);

          console.log(
            'VaultService: OS biometric authentication successful with stored password'
          );
          return true;
        } catch (decryptError) {
          console.error(
            'VaultService: Error decrypting stored biometric password:',
            decryptError
          );
          // Clear corrupted biometric password and continue to fallback
          await SecureStore.deleteItemAsync('vault_biometricPassword');
        }
      }

      // If no stored password available, try to restore from session first
      console.log(
        'VaultService: No stored biometric password, trying session restoration...'
      );

      try {
        const sessionRestored = await this.tryRestoreAuthentication();
        if (sessionRestored && this.masterPassword) {
          console.log('VaultService: Session restored with master password');
          return true;
        }
      } catch (sessionError) {
        console.warn('VaultService: Session restoration failed:', sessionError);
      }

      // If no stored password or session available, we cannot proceed with OS biometric authentication
      // The user will need to provide their master password at least once to enable biometric storage
      console.log(
        'VaultService: No stored biometric password or session available, OS biometric authentication cannot proceed without master password'
      );
      
      // Return false to indicate biometric authentication failed
      // This will trigger the fallback logic in LoginScreen to prompt for master password
      return false;
    } catch (error) {
      console.error('VaultService: OS biometric authentication error:', error);
      return false;
    }
  }

  /**
   * Store master password for biometric access (when MFA is disabled)
   * @param {string} password - Master password to store
   */
  async enableBiometricAccess(password) {
    try {
      // Only allow this when MFA is disabled
      const mfaEnabled = await getMFAEnabled();
      if (mfaEnabled) {
        throw new Error(
          'Cannot enable biometric-only access when MFA is enabled'
        );
      }

      // Password verification will be done by caller - skip duplicate check for performance
      console.log(
        'VaultService: Skipping duplicate password verification in enableBiometricAccess'
      );

      // Encrypt and store the password for biometric access
      const encryptedPassword = this.encryptBiometricPassword(password);
      await SecureStore.setItemAsync(
        'vault_biometricPassword',
        encryptedPassword
      );

      console.log('VaultService: Biometric access enabled successfully');
      return true;
    } catch (error) {
      console.error('VaultService: Error enabling biometric access:', error);
      throw error;
    }
  }

  /**
   * Encrypt password for biometric storage
   * @param {string} password - Password to encrypt
   * @returns {string} Encrypted password
   */
  encryptBiometricPassword(password) {
    // Use a simple encryption for biometric storage
    // In production, use proper encryption with device keystore
    const salt = 'biometric_salt_' + Date.now();
    let encrypted = '';
    for (let i = 0; i < password.length; i++) {
      encrypted += String.fromCharCode(
        password.charCodeAt(i) ^ salt.charCodeAt(i % salt.length)
      );
    }
    const combined =
      salt + '|' + Buffer.from(encrypted, 'binary').toString('base64');
    return Buffer.from(combined).toString('base64');
  }

  /**
   * Decrypt password from biometric storage
   * @param {string} encryptedData - Encrypted password data
   * @returns {string} Decrypted password
   */
  decryptBiometricPassword(encryptedData) {
    try {
      const combined = Buffer.from(encryptedData, 'base64').toString();
      const [salt, encryptedPassword] = combined.split('|');
      const encrypted = Buffer.from(encryptedPassword, 'base64').toString(
        'binary'
      );

      let decrypted = '';
      for (let i = 0; i < encrypted.length; i++) {
        decrypted += String.fromCharCode(
          encrypted.charCodeAt(i) ^ salt.charCodeAt(i % salt.length)
        );
      }
      return decrypted;
    } catch (error) {
      console.error(
        'VaultService: Error decrypting biometric password:',
        error
      );
      throw error;
    }
  }

  /**
   * Authenticate with master password and create session token
   * @param {string} password - Master password
   * @returns {Promise<boolean>} Authentication success
   */
  async authenticate(password) {
    return await performanceMonitor.trackLogin(async () => {
      const storedHash = await SecureStore.getItemAsync('vault_masterHash');
      if (!storedHash) {
        throw new Error('No master password set');
      }

      const isValid = await passwordUtils.verifyPassword(password, storedHash);
      if (isValid) {
        this.masterPassword = password;
        this.isAuthenticated = true;
        this.sessionStartTime = Date.now();

        // Create and store session token for restoration
        await this.createSessionToken(password);

        // Critical: Always store master password for biometric access when MFA is disabled
        const mfaEnabled = await getMFAEnabled();
        if (!mfaEnabled) {
          try {
            console.log(
              'VaultService: Storing master password for biometric access (MFA disabled)'
            );
            await this.enableBiometricAccess(password);
          } catch (biometricError) {
            console.warn(
              'VaultService: Could not store password for biometric access:',
              biometricError
            );
            // Don't fail login if biometric storage fails
          }
        }

        // OPTIMIZED: Preload only essential data for instant UI display
        console.log(
          'VaultService: Starting optimized essential data preloading...'
        );

        // Preload essential passwords immediately (favorites + recent)
        const essentialPromise = this.getEssentialPasswordsInstant()
          .then(essentialPasswords => {
            console.log(
              `VaultService: ⚡ Essential passwords loaded: ${essentialPasswords.length} entries`
            );
            return essentialPasswords;
          })
          .catch(error => {
            console.warn('VaultService: Essential password preloading failed:', error);
            return [];
          });

        // Schedule background loading of remaining data
        this.scheduleBackgroundLoading();

        // Schedule background category preloading
        setImmediate(async () => {
          try {
            const categories = await this.getCategories();
            console.log(
              `VaultService: Background - Loaded ${categories.length} categories`
            );
          } catch (error) {
            console.warn(
              'VaultService: Background - Could not load categories:',
              error
            );
          }
        });

        // Store essential promise for instant access by UI components
        this._passwordPreloadPromise = essentialPromise;

        // Schedule background migration (non-blocking)
        setImmediate(async () => {
          try {
            const migratedCount = await this.migrateLegacyEntries();
            if (migratedCount > 0) {
              console.log(
                `Background - Migrated ${migratedCount} entries to optimized format`
              );
            }
          } catch (error) {
            console.warn('Background - Migration failed:', error);
          }
        });

        console.log(
          'VaultService: Authentication successful, session token created'
        );
        return true;
      }
      return false;
    }, { 
      hasBiometric: false, 
      preloadCount: 0 
    });
  }

  /**
   * Create encrypted session token for secure password storage
   * @param {string} password - Master password
   */
  async createSessionToken(password) {
    try {
      const timestamp = Date.now();
      const salt = encryptionService.generateSalt();
      const encryptedPassword = this.encryptSessionToken(password, salt);

      const sessionData = {
        encryptedPassword,
        salt,
        timestamp,
      };

      this.sessionToken = JSON.stringify(sessionData);
      await SecureStore.setItemAsync('vault_sessionToken', this.sessionToken);
    } catch (error) {
      console.error('Error creating session token:', error);
      // Non-critical error, continue without session token
    }
  }

  /**
   * Encrypt password for session token (simple XOR with salt for demo)
   * In production, use proper encryption
   */
  encryptSessionToken(password, salt) {
    try {
      // Simple XOR encryption for session token (in production, use AES)
      let encrypted = '';
      for (let i = 0; i < password.length; i++) {
        encrypted += String.fromCharCode(
          password.charCodeAt(i) ^ salt.charCodeAt(i % salt.length)
        );
      }
      // Use Buffer instead of btoa for React Native compatibility
      return Buffer.from(encrypted, 'binary').toString('base64');
    } catch (error) {
      console.error('Error encrypting session token:', error);
      throw error;
    }
  }

  /**
   * Decrypt password from session token
   */
  decryptSessionToken(encryptedPassword, salt) {
    try {
      // Use Buffer instead of atob for React Native compatibility
      const encrypted = Buffer.from(encryptedPassword, 'base64').toString(
        'binary'
      );
      let decrypted = '';
      for (let i = 0; i < encrypted.length; i++) {
        decrypted += String.fromCharCode(
          encrypted.charCodeAt(i) ^ salt.charCodeAt(i % salt.length)
        );
      }
      return decrypted;
    } catch (error) {
      console.error('Error decrypting session token:', error);
      throw error;
    }
  }

  /**
   * Check if user is authenticated
   * @returns {boolean} Authentication status
   */
  isUserAuthenticated() {
    // Require both isAuthenticated and masterPassword for all sessions
    // We no longer create limited OS biometric sessions
    return this.isAuthenticated && this.masterPassword !== null;
  }

  /**
   * Check if current session is an OS biometric session
   * @returns {boolean} Whether this is an OS biometric session
   */
  isOSBiometricSession() {
    if (!this.sessionToken) return false;
    try {
      const sessionData = JSON.parse(this.sessionToken);
      return sessionData.type === 'os_biometric';
    } catch {
      return false;
    }
  }

  /**
   * Refresh session token to extend session timeout
   * @returns {Promise<boolean>} Refresh success
   */
  async refreshSession() {
    try {
      console.log('VaultService: Attempting to refresh session...');

      // If we have a master password in memory, we can refresh the session
      if (this.masterPassword) {
        console.log(
          'VaultService: Master password available, refreshing session token...'
        );

        // Re-authenticate and create new session token
        this.isAuthenticated = true;
        this.sessionStartTime = Date.now();
        await this.createSessionToken(this.masterPassword);

        console.log('VaultService: Session token refreshed successfully');
        return true;
      }

      // If no master password in memory, try to restore from stored session
      console.log(
        'VaultService: No master password in memory, trying to restore session...'
      );
      const restored = await this.tryRestoreAuthentication();
      if (restored) {
        console.log('VaultService: Session restored successfully');
        return true;
      }

      console.log(
        'VaultService: Cannot refresh session - no authentication available'
      );
      return false;
    } catch (error) {
      console.error('VaultService: Error refreshing session:', error);
      return false;
    }
  }

  /**
   * Check if vault service is fully initialized and ready for operations
   * @returns {boolean} Initialization status
   */
  isVaultReady() {
    return (
      this.isUserAuthenticated() &&
      this.dbService &&
      this.dbService.isInitialized
    );
  }

  /**
   * Check if vault is ready for data operations (requires master password)
   * @returns {boolean} Ready for data operations
   */
  isVaultReadyForDataOperations() {
    // Since we no longer create limited sessions, this is the same as isVaultReady
    return this.isVaultReady();
  }

  /**
   * Upgrade an OS biometric session to a full session with master password
   * @param {string} masterPassword - Master password to verify and store
   * @returns {Promise<boolean>} Upgrade success
   */
  async upgradeOSBiometricSession(masterPassword) {
    try {
      if (!this.isOSBiometricSession()) {
        throw new Error('Not an OS biometric session');
      }

      console.log(
        'VaultService: Upgrading OS biometric session with master password...'
      );

      // Verify the master password
      const storedHash = await SecureStore.getItemAsync('vault_masterHash');
      if (!storedHash) {
        throw new Error('No master password set');
      }

      const bcrypt = require('react-native-bcrypt');
      const isValid = await passwordUtils.verifyPassword(
        masterPassword,
        storedHash
      );
      if (!isValid) {
        throw new Error('Invalid master password');
      }

      // Upgrade the session
      this.masterPassword = masterPassword;
      this.sessionStartTime = Date.now();

      // Create a new session token with the actual master password
      await this.createSessionToken(masterPassword);

      console.log('VaultService: OS biometric session upgraded successfully');
      return true;
    } catch (error) {
      console.error(
        'VaultService: Error upgrading OS biometric session:',
        error
      );
      throw error;
    }
  }

  /**
   * Clear authentication and sensitive data
   */
  async clearSession() {
    this.masterPassword = null;
    this.isAuthenticated = false;
    this.sessionStartTime = null;
    this.sessionToken = null;

    // Clear all caches for security - only when explicitly logging out
    this.entryCache.clear();
    this.cacheTimestamps.clear();
    this.categoryCache.clear();
    this.categoryCacheTimestamps.clear();

    console.log('VaultService: All caches cleared for security');

    // Clear session token from storage
    try {
      await SecureStore.deleteItemAsync('vault_sessionToken');
    } catch (error) {
      console.error('Error clearing session token:', error);
    }
  }

  /**
   * Soft session clear - keeps caches and biometric storage for performance during session restoration
   * Used when MFA is disabled to allow easier re-authentication
   */
  async softClearSession() {
    this.masterPassword = null;
    this.isAuthenticated = false;
    this.sessionStartTime = null;
    this.sessionToken = null;
    // Keep caches intact for faster restoration
    // Keep session token and biometric storage intact when MFA is disabled
    console.log(
      'VaultService: Soft session clear - caches and biometric storage preserved for performance'
    );
  }

  /**
   * Get essential passwords instantly (favorites + recently accessed)
   * @returns {Promise<Array>} Array of essential decrypted password entries
   */
  async getEssentialPasswordsInstant() {
    if (!this.isUserAuthenticated()) {
      throw new Error('User not authenticated');
    }

    return await performanceMonitor.trackVaultLoading(async () => {
      // Check cache first
      const cacheKey = 'essential_passwords';
      const cached = this.entryCache.get(cacheKey);
      const cacheTime = this.cacheTimestamps.get(cacheKey);

      if (cached && cacheTime && Date.now() - cacheTime < this.CACHE_TTL) {
        console.log('🎯 Using cached essential passwords - instant load');
        return cached;
      }

      // Load essential passwords only
      const essentialEntries = await this.dbService.getEssentialPasswords();
      console.log(`⚡ Loading ${essentialEntries.length} essential passwords...`);

      // Decrypt essential passwords
      const decryptedEssential = await Promise.allSettled(
        essentialEntries.map(entry => this.decryptPasswordEntry(entry))
      );

      const finalEntries = decryptedEssential
        .filter(result => result.status === 'fulfilled')
        .map(result => result.value);

      // Cache for instant access
      this.entryCache.set(cacheKey, finalEntries);
      this.cacheTimestamps.set(cacheKey, Date.now());

      console.log(`✅ Essential passwords loaded: ${finalEntries.length} entries`);
      return finalEntries;
    }, {
      loadType: 'essential',
      cacheHit: cached ? true : false
    });
  }

  /**
   * Load remaining passwords in background (non-blocking)
   * @returns {Promise<void>}
   */
  async loadRemainingPasswordsBackground() {
    if (!this.isUserAuthenticated()) {
      return;
    }

    try {
      console.log('🔄 Starting background password loading...');
      
      let page = 0;
      const batchSize = 15;
      let hasMore = true;

      while (hasMore) {
        try {
          // Load batch with pagination
          const batch = await this.dbService.getPasswordEntriesPaginated({
            page,
            limit: batchSize,
            sortBy: 'updated_at',
            sortOrder: 'DESC'
          });

          if (batch.length === 0) {
            hasMore = false;
            break;
          }

          // Decrypt batch in background
          const decryptedBatch = await Promise.allSettled(
            batch.map(entry => this.decryptPasswordEntry(entry))
          );

          // Cache successful decryptions
          decryptedBatch.forEach((result, index) => {
            if (result.status === 'fulfilled') {
              const cacheKey = `entry_${batch[index].id}`;
              this.entryCache.set(cacheKey, result.value);
              this.cacheTimestamps.set(cacheKey, Date.now());
            }
          });

          page++;

          // Yield control to avoid blocking
          await new Promise(resolve => setTimeout(resolve, 50));

        } catch (batchError) {
          console.warn(`Background loading failed for page ${page}:`, batchError);
          page++;
        }
      }

      console.log('✅ Background password loading completed');

    } catch (error) {
      console.warn('Background password loading failed:', error);
    }
  }

  /**
   * Schedule background loading with priority
   */
  scheduleBackgroundLoading() {
    if (this.backgroundLoader) {
      clearTimeout(this.backgroundLoader);
    }
    
    this.backgroundLoader = setTimeout(() => {
      this.loadRemainingPasswordsBackground();
    }, 200); // Start after 200ms
  }

  /**
   * Get preloaded password entries if available, otherwise load fresh data
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of decrypted password entries
   */
  async getPasswordEntriesOptimized(options = {}) {
    // If we have preloaded data and it matches the requested options, use it
    if (
      this._passwordPreloadPromise &&
      JSON.stringify(options) ===
        JSON.stringify({
          sortBy: 'updated_at',
          sortOrder: 'DESC',
        })
    ) {
      console.log(
        'VaultService: Using preloaded password data for instant display'
      );
      try {
        const preloadedData = await this._passwordPreloadPromise;
        this._passwordPreloadPromise = null; // Clear after use
        return preloadedData;
      } catch (error) {
        console.warn(
          'VaultService: Preloaded data failed, falling back to regular loading'
        );
        this._passwordPreloadPromise = null;
      }
    }

    // Fall back to regular loading
    return this.getPasswordEntries(options);
  }

  /**
   * Get all password entries with decryption and optimized caching
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of decrypted password entries
   */
  async getPasswordEntries(options = {}) {
    if (!this.isUserAuthenticated()) {
      throw new Error('User not authenticated');
    }

    // Ensure database is initialized before attempting operations
    if (!this.dbService || !this.dbService.isInitialized) {
      throw new Error('Database not initialized');
    }

    try {
      // Check if we have a cached version of all entries
      const cacheKey = `all_entries_${JSON.stringify(options)}`;
      const cachedEntries = this.entryCache.get(cacheKey);
      const cacheTime = this.cacheTimestamps.get(cacheKey);

      if (
        cachedEntries &&
        cacheTime &&
        Date.now() - cacheTime < this.CACHE_TTL
      ) {
        console.log(
          'VaultService: Using cached password entries for instant load'
        );
        return cachedEntries;
      }

      const encryptedEntries = await this.dbService.getPasswordEntries(options);
      console.log(
        `VaultService: Batch decrypting ${encryptedEntries.length} entries...`
      );

      // Batch decrypt entries with improved error handling
      const decryptedEntries = await Promise.allSettled(
        encryptedEntries.map(async entry => {
          try {
            // Check individual entry cache first
            const entryCacheKey = `entry_${entry.id}`;
            const cached = this.entryCache.get(entryCacheKey);
            const entryTime = this.cacheTimestamps.get(entryCacheKey);

            if (
              cached &&
              entryTime &&
              Date.now() - entryTime < this.CACHE_TTL
            ) {
              return cached;
            }

            const decrypted = await this.decryptPasswordEntry(entry);

            // Cache individual entry
            this.entryCache.set(entryCacheKey, decrypted);
            this.cacheTimestamps.set(entryCacheKey, Date.now());

            return decrypted;
          } catch (decryptError) {
            console.warn(`Failed to decrypt entry ${entry.id}:`, decryptError);
            return {
              ...entry,
              title: decryptError.message?.includes('NEED_MASTER_PASSWORD')
                ? 'Master Password Required'
                : 'Decryption Error',
              username: '',
              decryptionError: true,
              needsMasterPassword: decryptError.message?.includes(
                'NEED_MASTER_PASSWORD'
              ),
            };
          }
        })
      );

      // Process results from Promise.allSettled
      const finalEntries = decryptedEntries.map(result =>
        result.status === 'fulfilled' ? result.value : result.reason
      );

      // Cache the complete result set
      this.entryCache.set(cacheKey, finalEntries);
      this.cacheTimestamps.set(cacheKey, Date.now());

      console.log(
        `VaultService: Successfully loaded and cached ${finalEntries.length} entries`
      );
      return finalEntries;
    } catch (error) {
      console.error('Error getting password entries:', error);
      throw error;
    }
  }

  /**
   * Get a single password entry by ID with decryption and caching
   * @param {number} id - Entry ID
   * @param {number} retryCount - Internal retry counter (default: 0)
   * @returns {Promise<Object>} Decrypted password entry
   */
  async getPasswordEntry(id, retryCount = 0) {
    if (!this.isUserAuthenticated()) {
      throw new Error('User not authenticated');
    }

    // Ensure database is initialized before attempting operations
    if (!this.dbService || !this.dbService.isInitialized) {
      throw new Error('Database not initialized');
    }

    try {
      // Check cache first (skip cache on retries to get fresh data)
      if (retryCount === 0) {
        const cacheKey = `entry_${id}`;
        const cached = this.entryCache.get(cacheKey);
        const cacheTime = this.cacheTimestamps.get(cacheKey);

        if (cached && cacheTime && Date.now() - cacheTime < this.CACHE_TTL) {
          console.log(`VaultService: Using cached entry for ID ${id}`);
          return cached;
        }
      }

      console.log(
        `VaultService: Fetching and decrypting entry for ID ${id} (attempt ${retryCount + 1})`
      );
      const encryptedEntry = await this.dbService.getPasswordById(id);

      if (!encryptedEntry) {
        // Enhanced error handling: Check if entry exists in trash
        try {
          const deletedEntry = await this.checkIfEntryDeleted(id);
          if (deletedEntry) {
            const error = new Error('Password entry was deleted');
            error.deletedEntry = deletedEntry;
            error.isDeleted = true;
            throw error;
          }
        } catch (deletedCheckError) {
          console.warn('Could not check deleted entries:', deletedCheckError);
        }

        throw new Error('Password entry not found');
      }

      // Decrypt and cache the entry
      const decrypted = await this.decryptPasswordEntry(encryptedEntry);

      // Cache the decrypted entry
      const cacheKey = `entry_${id}`;
      this.entryCache.set(cacheKey, decrypted);
      this.cacheTimestamps.set(cacheKey, Date.now());

      return decrypted;
    } catch (error) {
      console.error(
        `VaultService: Error getting password entry (attempt ${retryCount + 1}):`,
        error
      );

      // Don't retry for deleted entries
      if (error.isDeleted) {
        throw error;
      }

      // Retry logic for "Password entry not found" errors (likely race condition)
      if (error.message === 'Password entry not found' && retryCount < 2) {
        const delay = (retryCount + 1) * 250; // 250ms, 500ms delays
        console.log(
          `VaultService: Retrying in ${delay}ms due to potential race condition`
        );

        return new Promise((resolve, reject) => {
          setTimeout(async () => {
            try {
              const result = await this.getPasswordEntry(id, retryCount + 1);
              resolve(result);
            } catch (retryError) {
              reject(retryError);
            }
          }, delay);
        });
      }

      throw error;
    }
  }

  /**
   * Check if a password entry exists in the deleted_passwords table
   * @param {number} id - Original entry ID
   * @returns {Promise<Object|null>} Deleted entry info or null
   */
  async checkIfEntryDeleted(id) {
    try {
      if (!this.dbService || !this.dbService.db) {
        return null;
      }

      const deletedEntry = await this.dbService.db.getFirstAsync(
        `SELECT id, original_password_id, deleted_at, expires_at, encrypted_data 
         FROM deleted_passwords 
         WHERE original_password_id = ? AND expires_at > datetime('now')`,
        [id]
      );

      return deletedEntry || null;
    } catch (error) {
      console.error('Error checking deleted entries:', error);
      return null;
    }
  }

  /**
   * Search password entries by title, username, URL, or notes
   * @param {string} searchTerm - Search term
   * @param {Object} options - Additional filter options
   * @returns {Promise<Array>} Array of matching decrypted entries
   */
  async searchPasswords(searchTerm, options = {}) {
    if (!this.isUserAuthenticated()) {
      throw new Error('User not authenticated');
    }

    try {
      const allEntries = await this.getPasswordEntries(options);

      if (!searchTerm || !searchTerm.trim()) {
        return allEntries;
      }

      const searchLower = searchTerm.toLowerCase().trim();

      return allEntries.filter(entry => {
        if (entry.decryptionError) return false;

        return (
          (entry.title && entry.title.toLowerCase().includes(searchLower)) ||
          (entry.username &&
            entry.username.toLowerCase().includes(searchLower)) ||
          (entry.url && entry.url.toLowerCase().includes(searchLower)) ||
          (entry.notes && entry.notes.toLowerCase().includes(searchLower))
        );
      });
    } catch (error) {
      console.error('Error searching passwords:', error);
      throw error;
    }
  }

  /**
   * Get password entries by category with aggressive caching
   * @param {number} categoryId - Category ID
   * @returns {Promise<Array>} Array of decrypted password entries
   */
  async getPasswordsByCategory(categoryId) {
    if (!this.isUserAuthenticated()) {
      throw new Error('User not authenticated');
    }

    // Ensure database is initialized before attempting operations
    if (!this.dbService || !this.dbService.isInitialized) {
      throw new Error('Database not initialized');
    }

    try {
      // Check category cache first for instant loading
      const cacheKey = `category_${categoryId}`;
      const cached = this.categoryCache.get(cacheKey);
      const cacheTime = this.categoryCacheTimestamps.get(cacheKey);

      if (
        cached &&
        cacheTime &&
        Date.now() - cacheTime < this.CATEGORY_CACHE_TTL
      ) {
        console.log(
          `VaultService: Using cached category ${categoryId} passwords (instant load)`
        );
        return cached;
      }

      console.log(
        `VaultService: Loading and caching category ${categoryId} passwords...`
      );

      // Load fresh data
      const passwords = await this.getPasswordEntries({ categoryId });

      // Cache the results for future instant access
      this.categoryCache.set(cacheKey, passwords);
      this.categoryCacheTimestamps.set(cacheKey, Date.now());

      console.log(
        `VaultService: Cached ${passwords.length} passwords for category ${categoryId}`
      );
      return passwords;
    } catch (error) {
      console.error(
        `VaultService: Error getting passwords for category ${categoryId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get favorite password entries
   * @returns {Promise<Array>} Array of favorite decrypted entries
   */
  async getFavoritePasswords() {
    return await this.getPasswordEntries({ isFavorite: true });
  }

  /**
   * Get all categories with password counts
   * @returns {Promise<Array>} Array of categories
   */
  async getCategories() {
    // Ensure database is initialized before attempting operations
    if (!this.dbService || !this.dbService.isInitialized) {
      throw new Error('Database not initialized');
    }

    try {
      return await this.dbService.getCategories({
        includePasswordCount: true,
      });
    } catch (error) {
      console.error('Error getting categories:', error);
      throw error;
    }
  }

  /**
   * Get database statistics
   * @returns {Promise<Object>} Database statistics
   */
  async getVaultStats() {
    try {
      return await this.dbService.getDatabaseStats();
    } catch (error) {
      console.error('Error getting vault stats:', error);
      throw error;
    }
  }

  /**
   * Add a new password entry
   * @param {Object} passwordEntry - Password entry data
   * @returns {Promise<number>} Inserted entry ID
   */
  async addPasswordEntry(passwordEntry) {
    if (!this.isUserAuthenticated()) {
      throw new Error('User not authenticated');
    }

    // Ensure master password is available for encryption
    if (!this.masterPassword) {
      console.log(
        'VaultService: Master password not available, attempting to restore authentication...'
      );
      const restored = await this.tryRestoreAuthentication();
      if (!restored) {
        throw new Error('Authentication could not be restored');
      }

      // If this is an OS biometric session, we need the user to provide master password
      if (this.isOSBiometricSession()) {
        throw new Error(
          'NEED_MASTER_PASSWORD: OS biometric session requires master password for data operations'
        );
      }

      if (!this.masterPassword) {
        throw new Error(
          'Master password not available - authentication required'
        );
      }
    }

    try {
      const newId = await this.dbService.addPassword(
        passwordEntry,
        this.masterPassword
      );

      // Invalidate caches to ensure fresh data when fetching the new entry
      // Clear all entries cache (affects filtering and main list)
      for (const [key] of this.entryCache) {
        if (key.startsWith('all_entries_')) {
          this.entryCache.delete(key);
          this.cacheTimestamps.delete(key);
        }
      }

      // Clear category cache for updated counts
      this.categoryCache.clear();
      this.categoryCacheTimestamps.clear();

      console.log(
        `VaultService: Cache invalidated after adding entry ${newId} - ensures fresh data for immediate UI update`
      );

      return newId;
    } catch (error) {
      console.error('Error adding password entry:', error);
      throw error;
    }
  }

  /**
   * Update a password entry
   * @param {number} id - Entry ID
   * @param {Object} passwordEntry - Updated password entry data
   * @returns {Promise<boolean>} Update success
   */
  async updatePasswordEntry(id, passwordEntry) {
    if (!this.isUserAuthenticated()) {
      throw new Error('User not authenticated');
    }

    // Ensure master password is available for encryption
    if (!this.masterPassword) {
      console.log(
        'VaultService: Master password not available for update, attempting to restore authentication...'
      );
      const restored = await this.tryRestoreAuthentication();
      if (!restored) {
        throw new Error('Authentication could not be restored');
      }

      // If this is an OS biometric session, we need the user to provide master password
      if (this.isOSBiometricSession()) {
        throw new Error(
          'NEED_MASTER_PASSWORD: OS biometric session requires master password for data operations'
        );
      }

      if (!this.masterPassword) {
        throw new Error(
          'Master password not available - authentication required'
        );
      }
    }

    try {
      const result = await this.dbService.updatePasswordEntry(
        id,
        passwordEntry,
        this.masterPassword
      );

      // Intelligently invalidate caches
      const entryCacheKey = `entry_${id}`;
      this.entryCache.delete(entryCacheKey);
      this.cacheTimestamps.delete(entryCacheKey);

      // Clear all entries cache (affects filtering)
      for (const [key] of this.entryCache) {
        if (key.startsWith('all_entries_')) {
          this.entryCache.delete(key);
          this.cacheTimestamps.delete(key);
        }
      }

      // Clear category cache for any category (entry might have changed categories)
      this.categoryCache.clear();
      this.categoryCacheTimestamps.clear();

      console.log(
        `VaultService: Smart cache invalidation for entry ${id} completed`
      );

      return result;
    } catch (error) {
      console.error('Error updating password entry:', error);
      throw error;
    }
  }

  /**
   * Delete a password entry (move to trash)
   * @param {number} id - Entry ID
   * @param {number} retentionDays - Days to keep in trash (optional, uses user setting)
   * @returns {Promise<boolean>} Delete success
   */
  async deletePasswordEntry(id, retentionDays = null) {
    if (!this.isUserAuthenticated()) {
      throw new Error('User not authenticated');
    }

    try {
      // Get user's retention setting if not provided
      if (retentionDays === null) {
        retentionDays = await this.getUserRetentionDays();
      }

      const result = await this.dbService.deletePasswordEntry(
        id,
        retentionDays
      );

      // Critical: Invalidate all caches after deletion to prevent stale state
      const entryCacheKey = `entry_${id}`;
      this.entryCache.delete(entryCacheKey);
      this.cacheTimestamps.delete(entryCacheKey);

      // Clear all entries cache (affects filtering and main list)
      for (const [key] of this.entryCache) {
        if (key.startsWith('all_entries_')) {
          this.entryCache.delete(key);
          this.cacheTimestamps.delete(key);
        }
      }

      // Clear category cache for updated counts
      this.categoryCache.clear();
      this.categoryCacheTimestamps.clear();

      console.log(
        `VaultService: Cache invalidated after deleting entry ${id} - prevents "Password entry not found" errors`
      );

      return result;
    } catch (error) {
      console.error('Error deleting password entry:', error);
      throw error;
    }
  }

  /**
   * Get user's trash retention setting
   * @returns {Promise<number>} Retention days
   */
  async getUserRetentionDays() {
    try {
      const AsyncStorage =
        require('@react-native-async-storage/async-storage').default;
      const settings = await AsyncStorage.getItem('userSettings');
      if (settings) {
        const parsedSettings = JSON.parse(settings);
        return parsedSettings.trashRetentionDays || 30;
      }
      return 30; // Default to 30 days
    } catch (error) {
      console.warn('Error getting user retention setting:', error);
      return 30; // Default to 30 days
    }
  }

  /**
   * Get all deleted passwords from trash
   * @returns {Promise<Array>} Array of deleted password entries
   */
  async getAllDeletedPasswords() {
    if (!this.isUserAuthenticated()) {
      throw new Error('User not authenticated');
    }

    try {
      // Run cleanup of corrupted entries in the background (non-blocking)
      this.dbService.cleanupCorruptedDeletedPasswords().catch(error => {
        console.warn(
          'Background cleanup of corrupted deleted passwords failed:',
          error
        );
      });

      return await this.dbService.getAllDeletedPasswords();
    } catch (error) {
      console.error('Error getting deleted passwords:', error);
      throw error;
    }
  }

  /**
   * Restore password from trash
   * @param {number} deletedPasswordId - Deleted password ID
   * @returns {Promise<number>} Restored password ID
   */
  async restorePasswordFromTrash(deletedPasswordId) {
    if (!this.isUserAuthenticated()) {
      throw new Error('User not authenticated');
    }

    try {
      return await this.dbService.restorePasswordFromTrash(deletedPasswordId);
    } catch (error) {
      console.error('Error restoring password from trash:', error);
      throw error;
    }
  }

  /**
   * Permanently delete password from trash
   * @param {number} deletedPasswordId - Deleted password ID
   * @returns {Promise<boolean>} Delete success
   */
  async permanentlyDeletePassword(deletedPasswordId) {
    if (!this.isUserAuthenticated()) {
      throw new Error('User not authenticated');
    }

    try {
      return await this.dbService.permanentlyDeletePassword(deletedPasswordId);
    } catch (error) {
      console.error('Error permanently deleting password:', error);
      throw error;
    }
  }

  /**
   * Empty trash
   * @param {boolean} deleteAll - Delete all items or just expired ones
   * @returns {Promise<number>} Number of items deleted
   */
  async emptyTrash(deleteAll = false) {
    if (!this.isUserAuthenticated()) {
      throw new Error('User not authenticated');
    }

    try {
      return await this.dbService.emptyTrash(deleteAll);
    } catch (error) {
      console.error('Error emptying trash:', error);
      throw error;
    }
  }

  /**
   * Cleanup expired trash items
   * @returns {Promise<number>} Number of items cleaned up
   */
  async cleanupExpiredTrashItems() {
    if (!this.isUserAuthenticated()) {
      throw new Error('User not authenticated');
    }

    try {
      return await this.dbService.cleanupExpiredTrashItems();
    } catch (error) {
      console.error('Error cleaning up expired trash items:', error);
      throw error;
    }
  }

  /**
   * Auto-cleanup expired trash items (can run without authentication)
   * @returns {Promise<number>} Number of items cleaned up
   */
  async autoCleanupExpiredTrash() {
    try {
      const cleanedCount = await this.dbService.cleanupExpiredTrashItems();
      if (cleanedCount > 0) {
        console.log(
          `Auto-cleanup: Removed ${cleanedCount} expired items from trash`
        );
      }
      return cleanedCount;
    } catch (error) {
      console.warn('Auto-cleanup warning (non-critical):', error.message);
      return 0;
    }
  }

  /**
   * Toggle favorite status of a password entry
   * @param {number} id - Entry ID
   * @returns {Promise<boolean>} Update success
   */
  async toggleFavorite(id) {
    if (!this.isUserAuthenticated()) {
      throw new Error('User not authenticated');
    }

    try {
      // Get current entry
      const entry = await this.dbService.getPasswordById(id);
      if (!entry) {
        throw new Error('Entry not found');
      }

      // Decrypt entry first
      const decrypted = await this.decryptPasswordEntry(entry);

      // Toggle favorite status
      decrypted.isFavorite = !decrypted.isFavorite;

      // Update entry
      return await this.updatePasswordEntry(id, decrypted);
    } catch (error) {
      console.error('Error toggling favorite:', error);
      throw error;
    }
  }

  /**
   * Decrypt a password entry using optimized single-payload approach
   * @param {Object} encryptedEntry - Encrypted password entry
   * @returns {Promise<Object>} Decrypted password entry
   */
  async decryptPasswordEntry(encryptedEntry) {
    if (!this.isUserAuthenticated()) {
      throw new Error('User not authenticated');
    }

    try {
      // Verify master password is available
      if (!this.masterPassword) {
        console.log(
          'VaultService: Master password not available for decryption, attempting to restore authentication...'
        );
        const restored = await this.tryRestoreAuthentication();
        if (!restored) {
          throw new Error('Authentication could not be restored');
        }

        // Since we no longer create limited OS biometric sessions, this should not happen
        // If we reach here without a master password, something went wrong with authentication
        if (!this.masterPassword) {
          throw new Error(
            'Master password not available - authentication required'
          );
        }
      }

      // Check if this is legacy format (has individual encrypted fields)
      if (encryptedEntry.title_encrypted && !encryptedEntry.encrypted_payload) {
        return await this.decryptPasswordEntryLegacy(encryptedEntry);
      }

      // Use optimized single-payload decryption
      if (!encryptedEntry.encrypted_payload) {
        throw new Error('No encrypted payload found in entry');
      }

      const parsedPayload = JSON.parse(encryptedEntry.encrypted_payload);
      return encryptionService.decryptPasswordEntryOptimized(
        {
          ...encryptedEntry,
          encrypted_payload: parsedPayload,
        },
        this.masterPassword
      );
    } catch (error) {
      console.error('Error decrypting password entry:', error);
      console.error('Entry ID:', encryptedEntry.id);
      throw error;
    }
  }

  /**
   * Decrypt password entry using legacy format (for backward compatibility)
   * @param {Object} encryptedEntry - Encrypted password entry in legacy format
   * @returns {Promise<Object>} Decrypted password entry
   */
  async decryptPasswordEntryLegacy(encryptedEntry) {
    try {
      console.log('Using legacy decryption for entry:', encryptedEntry.id);

      const decrypted = {
        id: encryptedEntry.id,
        title: '',
        username: '',
        password: '',
        url: '',
        notes: '',
        categoryId: encryptedEntry.category_id,
        categoryName: encryptedEntry.category_name,
        categoryColor: encryptedEntry.category_color,
        categoryIcon: encryptedEntry.category_icon,
        isFavorite: encryptedEntry.is_favorite === 1,
        createdAt: encryptedEntry.created_at,
        updatedAt: encryptedEntry.updated_at,
        lastAccessed: encryptedEntry.last_accessed,
      };

      // Safely decrypt each field
      const decryptField = fieldData => {
        if (!fieldData || fieldData === 'null' || fieldData === '') return '';
        try {
          const parsed = JSON.parse(fieldData);
          return encryptionService.decrypt(parsed, this.masterPassword);
        } catch (error) {
          console.warn('Failed to decrypt field:', error.message);
          return '';
        }
      };

      decrypted.title = decryptField(encryptedEntry.title_encrypted);
      decrypted.username = decryptField(encryptedEntry.username_encrypted);
      decrypted.password = decryptField(encryptedEntry.password_encrypted);
      decrypted.url = decryptField(encryptedEntry.url_encrypted);
      decrypted.notes = decryptField(encryptedEntry.notes_encrypted);

      return decrypted;
    } catch (error) {
      console.error('Legacy decryption failed:', error);
      throw error;
    }
  }

  /**
   * Update last accessed timestamp for a password entry
   * @param {number} id - Entry ID
   * @returns {Promise<boolean>} Update success status
   */
  async updateLastAccessed(id) {
    try {
      const success = await this.dbService.updateLastAccessed(id);

      // Clear cache for this entry if it exists to ensure fresh data
      this.entryCache.delete(id);
      this.cacheTimestamps.delete(id);

      return success;
    } catch (error) {
      console.error('Error updating last accessed:', error);
      return false;
    }
  }

  /**
   * Bulk re-encrypt vault data with new master password (optimized for password reset)
   * @param {string} newPassword - New master password
   * @param {string} recoveryKey - Recovery phrase or old password for decryption
   * @param {Function} progressCallback - Progress callback function
   * @returns {Promise<boolean>} Success status
   */
  async bulkReencryptVault(newPassword, recoveryKey, progressCallback) {
    try {
      console.log('🔄 VaultService: Starting optimized bulk vault re-encryption...');
      
      // Initialize vault service if needed
      if (!this.dbService || !this.dbService.isInitialized) {
        await this.initialize();
      }

      // Get all password entries from database
      const allEntries = await this.dbService.db.getAllAsync(
        'SELECT id, encrypted_payload FROM passwords'
      );

      console.log(`📊 Found ${allEntries.length} entries to re-encrypt`);

      if (allEntries.length === 0) {
        console.log('✅ No passwords to re-encrypt');
        if (progressCallback) progressCallback(100);
        return true;
      }

      // Use encryption service's bulk re-encrypt method
      const reencryptedEntries = await encryptionService.bulkReencrypt(
        allEntries,
        recoveryKey,
        newPassword,
        progressCallback
      );

      console.log(`🔄 Updating ${reencryptedEntries.length} entries in database...`);

      // Bulk update database in transaction
      await this.dbService.executeTransaction(async () => {
        for (const { id, data } of reencryptedEntries) {
          await this.dbService.db.runAsync(
            'UPDATE passwords SET encrypted_payload = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [JSON.stringify(data.encrypted_payload), id]
          );
        }
      });

      // Clear all caches since encryption has changed
      this.clearAllCaches();
      
      // Clear encryption key cache since password changed
      encryptionService.clearKeyCache();

      console.log('✅ VaultService: Bulk re-encryption completed successfully');
      return true;

    } catch (error) {
      console.error('❌ VaultService: Bulk re-encryption failed:', error);
      throw new Error(`Bulk re-encryption failed: ${error.message}`);
    }
  }

  /**
   * Clear all caches (internal method)
   */
  clearAllCaches() {
    this.entryCache.clear();
    this.cacheTimestamps.clear();
    this.categoryCache.clear();
    this.categoryCacheTimestamps.clear();
    console.log('🗑️ All VaultService caches cleared');
  }

  /**
   * Change master password
   * @param {string} oldPassword - Current master password
   * @param {string} newPassword - New master password
   * @returns {Promise<boolean>} Success status
   */
  async changeMasterPassword(oldPassword, newPassword) {
    if (!this.isUserAuthenticated()) {
      throw new Error('User not authenticated');
    }

    try {
      console.log('VaultService: Starting master password change...');

      // Verify old password
      const storedHash = await SecureStore.getItemAsync('vault_masterHash');
      if (!storedHash) {
        throw new Error('No master password found');
      }

      const isOldPasswordValid = await passwordUtils.verifyPassword(
        oldPassword,
        storedHash
      );
      if (!isOldPasswordValid) {
        throw new Error('Invalid current password');
      }

      // Ensure the vault service is authenticated with the old password
      if (this.masterPassword !== oldPassword) {
        throw new Error('Vault service authentication mismatch');
      }

      console.log(
        'VaultService: Old password verified, starting data re-encryption...'
      );

      // Get all password entries
      const allEntries = await this.dbService.getPasswordEntries();
      console.log(
        `VaultService: Found ${allEntries.length} entries to re-encrypt`
      );

      // Create new password hash
      const saltRounds = 12;
      const newHash = await passwordUtils.hashPassword(newPassword, saltRounds);

      // Re-encrypt all entries with new password
      const reEncryptedEntries = [];
      for (const entry of allEntries) {
        try {
          console.log(`VaultService: Re-encrypting entry ${entry.id}...`);

          // Decrypt with old password
          const decryptedEntry = await this.decryptPasswordEntry(entry);

          // Re-encrypt with new password
          const reEncryptedData =
            encryptionService.encryptPasswordEntryOptimized(
              {
                title: decryptedEntry.title,
                username: decryptedEntry.username,
                password: decryptedEntry.password,
                url: decryptedEntry.url,
                notes: decryptedEntry.notes,
                categoryId: decryptedEntry.categoryId,
                isFavorite: decryptedEntry.isFavorite,
              },
              newPassword
            );

          reEncryptedEntries.push({
            id: entry.id,
            encryptedPayload: reEncryptedData.encrypted_payload,
          });
        } catch (error) {
          console.error(`Failed to re-encrypt entry ${entry.id}:`, error);
          throw new Error(
            `Failed to re-encrypt password entry: ${error.message}`
          );
        }
      }

      console.log(
        'VaultService: All entries re-encrypted, updating database...'
      );

      // Update all entries in database with new encrypted data
      for (const entry of reEncryptedEntries) {
        await this.dbService.db.runAsync(
          `UPDATE passwords 
           SET encrypted_payload = ?, 
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [JSON.stringify(entry.encryptedPayload), entry.id]
        );
      }

      // Update master password hash
      await SecureStore.setItemAsync('vault_masterHash', newHash);

      // Update authentication state with new password
      this.masterPassword = newPassword;

      // Create new session token with new password
      await this.createSessionToken(newPassword);

      console.log(
        'VaultService: Master password change completed successfully'
      );
      return true;
    } catch (error) {
      console.error('VaultService: Error changing master password:', error);
      throw error;
    }
  }

  /**
   * Migrate legacy password entries to optimized format
   * @returns {Promise<number>} Number of entries migrated
   */
  async migrateLegacyEntries() {
    if (!this.dbService.db) {
      throw new Error('Database not initialized');
    }
    if (!this.isUserAuthenticated()) {
      throw new Error('User not authenticated');
    }

    try {
      console.log('Starting migration of legacy password entries...');

      // Get all entries that have legacy format (title_encrypted exists but not encrypted_payload)
      const legacyEntries = await this.dbService.db.getAllAsync(
        `SELECT * FROM passwords WHERE title_encrypted IS NOT NULL AND encrypted_payload IS NULL`
      );

      let migratedCount = 0;

      for (const entry of legacyEntries) {
        try {
          console.log(`Migrating entry ${entry.id}...`);

          // Decrypt using legacy method
          const decryptedEntry = await this.decryptPasswordEntryLegacy(entry);

          // Re-encrypt using optimized method
          const optimizedEntry =
            encryptionService.encryptPasswordEntryOptimized(
              {
                title: decryptedEntry.title,
                username: decryptedEntry.username,
                password: decryptedEntry.password,
                url: decryptedEntry.url,
                notes: decryptedEntry.notes,
                categoryId: decryptedEntry.categoryId,
                isFavorite: decryptedEntry.isFavorite,
              },
              this.masterPassword
            );

          // Update database with new format
          await this.dbService.db.runAsync(
            `UPDATE passwords 
             SET encrypted_payload = ?, 
                 title_encrypted = NULL, username_encrypted = NULL, 
                 password_encrypted = NULL, url_encrypted = NULL, notes_encrypted = NULL,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [JSON.stringify(optimizedEntry.encrypted_payload), entry.id]
          );

          migratedCount++;
          console.log(`Successfully migrated entry ${entry.id}`);
        } catch (error) {
          console.error(`Failed to migrate entry ${entry.id}:`, error);
          // Continue with other entries even if one fails
        }
      }

      console.log(
        `Migration completed: ${migratedCount}/${legacyEntries.length} entries migrated`
      );
      return migratedCount;
    } catch (error) {
      console.error('Migration failed:', error);
      throw error;
    }
  }

  /**
   * Request and store master password for OS biometric sessions
   * @param {string} masterPassword - Master password provided by user
   * @returns {Promise<boolean>} Success status
   */
  async provideMasterPasswordForBiometric(masterPassword) {
    try {
      if (!this.isOSBiometricSession()) {
        throw new Error('Not an OS biometric session');
      }

      // Verify the master password
      const storedHash = await SecureStore.getItemAsync('vault_masterHash');
      if (!storedHash) {
        throw new Error('No master password set');
      }

      const isValid = await passwordUtils.verifyPassword(
        masterPassword,
        storedHash
      );
      if (!isValid) {
        throw new Error('Invalid master password');
      }

      // Store the password in memory and enable biometric storage
      this.masterPassword = masterPassword;

      // Store for future biometric access (when MFA is disabled)
      const mfaEnabled = await getMFAEnabled();
      if (!mfaEnabled) {
        try {
          await this.enableBiometricAccess(masterPassword);
          console.log(
            'VaultService: Biometric access re-enabled after password provision'
          );
        } catch (biometricError) {
          console.warn(
            'VaultService: Could not re-enable biometric access:',
            biometricError
          );
          // Continue anyway - we have the password in memory
        }
      }

      // Update session token to include the actual password
      await this.createSessionToken(masterPassword);

      console.log(
        'VaultService: Master password provided and stored for biometric session'
      );
      return true;
    } catch (error) {
      console.error(
        'VaultService: Error providing master password for biometric session:',
        error
      );
      throw error;
    }
  }

  /**
   * Clear biometric access (when MFA is enabled or biometrics are disabled)
   */
  async clearBiometricAccess() {
    try {
      await SecureStore.deleteItemAsync('vault_biometricPassword');
      console.log('VaultService: Biometric access cleared');
    } catch (error) {
      console.error('VaultService: Error clearing biometric access:', error);
    }
  }

  /**
   * Get all passwords for export purposes
   * @returns {Promise<Array>} Array of decrypted password entries
   */
  async getAllPasswords() {
    if (!this.isUserAuthenticated()) {
      throw new Error('User not authenticated');
    }

    try {
      const entries = await this.dbService.getAllPasswords();
      const decryptedEntries = [];

      for (const entry of entries) {
        try {
          const decrypted = await this.decryptPasswordEntry(entry);
          decryptedEntries.push({
            website: decrypted.title,
            username: decrypted.username,
            password: decrypted.password,
            category: decrypted.category || 'General',
            notes: decrypted.notes || '',
            favorite: decrypted.isFavorite || false,
            url: decrypted.url || '',
          });
        } catch (decryptError) {
          console.warn('Failed to decrypt entry for export:', decryptError);
          // Skip entries that can't be decrypted
        }
      }

      return decryptedEntries;
    } catch (error) {
      console.error('Error getting all passwords for export:', error);
      throw error;
    }
  }

  /**
   * Find duplicate password by website and username
   * @param {string} website - Website/title to check
   * @param {string} username - Username to check
   * @returns {Promise<boolean>} Whether duplicate exists
   */
  async findDuplicatePassword(website, username) {
    if (!this.isUserAuthenticated()) {
      throw new Error('User not authenticated');
    }

    try {
      const entries = await this.dbService.getAllPasswords();

      for (const entry of entries) {
        try {
          const decrypted = await this.decryptPasswordEntry(entry);
          if (
            decrypted.title.toLowerCase() === website.toLowerCase() &&
            decrypted.username.toLowerCase() === username.toLowerCase()
          ) {
            return true;
          }
        } catch (decryptError) {
          // Skip entries that can't be decrypted
          continue;
        }
      }

      return false;
    } catch (error) {
      console.error('Error finding duplicate password:', error);
      throw error;
    }
  }

  /**
   * Clear all passwords from vault (for import replace mode)
   * @returns {Promise<number>} Number of deleted entries
   */
  async clearAllPasswords() {
    if (!this.isUserAuthenticated()) {
      throw new Error('User not authenticated');
    }

    try {
      const deletedCount = await this.dbService.deleteAllPasswords();

      // Clear all caches
      this.entryCache.clear();
      this.cacheTimestamps.clear();
      this.categoryCache.clear();
      this.categoryCacheTimestamps.clear();

      console.log(`VaultService: Cleared ${deletedCount} passwords from vault`);
      return deletedCount;
    } catch (error) {
      console.error('Error clearing all passwords:', error);
      throw error;
    }
  }

  /**
   * Add password entry (alias for import compatibility)
   * @param {Object} passwordData - Password data
   * @returns {Promise<number>} Inserted entry ID
   */
  async addPassword(passwordData) {
    if (!this.isUserAuthenticated()) {
      throw new Error('User not authenticated');
    }

    // Ensure master password is available for encryption
    if (!this.masterPassword) {
      console.log(
        'VaultService: Master password not available for addPassword, attempting to restore authentication...'
      );
      const restored = await this.tryRestoreAuthentication();
      if (!restored) {
        throw new Error('Authentication could not be restored');
      }

      // If this is an OS biometric session, we need the user to provide master password
      if (this.isOSBiometricSession()) {
        throw new Error(
          'NEED_MASTER_PASSWORD: OS biometric session requires master password for data operations'
        );
      }

      if (!this.masterPassword) {
        throw new Error(
          'Master password not available - authentication required'
        );
      }
    }

    try {
      // Convert import format to internal format
      const passwordEntry = {
        title: passwordData.website || passwordData.title,
        username: passwordData.username || '',
        password: passwordData.password,
        url: passwordData.url || '',
        notes: passwordData.notes || '',
        categoryId: passwordData.categoryId || 1, // Default to General category
        isFavorite: passwordData.favorite || false,
      };

      return await this.addPasswordEntry(passwordEntry);
    } catch (error) {
      console.error('Error adding password:', error);
      throw error;
    }
  }
}

// Export singleton instance
const vaultService = new VaultService();
export default vaultService;
