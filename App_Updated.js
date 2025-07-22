import 'react-native-get-random-values';
import React, { useState, useEffect, useRef } from 'react';
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
const LAST_ACTIVE_TIME_KEY = 'vault_lastActiveTime';
const SESSION_TOKEN_KEY = 'vault_persistentSessionToken';
const AUTO_LOCK_SETTINGS_KEY = 'vault_autoLockSettings';
const DEFAULT_ACTIVITY_TIMEOUT = 2 * 60 * 1000; // 2 minutes in milliseconds

// Authentication Context
const AuthContext = React.createContext();

// Session and Authentication Manager Component
const AuthenticationManager = ({ children, navigationRef }) => {
  const [appState, setAppState] = useState(AppState.currentState);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const inactivityTimerRef = useRef(null);

  useEffect(() => {
    initializeAuth();

    // Set up app state monitoring
    const appStateSubscription = AppState.addEventListener(
      'change',
      handleAppStateChange
    );

    // Cleanup on unmount
    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
      appStateSubscription?.remove();
    };
  }, []);

  const initializeAuth = async () => {
    try {
      console.log('AuthenticationManager: Initializing authentication...');
      const shouldSkipLogin = await checkPersistentSession();
      
      if (shouldSkipLogin) {
        console.log('AuthenticationManager: Persistent session found, skipping login');
        setIsAuthenticated(true);
        await updateLastActivity();
        startInactivityTimer();
      } else {
        console.log('AuthenticationManager: No persistent session, requiring authentication');
        setIsAuthenticated(false);
      }
      
      setIsInitialized(true);
    } catch (error) {
      console.error('AuthenticationManager: Error initializing auth:', error);
      setIsAuthenticated(false);
      setIsInitialized(true);
    }
  };

  const checkPersistentSession = async () => {
    try {
      // Check if master password is set
      const existingHash = await SecureStore.getItemAsync('vault_masterHash');
      if (!existingHash) {
        console.log('AuthenticationManager: No master password set');
        return false;
      }

      // Get auto-lock settings
      const autoLockSettings = await getAutoLockSettings();
      
      // Only check for persistent session if auto-lock is set to "Never" (0)
      if (autoLockSettings.timeout !== 0) {
        console.log('AuthenticationManager: Auto-lock not set to Never, requiring login');
        return false;
      }

      // Check for valid session token when auto-lock is "Never"
      const sessionToken = await SecureStore.getItemAsync(SESSION_TOKEN_KEY);
      if (!sessionToken) {
        console.log('AuthenticationManager: No persistent session token found');
        return false;
      }

      // Validate session token (you can add more validation logic here)
      try {
        const tokenData = JSON.parse(sessionToken);
        const now = Date.now();
        
        // Check if token is not expired (optional additional check)
        if (tokenData.expiresAt && tokenData.expiresAt < now) {
          console.log('AuthenticationManager: Session token expired');
          await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
          return false;
        }

        console.log('AuthenticationManager: Valid persistent session token found');
        return true;
      } catch (parseError) {
        console.error('AuthenticationManager: Error parsing session token:', parseError);
        await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
        return false;
      }
    } catch (error) {
      console.error('AuthenticationManager: Error checking persistent session:', error);
      return false;
    }
  };

  const getAutoLockSettings = async () => {
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
      console.error('AuthenticationManager: Error loading auto-lock settings:', error);
      return {
        timeout: 120,
        enabled: true,
      };
    }
  };

  const saveAutoLockSettings = async (settings) => {
    try {
      await AsyncStorage.setItem(AUTO_LOCK_SETTINGS_KEY, JSON.stringify(settings));
      
      // If user selects "Never" (timeout: 0), create persistent session token
      if (settings.timeout === 0 && isAuthenticated) {
        await createPersistentSessionToken();
      }
      // If user changes from "Never" to any other setting, remove persistent session token
      else if (settings.timeout !== 0) {
        await removePersistentSessionToken();
      }
      
      // Restart inactivity timer with new settings
      startInactivityTimer();
      
      console.log('AuthenticationManager: Auto-lock settings saved:', settings);
    } catch (error) {
      console.error('AuthenticationManager: Error saving auto-lock settings:', error);
    }
  };

  const createPersistentSessionToken = async () => {
    try {
      const tokenData = {
        createdAt: Date.now(),
        sessionId: Math.random().toString(36).substr(2, 9),
        // Optional: Add expiration for additional security (e.g., 30 days)
        // expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000), // 30 days
      };
      
      await SecureStore.setItemAsync(SESSION_TOKEN_KEY, JSON.stringify(tokenData));
      console.log('AuthenticationManager: Persistent session token created');
    } catch (error) {
      console.error('AuthenticationManager: Error creating persistent session token:', error);
    }
  };

  const removePersistentSessionToken = async () => {
    try {
      await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
      console.log('AuthenticationManager: Persistent session token removed');
    } catch (error) {
      console.error('AuthenticationManager: Error removing persistent session token:', error);
    }
  };

  const login = async (masterPassword, rememberSession = false) => {
    try {
      console.log('AuthenticationManager: Processing login...');
      
      // Your existing login validation logic here
      const masterHash = await SecureStore.getItemAsync('vault_masterHash');
      if (!masterHash) {
        throw new Error('No master password set');
      }

      // Validate password (implement your validation logic)
      // This is just a placeholder - use your actual validation
      const isValidPassword = await validateMasterPassword(masterPassword, masterHash);
      if (!isValidPassword) {
        throw new Error('Invalid master password');
      }

      // Set authentication state
      setIsAuthenticated(true);
      await updateLastActivity();
      
      // Get current auto-lock settings
      const autoLockSettings = await getAutoLockSettings();
      
      // Create persistent session token if auto-lock is set to "Never"
      if (autoLockSettings.timeout === 0) {
        await createPersistentSessionToken();
      }

      // Start inactivity monitoring
      startInactivityTimer();
      
      console.log('AuthenticationManager: Login successful');
      return true;
    } catch (error) {
      console.error('AuthenticationManager: Login failed:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      console.log('AuthenticationManager: Processing logout...');
      
      // Clear authentication state
      setIsAuthenticated(false);
      
      // Clear persistent session token regardless of auto-lock setting
      await removePersistentSessionToken();
      
      // Clear last activity
      await AsyncStorage.removeItem(LAST_ACTIVE_TIME_KEY);
      
      // Clear vault service session
      await vaultService.clearSession();
      
      // Stop inactivity timer
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      
      // Navigate to login screen
      if (navigationRef.current) {
        navigationRef.current.reset({
          index: 0,
          routes: [{ name: 'Login' }],
        });
      }
      
      console.log('AuthenticationManager: Logout completed');
    } catch (error) {
      console.error('AuthenticationManager: Error during logout:', error);
    }
  };

  const updateLastActivity = async () => {
    try {
      const timestamp = Date.now().toString();
      await AsyncStorage.setItem(LAST_ACTIVE_TIME_KEY, timestamp);
    } catch (error) {
      console.error('AuthenticationManager: Error updating activity timestamp:', error);
    }
  };

  const startInactivityTimer = async () => {
    // Clear existing timer
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }

    // Only start timer if authenticated and auto-lock is enabled
    if (!isAuthenticated) return;

    try {
      const autoLockSettings = await getAutoLockSettings();
      
      // Don't start timer if auto-lock is disabled or set to "Never"
      if (!autoLockSettings.enabled || autoLockSettings.timeout === 0) {
        console.log('AuthenticationManager: Inactivity timer disabled (Never/Disabled)');
        return;
      }

      const timeoutMs = autoLockSettings.timeout * 1000; // Convert to milliseconds
      
      console.log(`AuthenticationManager: Starting inactivity timer (${autoLockSettings.timeout}s)`);
      
      inactivityTimerRef.current = setTimeout(async () => {
        console.log('AuthenticationManager: Inactivity timeout reached, logging out');
        await logout();
      }, timeoutMs);
      
    } catch (error) {
      console.error('AuthenticationManager: Error starting inactivity timer:', error);
    }
  };

  const handleAppStateChange = async (nextAppState) => {
    console.log(`AuthenticationManager: App state changed from ${appState} to ${nextAppState}`);
    
    if (appState.match(/inactive|background/) && nextAppState === 'active') {
      // App came to foreground
      console.log('AuthenticationManager: App came to foreground');
      
      if (isAuthenticated) {
        const autoLockSettings = await getAutoLockSettings();
        
        // If auto-lock is not "Never", check if we should logout due to inactivity
        if (autoLockSettings.timeout !== 0) {
          const shouldLogout = await checkInactivityLogout();
          if (shouldLogout) {
            await logout();
            return;
          }
        }
        
        // Update activity and restart timer
        await updateLastActivity();
        startInactivityTimer();
      } else {
        // If not authenticated, check if we should auto-login with persistent session
        await initializeAuth();
      }
    } else if (nextAppState.match(/inactive|background/)) {
      // App going to background
      console.log('AuthenticationManager: App going to background');
      await updateLastActivity();
      
      // Stop inactivity timer while in background
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
    }

    setAppState(nextAppState);
  };

  const checkInactivityLogout = async () => {
    try {
      const lastActiveTime = await AsyncStorage.getItem(LAST_ACTIVE_TIME_KEY);
      if (!lastActiveTime) return true; // No activity timestamp, require login

      const autoLockSettings = await getAutoLockSettings();
      
      // Skip logout check if auto-lock is set to "Never"
      if (autoLockSettings.timeout === 0) return false;

      const lastActive = parseInt(lastActiveTime, 10);
      const now = Date.now();
      const timeDifference = now - lastActive;
      const timeoutMs = autoLockSettings.timeout * 1000;

      if (timeDifference > timeoutMs) {
        console.log(
          `AuthenticationManager: Session expired due to inactivity (${Math.round(
            timeDifference / 1000
          )}s > ${autoLockSettings.timeout}s)`
        );
        return true;
      }

      return false;
    } catch (error) {
      console.error('AuthenticationManager: Error checking inactivity logout:', error);
      return true; // On error, require login for security
    }
  };

  // Placeholder for your actual password validation logic
  const validateMasterPassword = async (password, hash) => {
    // Implement your actual password validation logic here
    // This is just a placeholder
    try {
      const bcrypt = require('bcryptjs');
      return await bcrypt.compare(password, hash);
    } catch (error) {
      console.error('AuthenticationManager: Error validating password:', error);
      return false;
    }
  };

  const authContextValue = {
    isAuthenticated,
    isInitialized,
    login,
    logout,
    updateLastActivity,
    saveAutoLockSettings,
    getAutoLockSettings,
  };

  return (
    <AuthContext.Provider value={authContextValue}>
      <View style={styles.container} onTouchStart={updateLastActivity}>
        {children}
      </View>
    </AuthContext.Provider>
  );
};

