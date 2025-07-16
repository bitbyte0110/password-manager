import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, AppState } from 'react-native';
import { Provider as PaperProvider, DefaultTheme } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Import all screens
import SetMasterPasswordScreen from './src/screens/SetMasterPasswordScreen';
import ShowRecoveryPhraseScreen from './src/screens/ShowRecoveryPhraseScreen';
import LoginScreen from './src/screens/LoginScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import MyVaultScreen from './src/screens/MyVaultScreen';
import PasswordGeneratorScreen from './src/screens/PasswordGeneratorScreen';
import AddPasswordScreen from './src/screens/AddPasswordScreen';
import CategoriesScreen from './src/screens/CategoriesScreen';

// Create Stack Navigator
const Stack = createStackNavigator();

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

// Session Management Component
const SessionManager = ({ children }) => {
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
        // No activity recorded, but don't trigger logout in session manager
        return;
      }

      const lastActive = parseInt(lastActiveTime, 10);
      const now = Date.now();
      const timeDifference = now - lastActive;

      if (timeDifference > ACTIVITY_TIMEOUT) {
        // Session expired - this will be handled by individual screens
        console.log('Session expired due to inactivity');
      }
    } catch (error) {
      console.error('Error checking inactivity:', error);
    }
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

  return (
    <View style={styles.sessionContainer} onTouchStart={updateActivity}>
      {children}
    </View>
  );
};

// Main App Navigator
const AppNavigator = () => {
  const [initialRoute, setInitialRoute] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      setIsLoading(true);
      const route = await checkVaultStatus();
      setInitialRoute(route);
    } catch (error) {
      console.error('Error initializing app:', error);
      // On error, default to SetMasterPasswordScreen for safety
      setInitialRoute('SetMasterPassword');
    } finally {
      setIsLoading(false);
    }
  };

  const checkVaultStatus = async () => {
    try {
      // Step 1: Check if master password exists
      const existingHash = await SecureStore.getItemAsync('vault_masterHash');

      if (!existingHash) {
        // No master password set, show SetMasterPasswordScreen
        console.log('No master password found, showing setup screen');
        return 'SetMasterPassword';
      }

      // Step 2: Master password exists, check session validity
      console.log('Master password exists, checking session validity');
      const lastActiveTime = await AsyncStorage.getItem(LAST_ACTIVE_TIME_KEY);

      if (!lastActiveTime) {
        // No activity timestamp, require authentication
        console.log('No activity timestamp found, requiring authentication');
        return 'Login';
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
        return 'Login';
      } else {
        // Session still valid, go directly to MyVault
        console.log(
          `Session valid (${Math.round(timeDifference / 1000)}s ago), accessing MyVault`
        );
        // Update activity timestamp
        await AsyncStorage.setItem(LAST_ACTIVE_TIME_KEY, Date.now().toString());
        return 'MyVault';
      }
    } catch (error) {
      console.error('Error checking vault status:', error);
      // On error, require authentication for security
      return 'Login';
    }
  };

  if (isLoading || !initialRoute) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>SecureVault</Text>
        <Text style={styles.loadingSubtext}>Initializing secure vault...</Text>
      </View>
    );
  }

  return (
    <SessionManager>
      <Stack.Navigator
        initialRouteName={initialRoute}
        screenOptions={{
          headerShown: false,
          gestureEnabled: false,
          animationTypeForReplace: 'push',
        }}
      >
        <Stack.Screen
          name="SetMasterPassword"
          component={SetMasterPasswordScreen}
          options={{ gestureEnabled: false }}
        />
        <Stack.Screen
          name="ShowRecoveryPhrase"
          component={ShowRecoveryPhraseScreen}
          options={{ gestureEnabled: false }}
        />
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ gestureEnabled: false }}
        />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        <Stack.Screen
          name="MyVault"
          component={MyVaultScreen}
          options={{ gestureEnabled: false }}
        />
        <Stack.Screen
          name="PasswordGenerator"
          component={PasswordGeneratorScreen}
        />
        <Stack.Screen name="AddPassword" component={AddPasswordScreen} />
        <Stack.Screen name="Categories" component={CategoriesScreen} />
      </Stack.Navigator>
    </SessionManager>
  );
};

export default function App() {
  return (
    <PaperProvider theme={theme}>
      <NavigationContainer>
        <AppNavigator />
        <StatusBar style="auto" />
      </NavigationContainer>
    </PaperProvider>
  );
}

const styles = StyleSheet.create({
  sessionContainer: {
    flex: 1,
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
});
