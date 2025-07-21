import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { useNavigation } from '@react-navigation/native';
import vaultService from '../services/vaultService';

const LAST_ACTIVE_TIME_KEY = 'vault_lastActiveTime';
const DEFAULT_ACTIVITY_TIMEOUT = 2 * 60 * 1000; // 2 minutes

export const useSessionManager = () => {
  const navigation = useNavigation();
  const appState = useRef(AppState.currentState);
  const sessionCheckInterval = useRef(null);

  const updateActivity = async () => {
    try {
      const timestamp = Date.now().toString();
      await AsyncStorage.setItem(LAST_ACTIVE_TIME_KEY, timestamp);
    } catch (error) {
      console.error('Error updating activity timestamp:', error);
    }
  };

  const getActivityTimeout = async () => {
    try {
      const settings = await AsyncStorage.getItem('userSettings');
      if (settings) {
        const parsedSettings = JSON.parse(settings);
        const userTimeout = parsedSettings.autoLockTimeout !== undefined 
          ? parsedSettings.autoLockTimeout 
          : 120; // Default 120 seconds
        
        const result = userTimeout === 0 ? 0 : userTimeout * 1000;
        console.log(`SessionManager: Auto-lock setting - raw: ${userTimeout}s, processed: ${result === 0 ? 'NEVER' : result + 'ms'}`);
        return result;
      }
    } catch (error) {
      console.error('Error loading auto-lock settings:', error);
    }
    console.log(`SessionManager: Using default timeout: ${DEFAULT_ACTIVITY_TIMEOUT}ms`);
    return DEFAULT_ACTIVITY_TIMEOUT;
  };

  const checkSessionExpiry = async () => {
    try {
      const lastActiveTime = await AsyncStorage.getItem(LAST_ACTIVE_TIME_KEY);

      if (!lastActiveTime) {
        return false; // No activity recorded
      }

      const activityTimeout = await getActivityTimeout();
      
      // If auto-lock is disabled (timeout = 0), never expire the session
      if (activityTimeout === 0) {
        console.log('SessionManager: Auto-lock disabled (Never), session will not expire');
        return false;
      }

      const lastActive = parseInt(lastActiveTime, 10);
      const now = Date.now();
      const timeDifference = now - lastActive;

      if (timeDifference > activityTimeout) {
        console.log(
          `Session expired due to inactivity (${Math.round(timeDifference / 1000)}s > ${activityTimeout / 1000}s)`
        );

        // Clear session data
        await vaultService.clearSession();
        await AsyncStorage.removeItem(LAST_ACTIVE_TIME_KEY);

        // Navigate to login screen
        navigation.replace('Login');
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error checking session expiry:', error);
      return false;
    }
  };

  const handleAppStateChange = async nextAppState => {
    if (
      appState.current.match(/inactive|background/) &&
      nextAppState === 'active'
    ) {
      // App came to foreground, check session expiry
      await checkSessionExpiry();
    } else if (nextAppState.match(/inactive|background/)) {
      // App going to background, update activity
      await updateActivity();
    }
    appState.current = nextAppState;
  };

  const startSessionMonitoring = () => {
    // Check session every 10 seconds when app is active
    sessionCheckInterval.current = setInterval(() => {
      if (AppState.currentState === 'active') {
        checkSessionExpiry();
      }
    }, 10000);
  };

  const stopSessionMonitoring = () => {
    if (sessionCheckInterval.current) {
      clearInterval(sessionCheckInterval.current);
      sessionCheckInterval.current = null;
    }
  };

  useEffect(() => {
    // Update activity on mount
    updateActivity();

    // Start session monitoring
    startSessionMonitoring();

    // Set up app state listener
    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange
    );

    return () => {
      subscription?.remove();
      stopSessionMonitoring();
    };
  }, []);

  return {
    updateActivity,
    checkSessionExpiry,
  };
};
