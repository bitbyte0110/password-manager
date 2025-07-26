import 'react-native-get-random-values';
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
import vaultService from './src/services/vaultService';

// Import all screens
import SetMasterPasswordScreen from './src/screens/SetMasterPasswordScreen';
import ShowRecoveryPhraseScreen from './src/screens/ShowRecoveryPhraseScreen';
import LoginScreen from './src/screens/LoginScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import MyVaultScreen from './src/screens/MyVaultScreen';
import PasswordGeneratorScreen from './src/screens/PasswordGeneratorScreen';
import AddPasswordScreen from './src/screens/AddPasswordScreen';
import EditPasswordScreen from './src/screens/EditPasswordScreen';
import AddCategoryScreen from './src/screens/AddCategoryScreen';
import CategoriesScreen from './src/screens/CategoriesScreen';
import EditCategoryScreen from './src/screens/EditCategoryScreen';
import PasswordDetailsScreen from './src/screens/PasswordDetailsScreen';
import CategoryDetailsScreen from './src/screens/CategoryDetailsScreen';
import ChangeMasterPasswordScreen from './src/screens/ChangeMasterPasswordScreen';
import AutoLockSettingsScreen from './src/screens/AutoLockSettingsScreen';
import MFASettingsScreen from './src/screens/MFASettingsScreen';
import BiometricSettingsScreen from './src/screens/BiometricSettingsScreen';
import ClipboardSettingsScreen from './src/screens/ClipboardSettingsScreen';
import ResetVaultScreen from './src/screens/ResetVaultScreen';
import AppearanceSettingsScreen from './src/screens/AppearanceSettingsScreen';
import AboutScreen from './src/screens/AboutScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import TrashScreen from './src/screens/TrashScreen';
import RetentionSettingsScreen from './src/screens/RetentionSettingsScreen';
import ExportScreen from './src/screens/ExportScreen';
import ImportScreen from './src/screens/ImportScreen';
import { PasswordProvider } from './src/PasswordContext';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import { DatabaseProvider } from './src/contexts/DatabaseContext';

// Create Stack Navigator
const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// Constants for session management
const DEFAULT_ACTIVITY_TIMEOUT = 2 * 60 * 1000; // 2 minutes in milliseconds (default)
const LAST_ACTIVE_TIME_KEY = 'vault_lastActiveTime';

