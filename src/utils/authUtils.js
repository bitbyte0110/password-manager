import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import bcrypt from 'react-native-bcrypt';
import { Alert } from 'react-native';

/**
 * Utility functions for authentication flows
 */

/**
 * Get MFA enabled state from storage (centralized function)
 * @returns {Promise<boolean>} MFA enabled state
 */
export const getMFAEnabled = async () => {
  try {
    // Check AsyncStorage first (primary source)
    const settings = await AsyncStorage.getItem('userSettings');
    if (settings) {
      const parsedSettings = JSON.parse(settings);
      return parsedSettings.mfaEnabled === true;
    }

    // Fallback to SecureStore
    const mfaSecure = await SecureStore.getItemAsync('vault_mfaEnabled');
    return mfaSecure === 'true';
  } catch (error) {
    console.error('Error getting MFA state:', error);
    // Default to false for security (require explicit enable)
    return false;
  }
};

/**
 * Get biometric enabled state from storage (centralized function)
 * @returns {Promise<boolean>} Biometric enabled state
 */
export const getBiometricEnabled = async () => {
  try {
    // Check AsyncStorage first (primary source)
    const settings = await AsyncStorage.getItem('userSettings');
    if (settings) {
      const parsedSettings = JSON.parse(settings);
      return parsedSettings.biometricEnabled === true;
    }

    // Fallback to SecureStore
    const biometricSecure = await SecureStore.getItemAsync(
      'vault_biometricEnabled'
    );
    return biometricSecure === 'true';
  } catch (error) {
    console.error('Error getting biometric state:', error);
    // Default to false for security (require explicit enable)
    return false;
  }
};

/**
 * Re-authenticate user based on their configured authentication method
 * @param {Object} options - Authentication options
 * @returns {Promise<Object>} Authentication result
 */
export const reAuthenticate = async (options = {}) => {
  const {
    promptTitle = 'Authentication Required',
    promptMessage = 'Please authenticate to continue',
  } = options;

  try {
    // Load user preferences using centralized functions
    const isBiometricEnabled = await getBiometricEnabled();
    const isMfaEnabled = await getMFAEnabled();

    // Check biometric availability
    let biometricAvailable = false;
    if (isBiometricEnabled) {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      biometricAvailable = hasHardware && isEnrolled;
    }

    // Determine authentication flow
    if (isMfaEnabled && biometricAvailable) {
      // MFA: Both biometric and password required
      return await authenticateWithMFA(promptTitle, promptMessage);
    } else if (isBiometricEnabled && biometricAvailable) {
      // Biometric only
      return await authenticateWithBiometric(promptTitle, promptMessage);
    } else {
      // Password only
      return await authenticateWithPassword(promptTitle, promptMessage);
    }
  } catch (error) {
    console.error('Re-authentication error:', error);
    return {
      success: false,
      error: 'AUTHENTICATION_ERROR',
      message: 'Authentication failed. Please try again.',
    };
  }
};

/**
 * Authenticate with biometric only
 */
const authenticateWithBiometric = async (title, message) => {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: message,
      cancelLabel: 'Cancel',
      fallbackLabel: 'Use Password',
    });

    if (result.success) {
      return {
        success: true,
        method: 'biometric',
        message: 'Biometric authentication successful',
      };
    } else {
      return {
        success: false,
        error: 'BIOMETRIC_FAILED',
        message: 'Biometric authentication failed',
        requiresPasswordFallback: true,
      };
    }
  } catch (error) {
    return {
      success: false,
      error: 'BIOMETRIC_ERROR',
      message: 'Biometric authentication error',
      requiresPasswordFallback: true,
    };
  }
};

/**
 * Authenticate with password modal
 */
const authenticateWithPassword = async (title, message) => {
  return new Promise(resolve => {
    Alert.prompt(
      title,
      message,
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () =>
            resolve({
              success: false,
              error: 'USER_CANCELLED',
              message: 'Authentication cancelled',
            }),
        },
        {
          text: 'Authenticate',
          onPress: async password => {
            if (!password || !password.trim()) {
              resolve({
                success: false,
                error: 'NO_PASSWORD',
                message: 'Password is required',
              });
              return;
            }

            try {
              const storedHash =
                await SecureStore.getItemAsync('vault_masterHash');
              if (!storedHash) {
                resolve({
                  success: false,
                  error: 'NO_MASTER_PASSWORD',
                  message: 'No master password found',
                });
                return;
              }

              const isValid = await bcrypt.compare(password, storedHash);
              if (isValid) {
                resolve({
                  success: true,
                  method: 'password',
                  message: 'Password authentication successful',
                  password: password,
                });
              } else {
                resolve({
                  success: false,
                  error: 'INVALID_PASSWORD',
                  message: 'Invalid password',
                });
              }
            } catch (error) {
              resolve({
                success: false,
                error: 'PASSWORD_ERROR',
                message: 'Password verification error',
              });
            }
          },
        },
      ],
      'secure-text'
    );
  });
};

/**
 * Authenticate with MFA (biometric + password)
 */
const authenticateWithMFA = async (title, message) => {
  try {
    // Step 1: Biometric authentication
    const biometricResult = await authenticateWithBiometric(
      title,
      'Complete biometric authentication first'
    );

    if (!biometricResult.success) {
      return biometricResult;
    }

    // Step 2: Password authentication
    const passwordResult = await authenticateWithPassword(
      title,
      'Now enter your master password'
    );

    if (!passwordResult.success) {
      return passwordResult;
    }

    return {
      success: true,
      method: 'mfa',
      message: 'Multi-factor authentication successful',
      password: passwordResult.password,
    };
  } catch (error) {
    return {
      success: false,
      error: 'MFA_ERROR',
      message: 'Multi-factor authentication failed',
    };
  }
};

/**
 * Show authentication required alert
 */
export const showAuthRequiredAlert = callback => {
  Alert.alert(
    'Authentication Required',
    'You must authenticate before accessing this feature.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Authenticate', onPress: callback },
    ]
  );
};
