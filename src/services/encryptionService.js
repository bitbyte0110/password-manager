import CryptoJS from 'crypto-js';
import 'react-native-get-random-values'; // Ensure crypto randomness is available

/**
 * Encryption Service for Password Manager
 * Provides AES-256 encryption/decryption with secure key derivation
 */
class EncryptionService {
  constructor() {
    this.algorithm = 'AES';
    this.keySize = 256;
    this.ivSize = 128;
    this.saltSize = 256;
    this.iterations = 5000; // Optimized PBKDF2 iterations
    this.keyCache = new Map(); // Cache derived keys for session
    this.maxCacheSize = 50; // Maximum cache entries
    this.deviceBenchmark = null; // Device performance benchmark
  }

  /**
   * Generate a cryptographically secure salt
   * @returns {string} Base64 encoded salt
   */
  generateSalt() {
    try {
      const salt = CryptoJS.lib.WordArray.random(this.saltSize / 8);
      return CryptoJS.enc.Base64.stringify(salt);
    } catch (error) {
      throw new Error(`Failed to generate salt: ${error.message}`);
    }
  }

  /**
   * Generate a cryptographically secure initialization vector
   * @returns {string} Base64 encoded IV
   */
  generateIV() {
    try {
      const iv = CryptoJS.lib.WordArray.random(this.ivSize / 8);
      return CryptoJS.enc.Base64.stringify(iv);
    } catch (error) {
      throw new Error(`Failed to generate IV: ${error.message}`);
    }
  }

  /**
   * Derive encryption key from master password using PBKDF2 with caching
   * @param {string} masterPassword - User's master password
   * @param {string} salt - Base64 encoded salt
   * @returns {CryptoJS.lib.WordArray} Derived key
   */
  deriveKey(masterPassword, salt) {
    try {
      if (!masterPassword || !salt) {
        throw new Error('Master password and salt are required');
      }

      // Create cache key from password suffix and salt suffix for security
      const cacheKey = `${masterPassword.slice(-6)}_${salt.slice(-12)}`;
      
      // Check cache first
      if (this.keyCache.has(cacheKey)) {
        console.log('🎯 Using cached derived key - instant decryption');
        return this.keyCache.get(cacheKey);
      }

      const saltWordArray = CryptoJS.enc.Base64.parse(salt);
      const key = CryptoJS.PBKDF2(masterPassword, saltWordArray, {
        keySize: this.keySize / 32,
        iterations: this.getOptimalIterations(),
        hasher: CryptoJS.algo.SHA256,
      });

      // Cache the derived key
      this.keyCache.set(cacheKey, key);
      this.manageCacheSize();

      return key;
    } catch (error) {
      throw new Error(`Key derivation failed: ${error.message}`);
    }
  }

