import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, AppState } from 'react-native';
import { Provider as PaperProvider, DefaultTheme } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/FontAwesome5';
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
import AddCategoryScreen from './src/screens/AddCategoryScreen';
import CategoriesScreen from './src/screens/CategoriesScreen';
import EditCategoryScreen from './src/screens/EditCategoryScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { PasswordProvider } from './src/PasswordContext';

// Create Stack Navigator
const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

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

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ color, size }) => {
          let iconName;
          if (route.name === 'MyVault') iconName = 'shield-alt';
          else if (route.name === 'Categories') iconName = 'folder';
          else if (route.name === 'PasswordGenerator') iconName = 'key';
          else if (route.name === 'Settings') iconName = 'cog';
          return <Icon name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: '#666666',
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
        },
      })}
    >
      <Tab.Screen
        name="MyVault"
        component={MyVaultScreen}
        options={{ tabBarLabel: 'My Vault' }}
      />
      <Tab.Screen
        name="Categories"
        component={CategoriesScreen}
        options={{ tabBarLabel: 'Categories' }}
      />
      <Tab.Screen
        name="PasswordGenerator"
        component={PasswordGeneratorScreen}
        options={{ tabBarLabel: 'Generator' }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ tabBarLabel: 'Settings' }}
      />
    </Tab.Navigator>
  );
}

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
        // Clear any session tokens since session is expired
        try {
          await SecureStore.deleteItemAsync('vault_sessionToken');
        } catch (error) {
          console.error('Error clearing expired session token:', error);
        }
        return 'Login';
      } else {
        // Session still valid, go directly to MainTabs
        console.log(
          `Session valid (${Math.round(timeDifference / 1000)}s ago), accessing MainTabs`
        );
        // Update activity timestamp
        await AsyncStorage.setItem(LAST_ACTIVE_TIME_KEY, Date.now().toString());
        return 'MainTabs';
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
        name="ShowRecoveryPhraseScreen"
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
        name="MainTabs"
        component={MainTabs}
        options={{ gestureEnabled: false }}
      />
      <Stack.Screen name="AddPassword" component={AddPasswordScreen} />
      <Stack.Screen name="AddCategory" component={AddCategoryScreen} />
      <Stack.Screen name="EditCategory" component={EditCategoryScreen} />
    </Stack.Navigator>
  );
};

export default function App() {
  return (
    <PaperProvider theme={theme}>
      <PasswordProvider>
        <NavigationContainer>
          <SessionManager>
            <AppNavigator />
            <StatusBar style="auto" />
          </SessionManager>
        </NavigationContainer>
      </PasswordProvider>
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
