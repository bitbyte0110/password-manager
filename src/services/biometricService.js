import * as LocalAuthentication from 'expo-local-authentication';
import secureStorage from './secureStorage';
import passwordUtils from '../utils/passwordUtils';

/**
 * Biometric Authentication Service for Password Manager
 * Handles biometric authentication with fallback to master password
 */
class BiometricService {
  constructor() {
    this.isSupported = null;
    this.availableTypes = [];
    this.isEnrolled = null;
    this.securityLevel = null;
    this.lastAuthTime = null;
    this.authTimeout = 300000; // 5 minutes in milliseconds
  }

  /**
   * Check if biometric authentication is supported on the device
   * @returns {Promise<boolean>} True if biometric authentication is supported
   */
  async isBiometricSupported() {
    try {
      if (this.isSupported !== null) {
        return this.isSupported;
      }

      // Check if device supports biometric authentication
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      this.isSupported = hasHardware && isEnrolled;
      this.isEnrolled = isEnrolled;

      console.log(
        `Biometric support - Hardware: ${hasHardware}, Enrolled: ${isEnrolled}`
      );
      return this.isSupported;
    } catch (error) {
      console.error('Error checking biometric support:', error);
      this.isSupported = false;
      return false;
    }
  }

  /**
   * Get available biometric authentication types
   * @returns {Promise<Array>} Array of available biometric types
   */
  async getBiometricTypes() {
    try {
      if (this.availableTypes.length > 0) {
        return this.availableTypes;
      }

      const supportedTypes =
        await LocalAuthentication.supportedAuthenticationTypesAsync();

      // Map Expo types to readable names
      const typeMap = {
        [LocalAuthentication.AuthenticationType.FINGERPRINT]: 'fingerprint',
        [LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION]: 'face_id',
        [LocalAuthentication.AuthenticationType.IRIS]: 'iris',
      };

      this.availableTypes = supportedTypes
        .map(type => typeMap[type] || 'unknown')
        .filter(Boolean);

      console.log('Available biometric types:', this.availableTypes);
      return this.availableTypes;
    } catch (error) {
      console.error('Error getting biometric types:', error);
      return [];
    }
  }

