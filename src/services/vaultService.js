import * as SecureStore from 'expo-secure-store';
import bcrypt from 'bcryptjs';
import { Buffer } from 'buffer';
import databaseService from './databaseService';
import encryptionService from './encryptionService';
import { usePasswords } from '../PasswordContext';

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

        // Auto-migrate legacy entries on successful authentication
        try {
          const migratedCount = await this.migrateLegacyEntries();
          if (migratedCount > 0) {
            console.log(
              `Auto-migrated ${migratedCount} entries to optimized format`
            );
          }
        } catch (migrationError) {
          console.warn(
            'Migration failed, but continuing with authentication:',
            migrationError
          );
          // Don't fail authentication if migration fails
        }

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
   * Get a single password entry by ID with decryption
   * @param {number} id - Entry ID
   * @returns {Promise<Object>} Decrypted password entry
   */
  async getPasswordEntry(id) {
    if (!this.isUserAuthenticated()) {
      throw new Error('User not authenticated');
    }

    try {
      const encryptedEntry = await this.dbService.getPasswordById(id);

      if (!encryptedEntry) {
        throw new Error('Password entry not found');
      }

      // Decrypt and return the entry
      const decrypted = await this.decryptPasswordEntry(encryptedEntry);
      return decrypted;
    } catch (error) {
      console.error('Error getting password entry:', error);
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

      console.log('VaultService: Old password verified, starting data re-encryption...');

      // Get all password entries
      const allEntries = await this.dbService.getPasswordEntries();
      console.log(`VaultService: Found ${allEntries.length} entries to re-encrypt`);

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
          const reEncryptedData = encryptionService.encryptPasswordEntryOptimized(
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
          throw new Error(`Failed to re-encrypt password entry: ${error.message}`);
        }
      }

      console.log('VaultService: All entries re-encrypted, updating database...');

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

      console.log('VaultService: Master password change completed successfully');
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
}

// Export singleton instance
const vaultService = new VaultService();
export default vaultService;
