import * as SecureStore from 'expo-secure-store';
import CryptoJS from 'crypto-js';

/**
 * Secure Storage Service for Password Manager
 * Wraps Expo SecureStore with additional security features and error handling
 */
class SecureStorageService {
  constructor() {
    this.keyPrefix = 'pm_'; // Password Manager prefix
    this.keys = {
      MASTER_PASSWORD_HASH: 'pm_master_password_hash',
      ENCRYPTION_SALT: 'pm_encryption_salt',
      USER_SETTINGS: 'pm_user_settings',
      BIOMETRIC_KEY: 'pm_biometric_key',
      SESSION_TOKEN: 'pm_session_token',
      AUTO_LOCK_TIMEOUT: 'pm_auto_lock_timeout',
      MFA_ENABLED: 'pm_mfa_enabled',
      THEME_PREFERENCE: 'pm_theme_preference',
      CLIPBOARD_TIMEOUT: 'pm_clipboard_timeout',
    };
  }

  /**
   * Store a value securely
   * @param {string} key - Storage key
   * @param {string} value - Value to store
   * @param {Object} options - SecureStore options
   * @returns {Promise<boolean>} Success status
   */
  async store(key, value, options = {}) {
    try {
      if (!key || value === undefined || value === null) {
        throw new Error('Key and value are required');
      }

      const secureKey = this.keyPrefix + key;
      const stringValue =
        typeof value === 'string' ? value : JSON.stringify(value);

      const storeOptions = {
        keychainService: 'PasswordManagerKeychain',
        sharedPreferencesName: 'PasswordManagerPrefs',
        ...options,
      };

      await SecureStore.setItemAsync(secureKey, stringValue, storeOptions);
      return true;
    } catch (error) {
      console.error(`SecureStorage store error for key ${key}:`, error.message);
      throw new Error(`Failed to store data: ${error.message}`);
    }
  }

  /**
   * Retrieve a value from secure storage
   * @param {string} key - Storage key
   * @param {Object} options - SecureStore options
   * @returns {Promise<string|null>} Retrieved value or null
   */
  async retrieve(key, options = {}) {
    try {
      if (!key) {
        throw new Error('Key is required');
      }

      const secureKey = this.keyPrefix + key;
      const storeOptions = {
        keychainService: 'PasswordManagerKeychain',
        sharedPreferencesName: 'PasswordManagerPrefs',
        ...options,
      };

      const value = await SecureStore.getItemAsync(secureKey, storeOptions);
      return value;
    } catch (error) {
      console.error(
        `SecureStorage retrieve error for key ${key}:`,
        error.message
      );
      return null;
    }
  }

  /**
   * Remove a value from secure storage
   * @param {string} key - Storage key
   * @param {Object} options - SecureStore options
   * @returns {Promise<boolean>} Success status
   */
  async remove(key, options = {}) {
    try {
      if (!key) {
        throw new Error('Key is required');
      }

      const secureKey = this.keyPrefix + key;
      const storeOptions = {
        keychainService: 'PasswordManagerKeychain',
        sharedPreferencesName: 'PasswordManagerPrefs',
        ...options,
      };

      await SecureStore.deleteItemAsync(secureKey, storeOptions);
      return true;
    } catch (error) {
      console.error(
        `SecureStorage remove error for key ${key}:`,
        error.message
      );
      throw new Error(`Failed to remove data: ${error.message}`);
    }
  }

  /**
   * Check if a key exists in secure storage
   * @param {string} key - Storage key
   * @returns {Promise<boolean>} Existence status
   */
  async exists(key) {
    try {
      const value = await this.retrieve(key);
      return value !== null;
    } catch (error) {
      console.error(
        `SecureStorage exists error for key ${key}:`,
        error.message
      );
      return false;
    }
  }

  /**
   * Store master password hash securely
   * @param {string} passwordHash - Hashed master password
   * @returns {Promise<boolean>} Success status
   */
  async storeMasterPasswordHash(passwordHash) {
    try {
      if (!passwordHash) {
        throw new Error('Password hash is required');
      }

      return await this.store('master_password_hash', passwordHash);
    } catch (error) {
      throw new Error(`Failed to store master password hash: ${error.message}`);
    }
  }

  /**
   * Retrieve master password hash
   * @returns {Promise<string|null>} Password hash or null
   */
  async retrieveMasterPasswordHash() {
    try {
      return await this.retrieve('master_password_hash');
    } catch (error) {
      console.error('Failed to retrieve master password hash:', error.message);
      return null;
    }
  }

  /**
   * Store encryption salt
   * @param {string} salt - Base64 encoded salt
   * @returns {Promise<boolean>} Success status
   */
  async storeEncryptionSalt(salt) {
    try {
      if (!salt) {
        throw new Error('Salt is required');
      }

      return await this.store('encryption_salt', salt);
    } catch (error) {
      throw new Error(`Failed to store encryption salt: ${error.message}`);
    }
  }

  /**
   * Retrieve encryption salt
   * @returns {Promise<string|null>} Salt or null
   */
  async retrieveEncryptionSalt() {
    try {
      return await this.retrieve('encryption_salt');
    } catch (error) {
      console.error('Failed to retrieve encryption salt:', error.message);
      return null;
    }
  }

