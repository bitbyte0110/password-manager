/**
 * ImportExportService - Handles secure import/export of vault data
 *
 * Features:
 * - AES-256-CBC encryption with PBKDF2 key derivation
 * - Export-specific password protection
 * - File format validation and versioning
 * - Comprehensive error handling
 */

import CryptoJS from 'crypto-js';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { getRandomValues } from 'react-native-get-random-values';

class ImportExportService {
  // Export file format version for future compatibility
  static EXPORT_VERSION = '1.0';
  static FILE_EXTENSION = '.pmvault';
  static MIME_TYPE = 'application/json';

  /**
   * Generates cryptographically secure salt
   */
  static generateSalt() {
    const array = new Uint8Array(32); // 256 bits
    getRandomValues(array);
    return Array.from(array, byte => ('0' + byte.toString(16)).slice(-2)).join(
      ''
    );
  }

  /**
   * Derives encryption key from password using PBKDF2
   */
  static deriveKey(password, salt, iterations = 100000) {
    return CryptoJS.PBKDF2(password, salt, {
      keySize: 256 / 32, // 256 bits = 8 words of 32 bits
      iterations: iterations,
      hasher: CryptoJS.algo.SHA256,
    });
  }

  /**
   * Encrypts vault data for export
   */
  static async encryptForExport(vaultData, exportPassword) {
    try {
      // Generate salt and IV
      const salt = this.generateSalt();
      const iv = CryptoJS.lib.WordArray.random(16); // 128 bits

      // Derive key from export password
      const key = this.deriveKey(exportPassword, salt);

      // Prepare export payload
      const exportPayload = {
        version: this.EXPORT_VERSION,
        timestamp: new Date().toISOString(),
        data: vaultData,
      };

      // Encrypt the payload
      const encrypted = CryptoJS.AES.encrypt(
        JSON.stringify(exportPayload),
        key,
        { iv: iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
      );

      // Create final export structure
      const exportFile = {
        version: this.EXPORT_VERSION,
        algorithm: 'AES-256-CBC',
        keyDerivation: 'PBKDF2-SHA256',
        iterations: 100000,
        salt: salt,
        iv: iv.toString(),
        data: encrypted.toString(),
      };

      return {
        success: true,
        data: JSON.stringify(exportFile, null, 2),
        filename: `vault_export_${new Date().toISOString().slice(0, 10)}${this.FILE_EXTENSION}`,
      };
    } catch (error) {
      console.error('Export encryption failed:', error);
      return {
        success: false,
        error: 'Failed to encrypt vault data for export',
      };
    }
  }

  /**
   * Decrypts imported vault data
   */
  static async decryptForImport(importData, importPassword) {
    try {
      // Parse import file
      const parsed = JSON.parse(importData);

      // Validate file structure
      if (!this.validateImportFile(parsed)) {
        return {
          success: false,
          error: 'Invalid import file format',
        };
      }

      // Check version compatibility
      if (parsed.version !== this.EXPORT_VERSION) {
        return {
          success: false,
          error: `Unsupported export version: ${parsed.version}`,
        };
      }

      // Derive key from import password
      const key = this.deriveKey(
        importPassword,
        parsed.salt,
        parsed.iterations
      );

      // Create IV from stored string
      const iv = CryptoJS.enc.Hex.parse(parsed.iv);

      // Decrypt the data
      const decrypted = CryptoJS.AES.decrypt(parsed.data, key, {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      });

      // Convert to string
      const decryptedString = decrypted.toString(CryptoJS.enc.Utf8);

      if (!decryptedString) {
        return {
          success: false,
          error: 'Incorrect import password or corrupted file',
        };
      }

      // Parse decrypted payload
      const payload = JSON.parse(decryptedString);

      // Validate payload structure
      if (!payload.data || !Array.isArray(payload.data)) {
        return {
          success: false,
          error: 'Invalid vault data structure in import file',
        };
      }

      return {
        success: true,
        data: payload.data,
        metadata: {
          exportedAt: payload.timestamp,
          version: payload.version,
        },
      };
    } catch (error) {
      console.error('Import decryption failed:', error);

      // Provide user-friendly error messages
      if (error.message.includes('JSON')) {
        return {
          success: false,
          error: 'Invalid file format - not a valid vault export',
        };
      }

      return {
        success: false,
        error: 'Failed to decrypt import data - check your password',
      };
    }
  }

  /**
   * Validates import file structure
   */
  static validateImportFile(parsed) {
    const requiredFields = [
      'version',
      'algorithm',
      'keyDerivation',
      'salt',
      'iv',
      'data',
    ];
    return requiredFields.every(field => Object.prototype.hasOwnProperty.call(parsed, field));
  }

  /**
   * Exports vault to file and shares it
   */
  static async exportVaultToFile(vaultData, exportPassword) {
    try {
      // Encrypt vault data
      const encryptResult = await this.encryptForExport(
        vaultData,
        exportPassword
      );

      if (!encryptResult.success) {
        return encryptResult;
      }

      // Save to device
      const fileUri = FileSystem.documentDirectory + encryptResult.filename;
      await FileSystem.writeAsStringAsync(fileUri, encryptResult.data, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      // Share the file
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: this.MIME_TYPE,
          dialogTitle: 'Export Vault Data',
        });
      }

      return {
        success: true,
        filename: encryptResult.filename,
        fileUri: fileUri,
        message: 'Vault exported successfully',
      };
    } catch (error) {
      console.error('Export to file failed:', error);
      return {
        success: false,
        error: 'Failed to save export file',
      };
    }
  }

  /**
   * Imports vault from selected file
   */
  static async importVaultFromFile(importPassword) {
    try {
      // Let user select file
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain', '*/*'],
        copyToCacheDirectory: false,
      });

      if (result.canceled) {
        return {
          success: false,
          error: 'Import cancelled by user',
        };
      }

      // Read file content
      const fileContent = await FileSystem.readAsStringAsync(
        result.assets[0].uri,
        {
          encoding: FileSystem.EncodingType.UTF8,
        }
      );

      // Decrypt and validate
      const decryptResult = await this.decryptForImport(
        fileContent,
        importPassword
      );

      if (!decryptResult.success) {
        return decryptResult;
      }

      return {
        success: true,
        data: decryptResult.data,
        metadata: decryptResult.metadata,
        message: `Successfully imported ${decryptResult.data.length} passwords`,
      };
    } catch (error) {
      console.error('Import from file failed:', error);
      return {
        success: false,
        error: 'Failed to read import file',
      };
    }
  }

  /**
   * Validates export password strength
   */
  static validateExportPassword(password) {
    const errors = [];

    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }

    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain lowercase letters');
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain uppercase letters');
    }

    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain numbers');
    }

    return {
      isValid: errors.length === 0,
      errors: errors,
    };
  }
}

export default ImportExportService;
