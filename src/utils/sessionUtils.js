/**
 * Session Utilities - Helper functions for session token management
 */

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage keys
export const SESSION_TOKEN_KEY = 'vault_persistentSessionToken';
export const AUTO_LOCK_SETTINGS_KEY = 'vault_autoLockSettings';
export const LAST_ACTIVE_TIME_KEY = 'vault_lastActiveTime';

/**
 * Creates a persistent session token for "Never" auto-lock setting
 * @returns {Promise<boolean>} Success status
 */
export const createPersistentSessionToken = async () => {
  try {
    const tokenData = {
      createdAt: Date.now(),
      sessionId: generateSessionId(),
      version: '1.0',
      // Optional: Add expiration for additional security
      // expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000), // 30 days
    };
    
    await SecureStore.setItemAsync(SESSION_TOKEN_KEY, JSON.stringify(tokenData));
    console.log('SessionUtils: Persistent session token created');
    return true;
  } catch (error) {
    console.error('SessionUtils: Error creating persistent session token:', error);
    return false;
  }
};

/**
 * Removes the persistent session token
 * @returns {Promise<boolean>} Success status
 */
export const removePersistentSessionToken = async () => {
  try {
    await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
    console.log('SessionUtils: Persistent session token removed');
    return true;
  } catch (error) {
    console.error('SessionUtils: Error removing persistent session token:', error);
    return false;
  }
};

/**
 * Validates the persistent session token
 * @returns {Promise<boolean>} Whether token is valid
 */
export const validatePersistentSessionToken = async () => {
  try {
    const sessionToken = await SecureStore.getItemAsync(SESSION_TOKEN_KEY);
    if (!sessionToken) {
      console.log('SessionUtils: No persistent session token found');
      return false;
    }

    const tokenData = JSON.parse(sessionToken);
    
    // Basic validation
    if (!tokenData.createdAt || !tokenData.sessionId) {
      console.log('SessionUtils: Invalid token structure');
      await removePersistentSessionToken();
      return false;
    }

    // Check if token is expired (if expiration is set)
    if (tokenData.expiresAt && tokenData.expiresAt < Date.now()) {
      console.log('SessionUtils: Session token expired');
      await removePersistentSessionToken();
      return false;
    }

    console.log('SessionUtils: Valid persistent session token found');
    return true;
  } catch (error) {
    console.error('SessionUtils: Error validating session token:', error);
    await removePersistentSessionToken();
    return false;
  }
};

/**
 * Gets the auto-lock settings
 * @returns {Promise<Object>} Auto-lock settings
 */
export const getAutoLockSettings = async () => {
  try {
    const settings = await AsyncStorage.getItem(AUTO_LOCK_SETTINGS_KEY);
    if (settings) {
      const parsedSettings = JSON.parse(settings);
      return {
        timeout: parsedSettings.timeout || 120, // Default 120 seconds
        enabled: parsedSettings.enabled !== false,
      };
    }
    return {
      timeout: 120, // Default 120 seconds
      enabled: true,
    };
  } catch (error) {
    console.error('SessionUtils: Error loading auto-lock settings:', error);
    return {
      timeout: 120,
      enabled: true,
    };
  }
};

/**
 * Saves the auto-lock settings
 * @param {Object} settings - Settings object with timeout and enabled properties
 * @returns {Promise<boolean>} Success status
 */
export const saveAutoLockSettings = async (settings) => {
  try {
    await AsyncStorage.setItem(AUTO_LOCK_SETTINGS_KEY, JSON.stringify(settings));
    
    // If user selects "Never" (timeout: 0), create persistent session token
    if (settings.timeout === 0) {
      await createPersistentSessionToken();
    }
    // If user changes from "Never" to any other setting, remove persistent session token
    else {
      await removePersistentSessionToken();
    }
    
    console.log('SessionUtils: Auto-lock settings saved:', settings);
    return true;
  } catch (error) {
    console.error('SessionUtils: Error saving auto-lock settings:', error);
    return false;
  }
};

/**
 * Updates the last activity timestamp
 * @returns {Promise<boolean>} Success status
 */
export const updateLastActivity = async () => {
  try {
    const timestamp = Date.now().toString();
    await AsyncStorage.setItem(LAST_ACTIVE_TIME_KEY, timestamp);
    return true;
  } catch (error) {
    console.error('SessionUtils: Error updating activity timestamp:', error);
    return false;
  }
};

