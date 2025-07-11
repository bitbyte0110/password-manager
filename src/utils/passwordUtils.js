import bcrypt from 'bcryptjs';

/**
 * Password Utilities for Password Manager
 * Handles secure master password hashing, verification, and validation
 */
class PasswordUtils {
  constructor() {
    this.saltRounds = 12; // Secure salt rounds for bcrypt
    this.minPasswordLength = 12;
    this.maxPasswordLength = 128;
  }

  /**
   * Hash a password using bcrypt with secure salt rounds
   * @param {string} password - Plain text password to hash
   * @param {number} rounds - Optional salt rounds (defaults to 12)
   * @returns {Promise<string>} Hashed password
   */
  async hashPassword(password, rounds = this.saltRounds) {
    try {
      if (!password) {
        throw new Error('Password is required');
      }

      if (typeof password !== 'string') {
        throw new Error('Password must be a string');
      }

      if (password.length < this.minPasswordLength) {
        throw new Error(
          `Password must be at least ${this.minPasswordLength} characters long`
        );
      }

      if (password.length > this.maxPasswordLength) {
        throw new Error(
          `Password must not exceed ${this.maxPasswordLength} characters`
        );
      }

      // Validate salt rounds
      if (rounds < 10 || rounds > 15) {
        throw new Error('Salt rounds must be between 10 and 15');
      }

      // Generate salt and hash password
      const salt = await bcrypt.genSalt(rounds);
      const hashedPassword = await bcrypt.hash(password, salt);

      return hashedPassword;
    } catch (error) {
      throw new Error(`Password hashing failed: ${error.message}`);
    }
  }

  /**
   * Verify a password against its hash
   * @param {string} password - Plain text password to verify
   * @param {string} hashedPassword - Stored hashed password
   * @returns {Promise<boolean>} Verification result
   */
  async verifyPassword(password, hashedPassword) {
    try {
      if (!password || !hashedPassword) {
        throw new Error('Password and hash are required');
      }

      if (typeof password !== 'string' || typeof hashedPassword !== 'string') {
        throw new Error('Password and hash must be strings');
      }

      // Verify password against hash
      const isValid = await bcrypt.compare(password, hashedPassword);
      return isValid;
    } catch (error) {
      console.error('Password verification error:', error.message);
      return false; // Return false on any error for security
    }
  }

  /**
   * Validate password strength with comprehensive rules
   * @param {string} password - Password to validate
   * @returns {Object} Validation result with strength score and feedback
   */
  validatePasswordStrength(password) {
    const result = {
      isValid: false,
      strength: 'weak',
      score: 0,
      errors: [],
      suggestions: [],
      estimatedCrackTime: 'Unknown',
    };

    if (!password) {
      result.errors.push('Password is required');
      return result;
    }

    if (typeof password !== 'string') {
      result.errors.push('Password must be a string');
      return result;
    }

    let score = 0;
    const checks = {
      length: password.length >= this.minPasswordLength,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      numbers: /\d/.test(password),
      symbols: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
      noSequential: !this.hasSequentialChars(password),
      noRepeated: !this.hasRepeatedChars(password),
      noCommon: !this.isCommonPassword(password),
    };

    // Length validation
    if (!checks.length) {
      result.errors.push(
        `Password must be at least ${this.minPasswordLength} characters long`
      );
    } else {
      score += password.length >= 16 ? 2 : 1;
    }

    // Character type validation
    if (!checks.uppercase) {
      result.errors.push('Password must contain at least one uppercase letter');
    } else {
      score += 1;
    }

    if (!checks.lowercase) {
      result.errors.push('Password must contain at least one lowercase letter');
    } else {
      score += 1;
    }

    if (!checks.numbers) {
      result.errors.push('Password must contain at least one number');
    } else {
      score += 1;
    }

    if (!checks.symbols) {
      result.errors.push(
        'Password must contain at least one special character'
      );
    } else {
      score += 1;
    }

    // Pattern validation
    if (!checks.noSequential) {
      result.errors.push(
        'Password should not contain sequential characters (e.g., abc, 123)'
      );
    } else {
      score += 1;
    }

    if (!checks.noRepeated) {
      result.errors.push(
        'Password should not contain repeated characters (e.g., aaa, 111)'
      );
    } else {
      score += 1;
    }

    if (!checks.noCommon) {
      result.errors.push(
        'Password is too common, please choose a more unique password'
      );
    } else {
      score += 1;
    }

    // Additional strength checks
    if (password.length >= 20) score += 1;
    if (this.hasMultipleCharTypes(password, 4)) score += 1;
    if (password.length >= 16 && this.hasGoodEntropy(password)) score += 1;

    result.score = score;

    // Determine strength level
    if (score >= 9) {
      result.strength = 'very strong';
      result.estimatedCrackTime = 'Centuries';
    } else if (score >= 7) {
      result.strength = 'strong';
      result.estimatedCrackTime = 'Years';
    } else if (score >= 5) {
      result.strength = 'medium';
      result.estimatedCrackTime = 'Months';
    } else if (score >= 3) {
      result.strength = 'weak';
      result.estimatedCrackTime = 'Days';
    } else {
      result.strength = 'very weak';
      result.estimatedCrackTime = 'Minutes';
    }

    // Generate suggestions
    this.generateSuggestions(result, checks, password);

    // Password is valid if no errors and minimum strength
    result.isValid = result.errors.length === 0 && score >= 5;

    return result;
  }