  /**
   * Get biometric enrollment status and security level
   * @returns {Promise<Object>} Enrollment status information
   */
  async getBiometricEnrollmentStatus() {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const supportedTypes = await this.getBiometricTypes();
      const securityLevel = await LocalAuthentication.getEnrolledLevelAsync();

      const status = {
        hasHardware,
        isEnrolled,
        supportedTypes,
        securityLevel,
        canUseBiometric: hasHardware && isEnrolled,
        message: this.getEnrollmentStatusMessage(
          hasHardware,
          isEnrolled,
          supportedTypes
        ),
      };

      this.isSupported = status.canUseBiometric;
      this.isEnrolled = isEnrolled;
      this.securityLevel = securityLevel;

      return status;
    } catch (error) {
      console.error('Error getting enrollment status:', error);
      return {
        hasHardware: false,
        isEnrolled: false,
        supportedTypes: [],
        securityLevel: null,
        canUseBiometric: false,
        message: 'Unable to check biometric status',
        error: error.message,
      };
    }
  }

  /**
   * Get user-friendly enrollment status message
   * @param {boolean} hasHardware - Device has biometric hardware
   * @param {boolean} isEnrolled - User has enrolled biometrics
   * @param {Array} supportedTypes - Available biometric types
   * @returns {string} Status message
   */
  getEnrollmentStatusMessage(hasHardware, isEnrolled, supportedTypes) {
    if (!hasHardware) {
      return 'This device does not support biometric authentication';
    }

    if (!isEnrolled) {
      const typeNames = this.getTypeDisplayNames(supportedTypes);
      return `Please set up ${typeNames} in your device settings to use biometric authentication`;
    }

    const typeNames = this.getTypeDisplayNames(supportedTypes);
    return `${typeNames} authentication is available`;
  }

  /**
   * Get display names for biometric types
   * @param {Array} types - Array of biometric types
   * @returns {string} Formatted type names
   */
  getTypeDisplayNames(types) {
    const displayNames = {
      fingerprint: 'Fingerprint',
      face_id: 'Face ID',
      iris: 'Iris',
    };

    const names = types.map(type => displayNames[type] || type);

    if (names.length === 0) return 'biometric';
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} or ${names[1]}`;

    return `${names.slice(0, -1).join(', ')}, or ${names[names.length - 1]}`;
  }

  /**
   * Authenticate user with biometric authentication
   * @param {Object} options - Authentication options
   * @returns {Promise<Object>} Authentication result
   */
  async authenticateWithBiometric(options = {}) {
    try {
      const {
        promptMessage = 'Authenticate to access your passwords',
        cancelLabel = 'Use Password',
        fallbackLabel = 'Use Master Password',
        disableDeviceFallback = false,
        requireConfirmation = true,
      } = options;

      // Check if biometric authentication is available
      const enrollmentStatus = await this.getBiometricEnrollmentStatus();

      if (!enrollmentStatus.canUseBiometric) {
        return {
          success: false,
          error: 'BIOMETRIC_NOT_AVAILABLE',
          message: enrollmentStatus.message,
          requiresFallback: true,
          enrollmentStatus,
        };
      }

      // Prepare authentication options
      const authOptions = {
        promptMessage,
        cancelLabel,
        disableDeviceFallback,
        requireConfirmation,
      };

      // Add fallback label if not disabled
      if (!disableDeviceFallback) {
        authOptions.fallbackLabel = fallbackLabel;
      }

      console.log('Starting biometric authentication...');
      const result = await LocalAuthentication.authenticateAsync(authOptions);

      // Handle authentication result
      if (result.success) {
        this.lastAuthTime = Date.now();
        console.log('Biometric authentication successful');

        return {
          success: true,
          message: 'Authentication successful',
          authMethod: 'biometric',
          timestamp: this.lastAuthTime,
        };
      } else {
        // Handle different failure scenarios
        const errorResult = this.handleAuthenticationError(result);
        console.log('Biometric authentication failed:', errorResult.error);

        return errorResult;
      }
    } catch (error) {
      console.error('Biometric authentication error:', error);

      return {
        success: false,
        error: 'AUTHENTICATION_ERROR',
        message: 'An error occurred during authentication',
        requiresFallback: true,
        originalError: error.message,
      };
    }
  }

  /**
   * Handle authentication error and provide appropriate response
   * @param {Object} result - Authentication result from LocalAuthentication
   * @returns {Object} Formatted error response
   */
  handleAuthenticationError(result) {
    const { error } = result;

    switch (error) {
      case 'user_cancel':
        return {
          success: false,
          error: 'USER_CANCEL',
          message: 'Authentication was cancelled',
          requiresFallback: true,
        };

      case 'system_cancel':
        return {
          success: false,
          error: 'SYSTEM_CANCEL',
          message: 'Authentication was cancelled by the system',
          requiresFallback: true,
        };

      case 'user_fallback':
        return {
          success: false,
          error: 'USER_FALLBACK',
          message: 'User chose to use fallback authentication',
          requiresFallback: true,
        };

      case 'biometric_unknown_error':
        return {
          success: false,
          error: 'BIOMETRIC_ERROR',
          message: 'An unknown biometric error occurred',
          requiresFallback: true,
        };

      case 'invalid_context':
        return {
          success: false,
          error: 'INVALID_CONTEXT',
          message: 'Authentication context is invalid',
          requiresFallback: true,
        };

      case 'not_enrolled':
        return {
          success: false,
          error: 'NOT_ENROLLED',
          message: 'No biometric authentication is enrolled on this device',
          requiresFallback: true,
        };

      case 'not_available':
        return {
          success: false,
          error: 'NOT_AVAILABLE',
          message: 'Biometric authentication is not available',
          requiresFallback: true,
        };

      case 'lockout':
        return {
          success: false,
          error: 'LOCKOUT',
          message: 'Too many failed attempts. Please try again later.',
          requiresFallback: true,
        };

      case 'lockout_permanent':
        return {
          success: false,
          error: 'LOCKOUT_PERMANENT',
          message:
            'Biometric authentication is permanently locked. Please use your master password.',
          requiresFallback: true,
        };

      default:
        return {
          success: false,
          error: 'UNKNOWN_ERROR',
          message: `Authentication failed: ${error || 'Unknown error'}`,
          requiresFallback: true,
        };
    }
  }

  /**
   * Authenticate with fallback to master password
   * @param {Object} options - Authentication options
   * @returns {Promise<Object>} Authentication result
   */
  async authenticateWithFallback(options = {}) {
    try {
      const {
        allowBiometric = true,
        masterPassword = null,
        maxAttempts = 3,
        ...biometricOptions
      } = options;

      let attempts = 0;
      let lastError = null;

      // Try biometric authentication first if allowed and available
      if (allowBiometric) {
        const biometricResult =
          await this.authenticateWithBiometric(biometricOptions);

        if (biometricResult.success) {
          return biometricResult;
        }

        lastError = biometricResult;

        // If user explicitly cancelled or chose fallback, skip to password
        if (['USER_CANCEL', 'USER_FALLBACK'].includes(biometricResult.error)) {
          return await this.authenticateWithMasterPassword(masterPassword);
        }
      }

      // Fallback to master password authentication
      return await this.authenticateWithMasterPassword(masterPassword);
    } catch (error) {
      console.error('Authentication with fallback error:', error);

      return {
        success: false,
        error: 'FALLBACK_ERROR',
        message: 'Authentication failed',
        originalError: error.message,
      };
    }
  }

  /**
   * Authenticate using master password
   * @param {string} providedPassword - Master password provided by user
   * @returns {Promise<Object>} Authentication result
   */
  async authenticateWithMasterPassword(providedPassword = null) {
    try {
      // If no password provided, this indicates we need user input
      if (!providedPassword) {
        return {
          success: false,
          error: 'PASSWORD_REQUIRED',
          message: 'Master password is required',
          requiresPasswordInput: true,
        };
      }

      // Get stored master password hash
      const storedHash = await secureStorage.retrieveMasterPasswordHash();

      if (!storedHash) {
        return {
          success: false,
          error: 'NO_MASTER_PASSWORD',
          message: 'No master password is set up',
          requiresSetup: true,
        };
      }

      // Verify the password
      const isValid = await passwordUtils.verifyPassword(
        providedPassword,
        storedHash
      );

      if (isValid) {
        this.lastAuthTime = Date.now();
        console.log('Master password authentication successful');

        return {
          success: true,
          message: 'Authentication successful',
          authMethod: 'master_password',
          timestamp: this.lastAuthTime,
        };
      } else {
        return {
          success: false,
          error: 'INVALID_PASSWORD',
          message: 'Invalid master password',
          requiresPasswordInput: true,
        };
      }
    } catch (error) {
      console.error('Master password authentication error:', error);

      return {
        success: false,
        error: 'PASSWORD_AUTH_ERROR',
        message: 'An error occurred during password authentication',
        originalError: error.message,
      };
    }
  }

  /**
   * Check if recent authentication is still valid
   * @param {number} maxAge - Maximum age of authentication in milliseconds
   * @returns {boolean} True if recent authentication is valid
   */
  isRecentAuthValid(maxAge = this.authTimeout) {
    if (!this.lastAuthTime) {
      return false;
    }

    const now = Date.now();
    const age = now - this.lastAuthTime;

    return age <= maxAge;
  }

  /**
   * Clear authentication state
   * @returns {void}
   */
  clearAuthState() {
    this.lastAuthTime = null;
    console.log('Authentication state cleared');
  }

  /**
   * Enable biometric authentication for the user
   * @param {string} masterPassword - Master password for verification
   * @returns {Promise<Object>} Enable result
   */
  async enableBiometricAuth(masterPassword) {
    try {
      // Verify master password first
      const passwordAuth =
        await this.authenticateWithMasterPassword(masterPassword);
      if (!passwordAuth.success) {
        return passwordAuth;
      }

      // Check biometric availability
      const enrollmentStatus = await this.getBiometricEnrollmentStatus();
      if (!enrollmentStatus.canUseBiometric) {
        return {
          success: false,
          error: 'BIOMETRIC_NOT_AVAILABLE',
          message: enrollmentStatus.message,
          enrollmentStatus,
        };
      }

      // Test biometric authentication
      const biometricAuth = await this.authenticateWithBiometric({
        promptMessage: 'Authenticate to enable biometric login',
        cancelLabel: 'Cancel',
      });

      if (!biometricAuth.success) {
        return {
          success: false,
          error: 'BIOMETRIC_TEST_FAILED',
          message: 'Biometric authentication test failed',
          biometricResult: biometricAuth,
        };
      }

      // Store biometric enabled flag
      await secureStorage.storeBiometricKey('enabled');

      return {
        success: true,
        message: 'Biometric authentication enabled successfully',
        supportedTypes: enrollmentStatus.supportedTypes,
      };
    } catch (error) {
      console.error('Error enabling biometric auth:', error);

      return {
        success: false,
        error: 'ENABLE_ERROR',
        message: 'Failed to enable biometric authentication',
        originalError: error.message,
      };
    }
  }

  /**
   * Disable biometric authentication
   * @param {string} masterPassword - Master password for verification
   * @returns {Promise<Object>} Disable result
   */
  async disableBiometricAuth(masterPassword) {
    try {
      // Verify master password first
      const passwordAuth =
        await this.authenticateWithMasterPassword(masterPassword);
      if (!passwordAuth.success) {
        return passwordAuth;
      }

      // Remove biometric key from secure storage
      await secureStorage.remove('biometric_key');

      // Clear authentication state
      this.clearAuthState();

      return {
        success: true,
        message: 'Biometric authentication disabled successfully',
      };
    } catch (error) {
      console.error('Error disabling biometric auth:', error);

      return {
        success: false,
        error: 'DISABLE_ERROR',
        message: 'Failed to disable biometric authentication',
        originalError: error.message,
      };
    }
  }

  /**
   * Check if biometric authentication is enabled for the user
   * @returns {Promise<boolean>} True if biometric auth is enabled
   */
  async isBiometricEnabled() {
    try {
      const biometricKey = await secureStorage.retrieveBiometricKey();
      return biometricKey !== null;
    } catch (error) {
      console.error('Error checking biometric enabled status:', error);
      return false;
    }
  }

  /**
   * Get comprehensive biometric status
   * @returns {Promise<Object>} Complete biometric status
   */
  async getBiometricStatus() {
    try {
      const [enrollmentStatus, isEnabled, isRecentAuthValid] =
        await Promise.all([
          this.getBiometricEnrollmentStatus(),
          this.isBiometricEnabled(),
          Promise.resolve(this.isRecentAuthValid()),
        ]);

      return {
        ...enrollmentStatus,
        isEnabled,
        isRecentAuthValid,
        canAuthenticate: enrollmentStatus.canUseBiometric && isEnabled,
        lastAuthTime: this.lastAuthTime,
        recommendations: this.getBiometricRecommendations(
          enrollmentStatus,
          isEnabled
        ),
      };
    } catch (error) {
      console.error('Error getting biometric status:', error);

      return {
        hasHardware: false,
        isEnrolled: false,
        supportedTypes: [],
        canUseBiometric: false,
        isEnabled: false,
        isRecentAuthValid: false,
        canAuthenticate: false,
        error: error.message,
        recommendations: ['Unable to check biometric status'],
      };
    }
  }

  /**
   * Get recommendations based on biometric status
   * @param {Object} enrollmentStatus - Device enrollment status
   * @param {boolean} isEnabled - Whether biometric auth is enabled in app
   * @returns {Array<string>} Array of recommendation messages
   */
  getBiometricRecommendations(enrollmentStatus, isEnabled) {
    const recommendations = [];

    if (!enrollmentStatus.hasHardware) {
      recommendations.push(
        'Your device does not support biometric authentication'
      );
      return recommendations;
    }

    if (!enrollmentStatus.isEnrolled) {
      const typeNames = this.getTypeDisplayNames(
        enrollmentStatus.supportedTypes
      );
      recommendations.push(
        `Set up ${typeNames} in your device settings for faster login`
      );
      return recommendations;
    }

    if (!isEnabled) {
      recommendations.push(
        'Enable biometric authentication in app settings for faster login'
      );
    } else {
      recommendations.push('Biometric authentication is ready to use');
    }

    return recommendations;
  }
}

// Export singleton instance
const biometricService = new BiometricService();
export default biometricService;
