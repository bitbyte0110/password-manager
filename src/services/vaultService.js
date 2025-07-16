import * as SecureStore from 'expo-secure-store';
import bcrypt from 'bcryptjs';
import { Buffer } from 'buffer';
import databaseService from './databaseService';
import encryptionService from './encryptionService';

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

      // Verify session token is still valid (within 2 minutes)
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
      const SESSION_TIMEOUT = 2 * 60 * 1000; // 2 minutes

      console.log(
        `VaultService: Session age: ${Math.round(sessionAge / 1000)}s (timeout: ${SESSION_TIMEOUT / 1000}s)`
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

      // Verify the password is still valid
      const storedHash = await SecureStore.getItemAsync('vault_masterHash');
      if (!storedHash) {
        console.log('VaultService: No master password hash found');
        return false;
      }

      console.log(
        'VaultService: Verifying master password against stored hash...'
      );

      const isValid = await bcrypt.compare(masterPassword, storedHash);
      if (!isValid) {
        console.log('VaultService: Session token contains invalid password');
        await SecureStore.deleteItemAsync('vault_sessionToken');
        return false;
      }

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
      return await this.dbService.updatePasswordEntry(
        id,
        passwordEntry,
        this.masterPassword
      );
    } catch (error) {
      console.error('Error updating password entry:', error);
      throw error;
    }
  }

  /**
   * Delete a password entry
   * @param {number} id - Entry ID
   * @returns {Promise<boolean>} Delete success
   */
  async deletePasswordEntry(id) {
    if (!this.isUserAuthenticated()) {
      throw new Error('User not authenticated');
    }

    try {
      return await this.dbService.deletePassword(id);
    } catch (error) {
      console.error('Error deleting password entry:', error);
      throw error;
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
   * Decrypt a password entry with enhanced null handling and error recovery
   * @param {Object} encryptedEntry - Encrypted password entry
   * @returns {Promise<Object>} Decrypted password entry
   */
  async decryptPasswordEntry(encryptedEntry) {
    if (!this.isUserAuthenticated()) {
      throw new Error('User not authenticated');
    }

    console.log('=== DECRYPTION DEBUG ===');
    console.log('Authentication status:', this.isAuthenticated);
    console.log('Master password available:', !!this.masterPassword);
    console.log(
      'Master password length:',
      this.masterPassword ? this.masterPassword.length : 'N/A'
    );
    console.log('Encrypted entry ID:', encryptedEntry.id);
    console.log('Encrypted entry keys:', Object.keys(encryptedEntry));

    try {
      // Verify master password is available
      if (!this.masterPassword) {
        console.error('CRITICAL: Master password is null or undefined!');
        console.log('Attempting to restore authentication...');

        // Try to restore authentication
        const restored = await this.tryRestoreAuthentication();
        if (!restored || !this.masterPassword) {
          throw new Error(
            'Master password not available - authentication required'
          );
        }
        console.log('Authentication restored, master password now available');
      }

      // Parse encrypted fields with enhanced null handling
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

      console.log('Decrypting fields for entry:', encryptedEntry.id);

      // Helper function to safely decrypt a field with comprehensive null handling
      const safeDecryptField = (
        fieldName,
        encryptedData,
        isOptional = false
      ) => {
        console.log(`\n--- Attempting to decrypt ${fieldName} ---`);
        console.log(`${fieldName} raw data:`, encryptedData);
        console.log(`${fieldName} data type:`, typeof encryptedData);

        try {
          // CRITICAL: Never attempt to decrypt if data is null, undefined, or empty
          // This prevents the "Encrypted data and master password are required" error
          if (encryptedData === null) {
            console.log(
              `${fieldName}: Value is null - treating as empty field`
            );
            return '';
          }

          if (encryptedData === undefined) {
            console.log(
              `${fieldName}: Value is undefined - treating as empty field`
            );
            return '';
          }

          if (encryptedData === '') {
            console.log(
              `${fieldName}: Value is empty string - treating as empty field`
            );
            return '';
          }

          // Handle string "null" values from database (legacy data)
          if (encryptedData === 'null') {
            console.log(
              `${fieldName}: Found string "null" - treating as empty field`
            );
            return '';
          }

          if (encryptedData === '"null"') {
            console.log(
              `${fieldName}: Found JSON string "null" - treating as empty field`
            );
            return '';
          }

          // Verify master password is available before attempting decryption
          if (!this.masterPassword) {
            console.error(
              `${fieldName}: Master password not available during decryption`
            );
            return isOptional ? '' : `[${fieldName} Error: No Key]`;
          }

          // Attempt to parse the encrypted data as JSON
          console.log(`${fieldName}: Parsing JSON data...`);
          let parsedData;
          try {
            parsedData = JSON.parse(encryptedData);
          } catch (parseError) {
            console.error(
              `${fieldName}: JSON parse failed - data may be corrupted`
            );
            console.error(`${fieldName}: Parse error:`, parseError.message);
            console.error(`${fieldName}: Raw data:`, encryptedData);
            return isOptional ? '' : `[${fieldName} Error: Invalid Data]`;
          }

          // Validate that parsed data has the required encryption structure
          if (!parsedData || typeof parsedData !== 'object') {
            console.error(
              `${fieldName}: Parsed data is not an object - invalid encryption format`
            );
            return isOptional ? '' : `[${fieldName} Error: Invalid Format]`;
          }

          // Check for required encryption properties
          if (!parsedData.ciphertext || !parsedData.salt || !parsedData.iv) {
            console.error(
              `${fieldName}: Missing required encryption properties (ciphertext, salt, iv)`
            );
            console.error(
              `${fieldName}: Available properties:`,
              Object.keys(parsedData)
            );
            return isOptional
              ? ''
              : `[${fieldName} Error: Incomplete Encryption]`;
          }

          console.log(
            `${fieldName}: Valid encryption structure found - attempting decryption`
          );

          // SAFE: Now we know we have valid data and master password - attempt decryption
          const decryptedValue = encryptionService.decrypt(
            parsedData,
            this.masterPassword
          );

          console.log(
            `${fieldName}: Decryption successful - length: ${decryptedValue ? decryptedValue.length : 0}`
          );

          // Return the decrypted value or empty string if null
          return decryptedValue || '';
        } catch (error) {
          console.error(
            `\n!!! CRITICAL ${fieldName.toUpperCase()} DECRYPTION ERROR !!!`
          );
          console.error(`Error type: ${error.constructor.name}`);
          console.error(`Error message: ${error.message}`);
          console.error(`Original encrypted data: ${encryptedData}`);
          console.error(`Data type: ${typeof encryptedData}`);
          console.error(`Master password available: ${!!this.masterPassword}`);
          console.error(`Is optional field: ${isOptional}`);

          // For optional fields (URL, notes), always return empty string to prevent UI errors
          if (isOptional) {
            console.log(
              `${fieldName} is optional - returning empty string to prevent app failure`
            );
            return '';
          }

          // For required fields, return a clear error indicator
          console.log(`${fieldName} is required - returning error indicator`);
          return `[${fieldName} Decryption Failed]`;
        }
      };

      // Decrypt each field with proper optional field handling
      console.log('\n=== STARTING FIELD DECRYPTION ===');

      // Required fields
      decrypted.title = safeDecryptField(
        'title',
        encryptedEntry.title_encrypted,
        false
      );
      decrypted.username = safeDecryptField(
        'username',
        encryptedEntry.username_encrypted,
        false
      );
      decrypted.password = safeDecryptField(
        'password',
        encryptedEntry.password_encrypted,
        false
      );

      // Optional fields - these should never cause errors, just return empty strings
      decrypted.url = safeDecryptField(
        'url',
        encryptedEntry.url_encrypted,
        true
      );
      decrypted.notes = safeDecryptField(
        'notes',
        encryptedEntry.notes_encrypted,
        true
      );

      console.log('\n=== DECRYPTION COMPLETE ===');
      console.log('Final decrypted entry:', {
        id: decrypted.id,
        title: decrypted.title,
        username: decrypted.username,
        url: decrypted.url,
        notes: decrypted.notes,
        categoryId: decrypted.categoryId,
        categoryName: decrypted.categoryName,
      });
      console.log('=== END DECRYPTION DEBUG ===');

      return decrypted;
    } catch (error) {
      console.error('=== CRITICAL DECRYPTION ERROR ===');
      console.error('Error decrypting password entry:', error);
      console.error('Authentication state:', this.isAuthenticated);
      console.error('Master password available:', !!this.masterPassword);
      console.error('Entry ID:', encryptedEntry.id);
      console.error('Entry keys:', Object.keys(encryptedEntry));
      console.error('=== END CRITICAL DECRYPTION ERROR ===');
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
}

// Export singleton instance
const vaultService = new VaultService();
export default vaultService;
