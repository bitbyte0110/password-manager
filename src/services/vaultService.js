import * as SecureStore from 'expo-secure-store';
import bcrypt from 'bcryptjs';
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
   * Try to restore authentication session (for when user is already logged in)
   * This is a placeholder - in a real app, you'd check session validity
   * @param {string} masterPassword - Master password from login
   * @returns {Promise<boolean>} Session restore success
   */
  async restoreSession(masterPassword) {
    try {
      const isValid = await this.authenticate(masterPassword);
      return isValid;
    } catch (error) {
      console.error('Session restore error:', error);
      return false;
    }
  }

  /**
   * Authenticate with master password
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
        return true;
      }
      return false;
    } catch (error) {
      console.error('Authentication error:', error);
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
  clearSession() {
    this.masterPassword = null;
    this.isAuthenticated = false;
    this.sessionStartTime = null;
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
   * Decrypt a password entry
   * @param {Object} encryptedEntry - Encrypted password entry
   * @returns {Promise<Object>} Decrypted password entry
   */
  async decryptPasswordEntry(encryptedEntry) {
    if (!this.isUserAuthenticated()) {
      throw new Error('User not authenticated');
    }

    try {
      // Parse encrypted fields
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

      // Decrypt each field if it exists
      if (encryptedEntry.title_encrypted) {
        const titleData = JSON.parse(encryptedEntry.title_encrypted);
        decrypted.title = encryptionService.decrypt(
          titleData,
          this.masterPassword
        );
      }

      if (encryptedEntry.username_encrypted) {
        const usernameData = JSON.parse(encryptedEntry.username_encrypted);
        decrypted.username = encryptionService.decrypt(
          usernameData,
          this.masterPassword
        );
      }

      if (encryptedEntry.password_encrypted) {
        const passwordData = JSON.parse(encryptedEntry.password_encrypted);
        decrypted.password = encryptionService.decrypt(
          passwordData,
          this.masterPassword
        );
      }

      if (encryptedEntry.url_encrypted) {
        const urlData = JSON.parse(encryptedEntry.url_encrypted);
        decrypted.url = encryptionService.decrypt(urlData, this.masterPassword);
      }

      if (encryptedEntry.notes_encrypted) {
        const notesData = JSON.parse(encryptedEntry.notes_encrypted);
        decrypted.notes = encryptionService.decrypt(
          notesData,
          this.masterPassword
        );
      }

      return decrypted;
    } catch (error) {
      console.error('Error decrypting password entry:', error);
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