  /**
   * Generate and store a new encryption salt
   * @returns {Promise<string>} Generated salt
   */
  async generateAndStoreEncryptionSalt() {
    try {
      // Generate cryptographically secure salt
      const salt = CryptoJS.lib.WordArray.random(256 / 8);
      const saltString = CryptoJS.enc.Base64.stringify(salt);

      await this.storeEncryptionSalt(saltString);
      return saltString;
    } catch (error) {
      throw new Error(`Failed to generate and store salt: ${error.message}`);
    }
  }

  /**
   * Store biometric authentication key
   * @param {string} biometricKey - Encrypted key for biometric auth
   * @returns {Promise<boolean>} Success status
   */
  async storeBiometricKey(biometricKey) {
    try {
      if (!biometricKey) {
        throw new Error('Biometric key is required');
      }

      return await this.store('biometric_key', biometricKey, {
        requireAuthentication: true,
        authenticationPrompt: 'Authenticate to store biometric key',
      });
    } catch (error) {
      throw new Error(`Failed to store biometric key: ${error.message}`);
    }
  }

  /**
   * Retrieve biometric authentication key
   * @returns {Promise<string|null>} Biometric key or null
   */
  async retrieveBiometricKey() {
    try {
      return await this.retrieve('biometric_key', {
        requireAuthentication: true,
        authenticationPrompt: 'Authenticate to access your passwords',
      });
    } catch (error) {
      console.error('Failed to retrieve biometric key:', error.message);
      return null;
    }
  }

  /**
   * Store user settings
   * @param {Object} settings - User preference settings
   * @returns {Promise<boolean>} Success status
   */
  async storeUserSettings(settings) {
    try {
      if (!settings || typeof settings !== 'object') {
        throw new Error('Valid settings object is required');
      }

      const settingsString = JSON.stringify(settings);
      return await this.store('user_settings', settingsString);
    } catch (error) {
      throw new Error(`Failed to store user settings: ${error.message}`);
    }
  }

  /**
   * Retrieve user settings
   * @returns {Promise<Object|null>} Settings object or null
   */
  async retrieveUserSettings() {
    try {
      const settingsString = await this.retrieve('user_settings');
      return settingsString ? JSON.parse(settingsString) : null;
    } catch (error) {
      console.error('Failed to retrieve user settings:', error.message);
      return null;
    }
  }

  /**
   * Store session token
   * @param {string} sessionToken - Encrypted session token
   * @returns {Promise<boolean>} Success status
   */
  async storeSessionToken(sessionToken) {
    try {
      if (!sessionToken) {
        throw new Error('Session token is required');
      }

      return await this.store('session_token', sessionToken);
    } catch (error) {
      throw new Error(`Failed to store session token: ${error.message}`);
    }
  }

  /**
   * Retrieve session token
   * @returns {Promise<string|null>} Session token or null
   */
  async retrieveSessionToken() {
    try {
      return await this.retrieve('session_token');
    } catch (error) {
      console.error('Failed to retrieve session token:', error.message);
      return null;
    }
  }

  /**
   * Clear session token (logout)
   * @returns {Promise<boolean>} Success status
   */
  async clearSessionToken() {
    try {
      return await this.remove('session_token');
    } catch (error) {
      console.error('Failed to clear session token:', error.message);
      return false;
    }
  }

  /**
   * Check if user is authenticated (has valid session)
   * @returns {Promise<boolean>} Authentication status
   */
  async isAuthenticated() {
    try {
      const sessionToken = await this.retrieveSessionToken();
      return sessionToken !== null;
    } catch (error) {
      console.error('Failed to check authentication status:', error.message);
      return false;
    }
  }

  /**
   * Clear all stored data (factory reset)
   * @returns {Promise<boolean>} Success status
   */
  async clearAll() {
    try {
      const clearPromises = [
        this.remove('master_password_hash'),
        this.remove('encryption_salt'),
        this.remove('user_settings'),
        this.remove('biometric_key'),
        this.remove('session_token'),
      ];

      await Promise.all(clearPromises);
      return true;
    } catch (error) {
      console.error('Failed to clear all data:', error.message);
      throw new Error(`Failed to clear all data: ${error.message}`);
    }
  }

  /**
   * Get all stored keys (for debugging/maintenance)
   * @returns {Promise<Array<string>>} Array of stored keys
   */
  async getAllKeys() {
    try {
      const keys = [];
      const checkKeys = [
        'master_password_hash',
        'encryption_salt',
        'user_settings',
        'biometric_key',
        'session_token',
      ];

      for (const key of checkKeys) {
        const exists = await this.exists(key);
        if (exists) {
          keys.push(key);
        }
      }

      return keys;
    } catch (error) {
      console.error('Failed to get all keys:', error.message);
      return [];
    }
  }

  /**
   * Validate SecureStore availability
   * @returns {Promise<boolean>} Availability status
   */
  async isAvailable() {
    try {
      return await SecureStore.isAvailableAsync();
    } catch (error) {
      console.error('SecureStore availability check failed:', error.message);
      return false;
    }
  }

  /**
   * Get storage size information (if supported)
   * @returns {Promise<Object>} Storage information
   */
  async getStorageInfo() {
    try {
      const keys = await this.getAllKeys();
      return {
        keyCount: keys.length,
        isAvailable: await this.isAvailable(),
        keys: keys,
      };
    } catch (error) {
      console.error('Failed to get storage info:', error.message);
      return {
        keyCount: 0,
        isAvailable: false,
        keys: [],
      };
    }
  }
}

// Export singleton instance
const secureStorage = new SecureStorageService();
export default secureStorage;
