import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, AppState } from 'react-native';
import { Provider as PaperProvider, DefaultTheme } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SetMasterPasswordScreen from './src/screens/SetMasterPasswordScreen';
import ShowRecoveryPhraseScreen from './src/screens/ShowRecoveryPhraseScreen';
import LoginScreen from './src/screens/LoginScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import MyVaultScreen from './src/screens/MyVaultScreen';

const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#8e44ad',
    accent: '#3498db',
  },
};

// Constants for session management
const ACTIVITY_TIMEOUT = 2 * 60 * 1000; // 2 minutes in milliseconds
const ACTIVITY_CHECK_INTERVAL = 30 * 1000; // 30 seconds
const LAST_ACTIVE_TIME_KEY = 'vault_lastActiveTime';

// Enhanced MainApp component with activity tracking and auto-logout
const MainApp = ({ navigation }) => {
  const [appState, setAppState] = useState(AppState.currentState);

  useEffect(() => {
    // Update activity on mount
    updateActivity();

    // Set up activity monitoring
    const activityTimer = setInterval(checkInactivity, ACTIVITY_CHECK_INTERVAL);

    // Set up app state monitoring
    const appStateSubscription = AppState.addEventListener(
      'change',
      handleAppStateChange
    );

    // Cleanup on unmount
    return () => {
      clearInterval(activityTimer);
      appStateSubscription?.remove();
    };
  }, []);

  const updateActivity = async () => {
    try {
      const timestamp = Date.now().toString();
      await AsyncStorage.setItem(LAST_ACTIVE_TIME_KEY, timestamp);
    } catch (error) {
      console.error('Error updating activity timestamp:', error);
    }
  };

  const checkInactivity = async () => {
    try {
      const lastActiveTime = await AsyncStorage.getItem(LAST_ACTIVE_TIME_KEY);

      if (!lastActiveTime) {
        // No activity recorded, trigger logout
        triggerAutoLogout();
        return;
      }

      const lastActive = parseInt(lastActiveTime, 10);
      const now = Date.now();
      const timeDifference = now - lastActive;

      if (timeDifference > ACTIVITY_TIMEOUT) {
        triggerAutoLogout();
      }
    } catch (error) {
      console.error('Error checking inactivity:', error);
      // On error, assume session expired for security
      triggerAutoLogout();
    }
  };

  const triggerAutoLogout = () => {
    console.log('Auto-logout triggered due to inactivity');

    // Clear any sensitive data from memory if needed
    // Note: SecureStore data persists for re-authentication

    // Navigate to LoginScreen (not SetMasterPasswordScreen since master password exists)
    navigation.replace('LoginScreen');
  };

  const handleAppStateChange = async nextAppState => {
    if (appState.match(/inactive|background/) && nextAppState === 'active') {
      // App came to foreground, check if session expired
      console.log('App came to foreground, checking session validity');
      await checkInactivity();
    } else if (nextAppState.match(/inactive|background/)) {
      // App going to background, update activity timestamp
      console.log('App going to background, updating activity timestamp');
      await updateActivity();
    }

    setAppState(nextAppState);
  };

  // Create enhanced navigation object that includes activity tracking
  const enhancedNavigation = {
    ...navigation,
    replace: (screenName, params = {}) => {
      updateActivity();
      navigation.replace(screenName, params);
    },
    navigate: (screenName, params = {}) => {
      updateActivity();
      navigation.navigate(screenName, params);
    },
  };

  return (
    <View style={styles.container} onTouchStart={updateActivity}>
      <MyVaultScreen navigation={enhancedNavigation} />
      <StatusBar style="auto" />
    </View>
  );
};