  /**
   * Encrypt data using AES-256-CBC
   * @param {string} plaintext - Data to encrypt
   * @param {string} masterPassword - User's master password
   * @param {string} salt - Optional salt (will generate if not provided)
   * @returns {Object} Encrypted data with metadata
   */
  encrypt(plaintext, masterPassword, salt = null) {
    try {
      if (!plaintext || !masterPassword) {
        throw new Error('Plaintext and master password are required');
      }

      // Generate salt if not provided
      const encryptionSalt = salt || this.generateSalt();

      // Generate IV for this encryption
      const iv = this.generateIV();

      // Derive key from master password
      const key = this.deriveKey(masterPassword, encryptionSalt);

      // Convert IV to WordArray for encryption
      const ivWordArray = CryptoJS.enc.Base64.parse(iv);

      // Encrypt the data
      const encrypted = CryptoJS.AES.encrypt(plaintext, key, {
        iv: ivWordArray,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      });

      // Return encrypted data with metadata
      return {
        ciphertext: encrypted.toString(),
        salt: encryptionSalt,
        iv: iv,
        algorithm: 'AES-256-CBC',
        iterations: this.iterations,
      };
    } catch (error) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt data using AES-256-CBC
   * @param {Object} encryptedData - Object containing ciphertext, salt, and IV
   * @param {string} masterPassword - User's master password
   * @returns {string} Decrypted plaintext
   */
  decrypt(encryptedData, masterPassword) {
    try {
      if (!encryptedData || !masterPassword) {
        throw new Error('Encrypted data and master password are required');
      }

      const { ciphertext, salt, iv } = encryptedData;

      if (!ciphertext || !salt || !iv) {
        throw new Error('Invalid encrypted data format');
      }

      // Derive key from master password and salt
      const key = this.deriveKey(masterPassword, salt);

      // Convert IV to WordArray for decryption
      const ivWordArray = CryptoJS.enc.Base64.parse(iv);

      // Decrypt the data
      const decrypted = CryptoJS.AES.decrypt(ciphertext, key, {
        iv: ivWordArray,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      });

      // Convert to UTF-8 string
      const plaintext = decrypted.toString(CryptoJS.enc.Utf8);

      if (!plaintext) {
        throw new Error(
          'Decryption failed - invalid password or corrupted data'
        );
      }

      return plaintext;
    } catch (error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Encrypt password entry for database storage
   * @param {Object} passwordEntry - Password entry object
   * @param {string} masterPassword - User's master password
   * @returns {Object} Encrypted password entry
   */
  encryptPasswordEntry(passwordEntry, masterPassword) {
    try {
      if (!passwordEntry || !masterPassword) {
        throw new Error('Password entry and master password are required');
      }

      const { title, username, password, url, notes, categoryId } =
        passwordEntry;

      // Generate a single salt for this entry
      const salt = this.generateSalt();

      // Encrypt sensitive fields
      const encryptedEntry = {
        id: passwordEntry.id || null,
        title: title ? this.encrypt(title, masterPassword, salt) : null,
        username: username
          ? this.encrypt(username, masterPassword, salt)
          : null,
        password: password
          ? this.encrypt(password, masterPassword, salt)
          : null,
        url: url ? this.encrypt(url, masterPassword, salt) : null,
        notes: notes ? this.encrypt(notes, masterPassword, salt) : null,
        categoryId: categoryId || null,
        createdAt: passwordEntry.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      return encryptedEntry;
    } catch (error) {
      throw new Error(`Failed to encrypt password entry: ${error.message}`);
    }
  }

  /**
   * Decrypt password entry from database
   * @param {Object} encryptedEntry - Encrypted password entry object
   * @param {string} masterPassword - User's master password
   * @returns {Object} Decrypted password entry
   */
  decryptPasswordEntry(encryptedEntry, masterPassword) {
    try {
      if (!encryptedEntry || !masterPassword) {
        throw new Error('Encrypted entry and master password are required');
      }

      const decryptedEntry = {
        id: encryptedEntry.id,
        title: encryptedEntry.title
          ? this.decrypt(encryptedEntry.title, masterPassword)
          : '',
        username: encryptedEntry.username
          ? this.decrypt(encryptedEntry.username, masterPassword)
          : '',
        password: encryptedEntry.password
          ? this.decrypt(encryptedEntry.password, masterPassword)
          : '',
        url: encryptedEntry.url
          ? this.decrypt(encryptedEntry.url, masterPassword)
          : '',
        notes: encryptedEntry.notes
          ? this.decrypt(encryptedEntry.notes, masterPassword)
          : '',
        categoryId: encryptedEntry.categoryId,
        createdAt: encryptedEntry.createdAt,
        updatedAt: encryptedEntry.updatedAt,
      };

      return decryptedEntry;
    } catch (error) {
      throw new Error(`Failed to decrypt password entry: ${error.message}`);
    }
  }

  /**
   * Encrypt password entry as single payload for optimal performance
   * @param {Object} passwordEntry - Password entry object
   * @param {string} masterPassword - User's master password
   * @returns {Object} Encrypted password entry with single payload
   */
  encryptPasswordEntryOptimized(passwordEntry, masterPassword) {
    try {
      if (!passwordEntry || !masterPassword) {
        throw new Error('Password entry and master password are required');
      }

      const { title, username, password, url, notes, categoryId, isFavorite } =
        passwordEntry;

      // Combine all sensitive fields into a single payload
      const sensitiveData = {
        title: title || '',
        username: username || '',
        password: password || '',
        url: url || '',
        notes: notes || '',
      };

      // Encrypt the entire payload as one operation
      const encryptedPayload = this.encrypt(
        JSON.stringify(sensitiveData),
        masterPassword
      );

      return {
        id: passwordEntry.id || null,
        encrypted_payload: encryptedPayload,
        category_id: categoryId !== undefined ? categoryId : null,
        is_favorite: isFavorite ? 1 : 0,
        created_at: passwordEntry.createdAt || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    } catch (error) {
      throw new Error(
        `Failed to encrypt password entry optimized: ${error.message}`
      );
    }
  }

  /**
   * Decrypt password entry from single payload
   * @param {Object} encryptedEntry - Encrypted password entry object with single payload
   * @param {string} masterPassword - User's master password
   * @returns {Object} Decrypted password entry
   */
  decryptPasswordEntryOptimized(encryptedEntry, masterPassword) {
    try {
      if (!encryptedEntry || !masterPassword) {
        throw new Error('Encrypted entry and master password are required');
      }

      if (!encryptedEntry.encrypted_payload) {
        throw new Error('No encrypted payload found');
      }

      // Single decryption operation
      const decryptedPayload = this.decrypt(
        encryptedEntry.encrypted_payload,
        masterPassword
      );
      const sensitiveData = JSON.parse(decryptedPayload);

      return {
        id: encryptedEntry.id,
        title: sensitiveData.title || '',
        username: sensitiveData.username || '',
        password: sensitiveData.password || '',
        url: sensitiveData.url || '',
        notes: sensitiveData.notes || '',
        categoryId: encryptedEntry.category_id,
        categoryName: encryptedEntry.category_name,
        categoryColor: encryptedEntry.category_color,
        categoryIcon: encryptedEntry.category_icon,
        isFavorite: encryptedEntry.is_favorite === 1,
        createdAt: encryptedEntry.created_at,
        updatedAt: encryptedEntry.updated_at,
        lastAccessed: encryptedEntry.last_accessed,
      };
    } catch (error) {
      throw new Error(
        `Failed to decrypt password entry optimized: ${error.message}`
      );
    }
  }

  /**
   * Validate master password strength
   * @param {string} password - Password to validate
   * @returns {Object} Validation result
   */
  validateMasterPassword(password) {
    const result = {
      isValid: false,
      strength: 'weak',
      errors: [],
    };

    if (!password) {
      result.errors.push('Password is required');
      return result;
    }

    if (password.length < 12) {
      result.errors.push('Password must be at least 12 characters long');
    }

    if (!/[A-Z]/.test(password)) {
      result.errors.push('Password must contain at least one uppercase letter');
    }

    if (!/[a-z]/.test(password)) {
      result.errors.push('Password must contain at least one lowercase letter');
    }

    if (!/\d/.test(password)) {
      result.errors.push('Password must contain at least one number');
    }

    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      result.errors.push(
        'Password must contain at least one special character'
      );
    }

    // Determine strength
    if (result.errors.length === 0) {
      result.isValid = true;
      if (password.length >= 16) {
        result.strength = 'strong';
      } else if (password.length >= 14) {
        result.strength = 'medium';
      } else {
        result.strength = 'weak';
      }
    }

    return result;
  }

  /**
   * Get optimal PBKDF2 iterations based on device performance
   * @returns {number} Optimal iteration count
   */
  getOptimalIterations() {
    // Use cached benchmark if available
    if (this.deviceBenchmark !== null) {
      return this.deviceBenchmark > 100 ? this.iterations : Math.max(3000, this.iterations / 2);
    }
    
    // Return default if no benchmark
    return this.iterations;
  }

  /**
   * Manage cache size to prevent memory bloat
   */
  manageCacheSize() {
    if (this.keyCache.size > this.maxCacheSize) {
      // Remove oldest entries (simple FIFO)
      const entries = Array.from(this.keyCache.entries());
      const toRemove = entries.slice(0, entries.length - this.maxCacheSize);
      toRemove.forEach(([key]) => this.keyCache.delete(key));
      console.log(`🧹 Cleaned ${toRemove.length} cached keys`);
    }
  }

  /**
   * Clear all cached keys (call on logout/password change)
   */
  clearKeyCache() {
    this.keyCache.clear();
    console.log('🗑️ Cleared all cached encryption keys');
  }

  /**
   * Bulk re-encrypt password entries (for password reset)
   * @param {Array} entries - Array of encrypted password entries
   * @param {string} oldPassword - Current master password (or recovery phrase)
   * @param {string} newPassword - New master password
   * @param {Function} progressCallback - Progress callback function
   * @returns {Promise<Array>} Re-encrypted entries
   */
  async bulkReencrypt(entries, oldPassword, newPassword, progressCallback) {
    try {
      console.log(`🔄 Starting bulk re-encryption of ${entries.length} entries...`);
      const results = [];
      const batchSize = 5; // Process 5 at a time to avoid blocking
      
      for (let i = 0; i < entries.length; i += batchSize) {
        const batch = entries.slice(i, i + batchSize);
        
        // Process batch
        const batchResults = await Promise.allSettled(
          batch.map(async (entry) => {
            try {
              // Decrypt with old password
              const decrypted = this.decryptPasswordEntryOptimized(entry, oldPassword);
              
              // Re-encrypt with new password
              const reencrypted = this.encryptPasswordEntryOptimized({
                title: decrypted.title,
                username: decrypted.username,
                password: decrypted.password,
                url: decrypted.url,
                notes: decrypted.notes,
                categoryId: decrypted.categoryId,
                isFavorite: decrypted.isFavorite,
              }, newPassword);
              
              return { id: entry.id, data: reencrypted };
            } catch (error) {
              console.warn(`Failed to re-encrypt entry ${entry.id}:`, error.message);
              return null;
            }
          })
        );
        
        // Collect successful results
        batchResults.forEach(result => {
          if (result.status === 'fulfilled' && result.value) {
            results.push(result.value);
          }
        });
        
        // Update progress
        if (progressCallback) {
          const progress = Math.min(100, ((i + batchSize) / entries.length) * 100);
          progressCallback(progress);
        }
        
        // Yield control to avoid blocking UI
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      console.log(`✅ Bulk re-encryption completed: ${results.length}/${entries.length} successful`);
      return results;
      
    } catch (error) {
      console.error('Bulk re-encryption failed:', error);
      throw new Error(`Bulk re-encryption failed: ${error.message}`);
    }
  }

  /**
   * Securely clear sensitive data from memory
   * @param {string} data - Sensitive string to clear
   */
  clearSensitiveData(data) {
    if (typeof data === 'string') {
      // Overwrite string content (limited effectiveness in JS)
      data = null;
    }
  }
}

// Export singleton instance
const encryptionService = new EncryptionService();
export default encryptionService;