// Session Management Component
const SessionManager = ({ children, navigationRef }) => {
  const [appState, setAppState] = useState(AppState.currentState);

  useEffect(() => {
    // Update activity on mount
    updateActivity();

    let activityTimer;

    // Wait a bit for NavigationContainer to be ready before starting activity monitoring
    const initTimer = setTimeout(() => {
      // Set up activity monitoring - check every 10 seconds for better responsiveness
      activityTimer = setInterval(checkInactivity, 10000);
    }, 1000);

    // Set up app state monitoring
    const appStateSubscription = AppState.addEventListener(
      'change',
      handleAppStateChange
    );

    // Cleanup on unmount
    return () => {
      clearTimeout(initTimer);
      if (activityTimer) {
        clearInterval(activityTimer);
      }
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

  const getActivityTimeout = async () => {
    try {
      const settings = await AsyncStorage.getItem('userSettings');
      if (settings) {
        const parsedSettings = JSON.parse(settings);
        const userTimeout = parsedSettings.autoLockTimeout || 120;
        return userTimeout * 1000;
      }
    } catch (error) {
      console.error('Error loading auto-lock settings:', error);
    }
    return DEFAULT_ACTIVITY_TIMEOUT;
  };

  const checkInactivity = async () => {
    try {
      const lastActiveTime = await AsyncStorage.getItem(LAST_ACTIVE_TIME_KEY);

      if (!lastActiveTime) {
        return;
      }

      const activityTimeout = await getActivityTimeout();

      // Skip auto-logout if timeout is 0 (Never)
      if (activityTimeout === 0) {
        return;
      }

      const lastActive = parseInt(lastActiveTime, 10);
      const now = Date.now();
      const timeDifference = now - lastActive;

      if (timeDifference > activityTimeout) {
        console.log(
          `Session expired due to inactivity (${Math.round(timeDifference / 1000)}s > ${activityTimeout / 1000}s)`
        );

        // Clear session and navigate to login
        await handleSessionExpiry();
      }
    } catch (error) {
      console.error('Error checking inactivity:', error);
    }
  };

  const handleSessionExpiry = async () => {
    try {
      console.log(
        'Session expiry triggered - clearing all session data and redirecting to login'
      );

      // Clear vault service session
      await vaultService.clearSession();

      // Clear all session-related storage
      await AsyncStorage.removeItem(LAST_ACTIVE_TIME_KEY);
      await SecureStore.deleteItemAsync('vault_sessionToken');
      await SecureStore.deleteItemAsync('vault_biometricPassword');

      // Navigate directly to login without confirmation
      if (navigationRef.current) {
        console.log(
          'Navigation ref available, attempting to navigate to Login'
        );
        try {
          // Check if we're already on the login screen
          const currentRoute = navigationRef.current.getCurrentRoute();
          if (currentRoute?.name !== 'Login') {
            // Use reset to ensure complete navigation stack reset
            navigationRef.current.reset({
              index: 0,
              routes: [{ name: 'Login' }],
            });
            console.log('Successfully navigated to Login screen');
          } else {
            console.log('Already on Login screen, no navigation needed');
          }
        } catch (navError) {
          console.error('Error during navigation:', navError);
          // Secondary fallback: try basic navigation
          try {
            navigationRef.current.navigate('Login');
            console.log('Successfully navigated to Login using navigate');
          } catch (navigateError) {
            console.error('Error with navigate fallback:', navigateError);
          }
        }
      } else {
        console.error('Navigation ref not available for session expiry');
      }
    } catch (error) {
      console.error('Error handling session expiry:', error);
      // Even on error, try to navigate to login
      if (navigationRef.current) {
        try {
          navigationRef.current.reset({
            index: 0,
            routes: [{ name: 'Login' }],
          });
          console.log('Emergency navigation to Login completed');
        } catch (emergencyNavError) {
          console.error('Emergency navigation failed:', emergencyNavError);
          // Final fallback
          try {
            navigationRef.current.navigate('Login');
            console.log('Emergency navigate to Login completed');
          } catch (finalError) {
            console.error('All navigation methods failed:', finalError);
          }
        }
      }
    }
  };

  const handleAppStateChange = async nextAppState => {
    if (appState.match(/inactive|background/) && nextAppState === 'active') {
      console.log('App came to foreground, updating activity timestamp');
      // Simply update activity when app comes to foreground
      // Let the timer-based system handle logout based on actual inactivity time
      await updateActivity();
    } else if (nextAppState.match(/inactive|background/)) {
      console.log(
        'App going to background, preserving session for timer-based logout'
      );
      // Don't clear session data when app goes to background
      // The inactivity timer will handle logout if the timeout period is exceeded
      // This provides much better UX and is industry standard behavior
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
  const { theme: appTheme } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ color, size }) => {
          let iconName;
          if (route.name === 'MyVault') iconName = 'shield-alt';
          else if (route.name === 'Categories') iconName = 'folder-open';
          else if (route.name === 'PasswordGenerator') iconName = 'key';
          else if (route.name === 'Settings') iconName = 'cog';
          return <Icon name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: appTheme.colors.tabBarActive,
        tabBarInactiveTintColor: appTheme.colors.tabBarInactive,
        tabBarStyle: {
          backgroundColor: appTheme.colors.tabBar,
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

      // Step 2: Master password exists, always require authentication
      console.log('Master password exists, requiring fresh authentication');

      // Clear any existing sessions to ensure fresh login
      try {
        await vaultService.clearSession();
        await SecureStore.deleteItemAsync('vault_sessionToken');
        await AsyncStorage.removeItem(LAST_ACTIVE_TIME_KEY);
        console.log('Cleared existing sessions for fresh authentication');
      } catch (error) {
        console.error('Error clearing existing sessions:', error);
      }

      // Always require authentication - no session restoration
      return 'Login';
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
      <Stack.Screen name="EditPasswordScreen" component={EditPasswordScreen} />
      <Stack.Screen name="AddCategory" component={AddCategoryScreen} />
      <Stack.Screen name="EditCategory" component={EditCategoryScreen} />
      <Stack.Screen name="PasswordDetails" component={PasswordDetailsScreen} />
      <Stack.Screen name="CategoryDetails" component={CategoryDetailsScreen} />
      <Stack.Screen
        name="ChangeMasterPassword"
        component={ChangeMasterPasswordScreen}
      />
      <Stack.Screen
        name="AutoLockSettings"
        component={AutoLockSettingsScreen}
      />
      <Stack.Screen name="MFASettings" component={MFASettingsScreen} />
      <Stack.Screen
        name="BiometricSettings"
        component={BiometricSettingsScreen}
      />
      <Stack.Screen
        name="ClipboardSettings"
        component={ClipboardSettingsScreen}
      />
      <Stack.Screen name="ResetVault" component={ResetVaultScreen} />
      <Stack.Screen
        name="AppearanceSettings"
        component={AppearanceSettingsScreen}
      />
      <Stack.Screen name="About" component={AboutScreen} />
      <Stack.Screen
        name="Trash"
        component={TrashScreen}
        options={{
          title: 'Trash',
          headerShown: true,
          headerTitleAlign: 'center',
        }}
      />
      <Stack.Screen
        name="RetentionSettings"
        component={RetentionSettingsScreen}
        options={{
          title: 'Retention Period',
          headerShown: true,
          headerTitleAlign: 'center',
        }}
      />
      <Stack.Screen
        name="Export"
        component={ExportScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="Import"
        component={ImportScreen}
        options={{
          headerShown: false,
        }}
      />
    </Stack.Navigator>
  );
};

// Wrapper component to use dynamic theme with PaperProvider
const AppWithTheme = () => {
  const navigationRef = React.useRef();
  const { theme: appTheme } = useTheme();

  // Convert our theme to React Native Paper theme format
  const paperTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      primary: appTheme.colors.primary,
      accent: appTheme.colors.secondary,
      background: appTheme.colors.background,
      surface: appTheme.colors.surface,
      text: appTheme.colors.text,
      placeholder: appTheme.colors.textSecondary,
      backdrop: appTheme.colors.modalOverlay,
    },
  };

  return (
    <PaperProvider theme={paperTheme}>
      <DatabaseProvider>
        <PasswordProvider>
          <NavigationContainer ref={navigationRef}>
            <SessionManager navigationRef={navigationRef}>
              <AppNavigator />
              <StatusBar style={appTheme.isDark ? 'light' : 'dark'} />
            </SessionManager>
          </NavigationContainer>
        </PasswordProvider>
      </DatabaseProvider>
    </PaperProvider>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <AppWithTheme />
    </ThemeProvider>
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
