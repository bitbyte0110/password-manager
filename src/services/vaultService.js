import * as SecureStore from 'expo-secure-store';
import bcrypt from 'bcryptjs';
import { Buffer } from 'buffer';
import databaseService from './databaseService';
import encryptionService from './encryptionService';
import { getMFAEnabled } from '../utils/authUtils';

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
    this.CACHE_TTL = 30000; // 30 seconds cache TTL
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
      await this.tryRestoreAuthentication();

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
        'VaultService: Session token is valid, decrypting master password...'
      );

      // Decrypt the master password from session token
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
    try {
      const storedHash = await SecureStore.getItemAsync('vault_masterHash');
      if (!storedHash) {
        throw new Error('No master password set');
      }

      const isValid = await bcrypt.compare(password, storedHash);
      if (isValid) {
        this.masterPassword = password;
        this.isAuthenticated = true;
        this.sessionStartTime = Date.now();

        // Create and store session token for restoration
        await this.createSessionToken(password);

        // Move non-critical operations to background for instant login
        console.log(
          'VaultService: Scheduling background operations for optimal performance'
        );

        // Schedule background biometric setup (non-blocking)
        setImmediate(async () => {
          const mfaEnabled = await getMFAEnabled();
          if (!mfaEnabled) {
            try {
              await this.enableBiometricAccess(password);
              console.log(
                'VaultService: Background - Biometric access enabled'
              );
            } catch (error) {
              console.warn(
                'VaultService: Background - Could not enable biometric access:',
                error
              );
            }
          }
        });

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
    } catch (error) {
      console.error('Authentication error:', error);
      throw error;
    }
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
    return this.isAuthenticated && this.masterPassword !== null;
  }

  /**
   * Clear authentication and sensitive data
   */
  async clearSession() {
    this.masterPassword = null;
    this.isAuthenticated = false;
    this.sessionStartTime = null;
    this.sessionToken = null;

    // Clear entry cache for security
    this.entryCache.clear();
    this.cacheTimestamps.clear();

    // Clear session token from storage
    try {
      await SecureStore.deleteItemAsync('vault_sessionToken');
    } catch (error) {
      console.error('Error clearing session token:', error);
    }
  }

  /**
   * Get all password entries with decryption
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of decrypted password entries
   */
  async getPasswordEntries(options = {}) {
    if (!this.isUserAuthenticated()) {
      throw new Error('User not authenticated');
    }

    try {
      const encryptedEntries = await this.dbService.getPasswordEntries(options);

      // Decrypt entries for display
      const decryptedEntries = [];
      for (const entry of encryptedEntries) {
        try {
          const decrypted = await this.decryptPasswordEntry(entry);
          decryptedEntries.push(decrypted);
        } catch (decryptError) {
          console.warn(`Failed to decrypt entry ${entry.id}:`, decryptError);
          // Add entry with encryption error indicator
          decryptedEntries.push({
            ...entry,
            title: 'Decryption Error',
            username: '',
            decryptionError: true,
          });
        }
      }

      return decryptedEntries;
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
   * Get password entries by category
   * @param {number} categoryId - Category ID
   * @returns {Promise<Array>} Array of decrypted password entries
   */
  async getPasswordsByCategory(categoryId) {
    return await this.getPasswordEntries({ categoryId });
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

    try {
      return await this.dbService.addPassword(
        passwordEntry,
        this.masterPassword
      );
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

    try {
      const result = await this.dbService.updatePasswordEntry(
        id,
        passwordEntry,
        this.masterPassword
      );

      // Invalidate cache for this entry
      const cacheKey = `entry_${id}`;
      this.entryCache.delete(cacheKey);
      this.cacheTimestamps.delete(cacheKey);
      console.log(`VaultService: Cache invalidated for entry ${id}`);

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

      return await this.dbService.deletePasswordEntry(id, retentionDays);
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
        console.log('Attempting to restore authentication...');
        const restored = await this.tryRestoreAuthentication();
        if (!restored || !this.masterPassword) {
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
   * @returns {Promise<void>}
   */
  async updateLastAccessed(id) {
    try {
      await this.dbService.getPasswordById(id); // This automatically updates last_accessed
    } catch (error) {
      console.error('Error updating last accessed:', error);
    }
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

      const isOldPasswordValid = await bcrypt.compare(oldPassword, storedHash);
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
      const newHash = await bcrypt.hash(newPassword, saltRounds);

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

      // Clear caches
      this.entryCache.clear();
      this.cacheTimestamps.clear();

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