// Hook to use authentication context
export const useAuth = () => {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthenticationManager');
  }
  return context;
};

// Main Tabs Component
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

// Route Guard Component
const RouteGuard = ({ children }) => {
  const { isAuthenticated, isInitialized } = useAuth();

  if (!isInitialized) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>SecureVault</Text>
        <Text style={styles.loadingSubtext}>Initializing secure vault...</Text>
      </View>
    );
  }

  return children;
};

// Main App Navigator
const AppNavigator = () => {
  const { isAuthenticated } = useAuth();
  const [masterPasswordExists, setMasterPasswordExists] = useState(null);

  useEffect(() => {
    checkMasterPassword();
  }, []);

  const checkMasterPassword = async () => {
    try {
      const existingHash = await SecureStore.getItemAsync('vault_masterHash');
      setMasterPasswordExists(!!existingHash);
    } catch (error) {
      console.error('Error checking master password:', error);
      setMasterPasswordExists(false);
    }
  };

  if (masterPasswordExists === null) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>SecureVault</Text>
        <Text style={styles.loadingSubtext}>Initializing secure vault...</Text>
      </View>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        gestureEnabled: false,
        animationTypeForReplace: 'push',
      }}
    >
      {!masterPasswordExists ? (
        // Master password setup flow
        <>
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
        </>
      ) : !isAuthenticated ? (
        // Authentication required
        <>
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{ gestureEnabled: false }}
          />
          <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        </>
      ) : (
        // Authenticated user screens
        <>
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
            options={{ title: 'Trash' }}
          />
          <Stack.Screen
            name="RetentionSettings"
            component={RetentionSettingsScreen}
            options={{ title: 'Retention Period' }}
          />
          <Stack.Screen
            name="Export"
            component={ExportScreen}
            options={{ title: 'Export Vault' }}
          />
          <Stack.Screen
            name="Import"
            component={ImportScreen}
            options={{ title: 'Import Vault' }}
          />
        </>
      )}
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
      <PasswordProvider>
        <NavigationContainer ref={navigationRef}>
          <AuthenticationManager navigationRef={navigationRef}>
            <RouteGuard>
              <AppNavigator />
              <StatusBar style={appTheme.isDark ? 'light' : 'dark'} />
            </RouteGuard>
          </AuthenticationManager>
        </NavigationContainer>
      </PasswordProvider>
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
  container: {
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