  /**
   * Check for sequential characters
   * @param {string} password - Password to check
   * @returns {boolean} True if sequential characters found
   */
  hasSequentialChars(password) {
    const sequences = [
      'abcdefghijklmnopqrstuvwxyz',
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      '0123456789',
      'qwertyuiop',
      'asdfghjkl',
      'zxcvbnm',
    ];

    for (const seq of sequences) {
      for (let i = 0; i <= seq.length - 3; i++) {
        if (password.includes(seq.substring(i, i + 3))) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Check for repeated characters
   * @param {string} password - Password to check
   * @returns {boolean} True if repeated characters found
   */
  hasRepeatedChars(password) {
    for (let i = 0; i < password.length - 2; i++) {
      if (password[i] === password[i + 1] && password[i] === password[i + 2]) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if password is commonly used
   * @param {string} password - Password to check
   * @returns {boolean} True if password is common
   */
  isCommonPassword(password) {
    const commonPasswords = [
      'password',
      '123456',
      '123456789',
      'qwerty',
      'abc123',
      'password123',
      'admin',
      'letmein',
      'welcome',
      'monkey',
      'dragon',
      'master',
      'shadow',
      'football',
      'baseball',
      'superman',
      'batman',
      'trustno1',
      'iloveyou',
      'princess',
    ];

    return commonPasswords.includes(password.toLowerCase());
  }

  /**
   * Check if password has multiple character types
   * @param {string} password - Password to check
   * @param {number} minTypes - Minimum number of character types required
   * @returns {boolean} True if has enough character types
   */
  hasMultipleCharTypes(password, minTypes) {
    let types = 0;
    if (/[a-z]/.test(password)) types++;
    if (/[A-Z]/.test(password)) types++;
    if (/\d/.test(password)) types++;
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) types++;

    return types >= minTypes;
  }

  /**
   * Check password entropy (randomness)
   * @param {string} password - Password to check
   * @returns {boolean} True if has good entropy
   */
  hasGoodEntropy(password) {
    const charCounts = {};
    for (const char of password) {
      charCounts[char] = (charCounts[char] || 0) + 1;
    }

    const uniqueChars = Object.keys(charCounts).length;
    const entropy = uniqueChars / password.length;

    return entropy > 0.7; // At least 70% unique characters
  }

  /**
   * Generate improvement suggestions
   * @param {Object} result - Validation result object to modify
   * @param {Object} checks - Validation checks results
   * @param {string} password - Original password
   */
  generateSuggestions(result, checks, password) {
    if (password.length < 16) {
      result.suggestions.push(
        'Consider using at least 16 characters for better security'
      );
    }

    if (!checks.symbols) {
      result.suggestions.push(
        'Add special characters like !@#$%^&* for stronger security'
      );
    }

    if (!checks.noSequential) {
      result.suggestions.push('Avoid sequential patterns like "abc" or "123"');
    }

    if (!checks.noRepeated) {
      result.suggestions.push('Avoid repeating characters like "aaa" or "111"');
    }

    if (!checks.noCommon) {
      result.suggestions.push(
        "Use a more unique password that's not commonly used"
      );
    }

    if (result.score < 5) {
      result.suggestions.push(
        'Consider using a passphrase with multiple words'
      );
      result.suggestions.push('Mix uppercase, lowercase, numbers, and symbols');
    }
  }

  /**
   * Generate a secure random password
   * @param {number} length - Password length (default: 16)
   * @param {Object} options - Password generation options
   * @returns {string} Generated password
   */
  generateSecurePassword(length = 16, options = {}) {
    const defaults = {
      includeUppercase: true,
      includeLowercase: true,
      includeNumbers: true,
      includeSymbols: true,
      excludeSimilar: true, // Exclude similar looking characters
      excludeAmbiguous: true, // Exclude ambiguous characters
    };

    const config = { ...defaults, ...options };

    let charset = '';

    if (config.includeLowercase) {
      charset += config.excludeSimilar
        ? 'abcdefghjkmnpqrstuvwxyz'
        : 'abcdefghijklmnopqrstuvwxyz';
    }

    if (config.includeUppercase) {
      charset += config.excludeSimilar
        ? 'ABCDEFGHJKMNPQRSTUVWXYZ'
        : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    }

    if (config.includeNumbers) {
      charset += config.excludeSimilar ? '23456789' : '0123456789';
    }

    if (config.includeSymbols) {
      charset += config.excludeAmbiguous
        ? '!@#$%^&*()_+-=[]{}|;:,.<>?'
        : '!@#$%^&*()_+-=[]{}\\|;:\'",./<>?';
    }

    if (charset === '') {
      throw new Error('At least one character type must be included');
    }

    let password = '';
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }

    return password;
  }

  /**
   * Estimate password cracking time
   * @param {string} password - Password to analyze
   * @returns {Object} Time estimation object
   */
  estimateCrackTime(password) {
    if (!password) return { seconds: 0, display: 'Instant' };

    let charset = 0;
    if (/[a-z]/.test(password)) charset += 26;
    if (/[A-Z]/.test(password)) charset += 26;
    if (/\d/.test(password)) charset += 10;
    if (/[^a-zA-Z0-9]/.test(password)) charset += 32;

    const combinations = Math.pow(charset, password.length);
    const attemptsPerSecond = 1000000000; // 1 billion attempts per second
    const seconds = combinations / (2 * attemptsPerSecond); // Average case

    let display;
    if (seconds < 60) {
      display = 'Less than a minute';
    } else if (seconds < 3600) {
      display = `${Math.round(seconds / 60)} minutes`;
    } else if (seconds < 86400) {
      display = `${Math.round(seconds / 3600)} hours`;
    } else if (seconds < 31536000) {
      display = `${Math.round(seconds / 86400)} days`;
    } else if (seconds < 31536000000) {
      display = `${Math.round(seconds / 31536000)} years`;
    } else {
      display = 'Centuries';
    }

    return { seconds, display };
  }
}

// Export singleton instance
const passwordUtils = new PasswordUtils();
export default passwordUtils;