export default function App() {
  const [currentScreen, setCurrentScreen] = useState('loading');
  const [screenParams, setScreenParams] = useState({});
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      setIsInitializing(true);
      await checkVaultStatus();
    } catch (error) {
      console.error('Error initializing app:', error);
      // On error, default to SetMasterPasswordScreen for safety
      setCurrentScreen('SetMasterPassword');
    } finally {
      setIsInitializing(false);
    }
  };

  const checkVaultStatus = async () => {
    try {
      // Step 1: Check if master password exists
      const existingHash = await SecureStore.getItemAsync('vault_masterHash');

      if (!existingHash) {
        // No master password set, show SetMasterPasswordScreen
        console.log('No master password found, showing setup screen');
        setCurrentScreen('SetMasterPassword');
        return;
      }

      // Step 2: Master password exists, check session validity
      console.log('Master password exists, checking session validity');
      const lastActiveTime = await AsyncStorage.getItem(LAST_ACTIVE_TIME_KEY);

      if (!lastActiveTime) {
        // No activity timestamp, require authentication
        console.log('No activity timestamp found, requiring authentication');
        setCurrentScreen('LoginScreen');
        return;
      }

      // Step 3: Check if session is still valid (within 2 minutes)
      const lastActive = parseInt(lastActiveTime, 10);
      const now = Date.now();
      const timeDifference = now - lastActive;

      if (timeDifference > ACTIVITY_TIMEOUT) {
        // Session expired, require re-authentication
        console.log(
          `Session expired (${Math.round(timeDifference / 1000)}s ago), requiring authentication`
        );
        setCurrentScreen('LoginScreen');
      } else {
        // Session still valid, go directly to MainApp
        console.log(
          `Session valid (${Math.round(timeDifference / 1000)}s ago), accessing MainApp`
        );
        setCurrentScreen('MainApp');
      }
    } catch (error) {
      console.error('Error checking vault status:', error);
      // On error, require authentication for security
      setCurrentScreen('LoginScreen');
    }
  };

  // Enhanced navigation object with session management
  const navigation = {
    replace: (screenName, params = {}) => {
      console.log(`Navigating to: ${screenName}`);
      setCurrentScreen(screenName);
      setScreenParams(params);

      // Update activity when navigating to MainApp
      if (screenName === 'MainApp') {
        updateActivityTimestamp();
      }
    },
    navigate: (screenName, params = {}) => {
      console.log(`Navigating to: ${screenName}`);
      setCurrentScreen(screenName);
      setScreenParams(params);

      // Update activity when navigating to MainApp
      if (screenName === 'MainApp') {
        updateActivityTimestamp();
      }
    },
  };

  const updateActivityTimestamp = async () => {
    try {
      const timestamp = Date.now().toString();
      await AsyncStorage.setItem(LAST_ACTIVE_TIME_KEY, timestamp);
    } catch (error) {
      console.error('Error updating activity timestamp:', error);
    }
  };

  if (isInitializing) {
    return (
      <PaperProvider theme={theme}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>SecureVault</Text>
          <Text style={styles.loadingSubtext}>
            Initializing secure vault...
          </Text>
        </View>
      </PaperProvider>
    );
  }

  const renderScreen = () => {
    switch (currentScreen) {
      case 'SetMasterPassword':
        return <SetMasterPasswordScreen navigation={navigation} />;
      case 'ShowRecoveryPhraseScreen':
        return (
          <ShowRecoveryPhraseScreen
            navigation={navigation}
            route={{ params: screenParams }}
          />
        );
      case 'LoginScreen':
        return <LoginScreen navigation={navigation} />;
      case 'ForgotPasswordScreen':
        return <ForgotPasswordScreen navigation={navigation} />;
      case 'MainApp':
        return <MainApp navigation={navigation} />;
      case 'RecoveryScreen':
        // TODO: Add RecoveryScreen component when implemented
        return (
          <View style={styles.container}>
            <Text style={styles.welcomeText}>Recovery Screen</Text>
            <Text style={styles.subText}>Coming Soon</Text>
          </View>
        );
      case 'ResetVaultScreen':
        // TODO: Add ResetVaultScreen component when implemented
        return (
          <View style={styles.container}>
            <Text style={styles.welcomeText}>Reset Vault Screen</Text>
            <Text style={styles.subText}>Coming Soon</Text>
          </View>
        );
      default:
        return <SetMasterPasswordScreen navigation={navigation} />;
    }
  };

  return <PaperProvider theme={theme}>{renderScreen()}</PaperProvider>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#8e44ad',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  loadingSubtext: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#8e44ad',
    marginBottom: 16,
    textAlign: 'center',
  },
  subText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 12,
  },
});