/**
 * Checks if session should be expired due to inactivity
 * @returns {Promise<boolean>} Whether session should expire
 */
export const shouldExpireSession = async () => {
  try {
    const lastActiveTime = await AsyncStorage.getItem(LAST_ACTIVE_TIME_KEY);
    if (!lastActiveTime) {
      console.log('SessionUtils: No activity timestamp found');
      return true; // No activity timestamp, require login
    }

    const autoLockSettings = await getAutoLockSettings();
    
    // Skip logout check if auto-lock is set to "Never"
    if (autoLockSettings.timeout === 0) {
      console.log('SessionUtils: Auto-lock set to Never, session should not expire');
      return false;
    }

    const lastActive = parseInt(lastActiveTime, 10);
    const now = Date.now();
    const timeDifference = now - lastActive;
    const timeoutMs = autoLockSettings.timeout * 1000;

    const shouldExpire = timeDifference > timeoutMs;
    
    if (shouldExpire) {
      console.log(
        `SessionUtils: Session should expire (${Math.round(
          timeDifference / 1000
        )}s > ${autoLockSettings.timeout}s)`
      );
    }

    return shouldExpire;
  } catch (error) {
    console.error('SessionUtils: Error checking session expiration:', error);
    return true; // On error, require login for security
  }
};

/**
 * Checks if persistent session should skip login
 * @returns {Promise<boolean>} Whether to skip login
 */
export const shouldSkipLogin = async () => {
  try {
    // Check if master password is set
    const existingHash = await SecureStore.getItemAsync('vault_masterHash');
    if (!existingHash) {
      console.log('SessionUtils: No master password set');
      return false;
    }

    // Get auto-lock settings
    const autoLockSettings = await getAutoLockSettings();
    
    // Only check for persistent session if auto-lock is set to "Never" (0)
    if (autoLockSettings.timeout !== 0) {
      console.log('SessionUtils: Auto-lock not set to Never');
      return false;
    }

    // Check for valid session token when auto-lock is "Never"
    const isValidToken = await validatePersistentSessionToken();
    
    console.log(`SessionUtils: Should skip login: ${isValidToken}`);
    return isValidToken;
  } catch (error) {
    console.error('SessionUtils: Error checking if should skip login:', error);
    return false;
  }
};

/**
 * Clears all session data
 * @returns {Promise<boolean>} Success status
 */
export const clearAllSessionData = async () => {
  try {
    await Promise.all([
      removePersistentSessionToken(),
      AsyncStorage.removeItem(LAST_ACTIVE_TIME_KEY),
      SecureStore.deleteItemAsync('vault_sessionToken'), // Remove any other session tokens
    ]);
    
    console.log('SessionUtils: All session data cleared');
    return true;
  } catch (error) {
    console.error('SessionUtils: Error clearing session data:', error);
    return false;
  }
};

/**
 * Generates a unique session ID
 * @returns {string} Session ID
 */
const generateSessionId = () => {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
};

/**
 * Gets session info for debugging
 * @returns {Promise<Object>} Session information
 */
export const getSessionInfo = async () => {
  try {
    const [sessionToken, autoLockSettings, lastActiveTime] = await Promise.all([
      SecureStore.getItemAsync(SESSION_TOKEN_KEY),
      getAutoLockSettings(),
      AsyncStorage.getItem(LAST_ACTIVE_TIME_KEY),
    ]);

    let parsedToken = null;
    if (sessionToken) {
      try {
        parsedToken = JSON.parse(sessionToken);
      } catch (e) {
        // Invalid token format
      }
    }

    return {
      hasSessionToken: !!sessionToken,
      sessionTokenValid: parsedToken !== null,
      sessionCreatedAt: parsedToken?.createdAt,
      autoLockTimeout: autoLockSettings.timeout,
      autoLockEnabled: autoLockSettings.enabled,
      lastActiveTime: lastActiveTime ? parseInt(lastActiveTime, 10) : null,
      currentTime: Date.now(),
    };
  } catch (error) {
    console.error('SessionUtils: Error getting session info:', error);
    return {
      hasSessionToken: false,
      sessionTokenValid: false,
      error: error.message,
    };
  }
};