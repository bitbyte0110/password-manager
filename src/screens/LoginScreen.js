import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Modal,
  Alert,
} from 'react-native';
import { Button, Snackbar } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import bcrypt from 'bcryptjs';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { useNavigation } from '@react-navigation/native';
import vaultService from '../services/vaultService';
import { useTheme } from '../contexts/ThemeContext';
import SecureTextInput from '../components/SecureTextInput';
import { getMFAEnabled, getBiometricEnabled } from '../utils/authUtils';

// Password lockout constants
const FAILED_ATTEMPTS_KEY = 'vault_failedAttempts';
const LOCKOUT_TIME_KEY = 'vault_lockoutTime';

// Biometric failure constants
const BIOMETRIC_FAILED_ATTEMPTS_KEY = 'vault_biometricFailCount';
const BIOMETRIC_LAST_FAILED_KEY = 'vault_lastBiometricFailed';

const MAX_FAILED_ATTEMPTS = 3;
const LOCKOUT_DURATION = 30 * 60 * 1000; // 30 minutes
const BIOMETRIC_TIMEOUT_DURATION = 30 * 1000; // 30 seconds

const LoginScreen = ({ navigation: navProp }) => {
  const navigation = navProp || useNavigation();
  const { theme } = useTheme();

  // State management
  const [masterPassword, setMasterPassword] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [lockoutEndTime, setLockoutEndTime] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  // New state for enhanced features
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [biometricFailedAttempts, setBiometricFailedAttempts] = useState(0);
  const [biometricLocked, setBiometricLocked] = useState(false);
  const [biometricLockoutEnd, setBiometricLockoutEnd] = useState(null);
  const [isAutoAuthenticating, setIsAutoAuthenticating] = useState(false);
  const [mfaMode, setMfaMode] = useState(false); // When waiting for password after biometric success
  const [biometricSucceeded, setBiometricSucceeded] = useState(false); // Track if biometric auth succeeded

  useEffect(() => {
    initializeScreen();
  }, []);

  // Reload preferences when screen comes into focus (important for settings changes)
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      console.log('LoginScreen focused - reloading user preferences');
      loadUserPreferences();
    });

    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    let interval;
    if (isLocked && lockoutEndTime) {
      interval = setInterval(() => {
        const now = Date.now();
        if (now >= lockoutEndTime) {
          setIsLocked(false);
          setLockoutEndTime(null);
          resetFailedAttempts();
        }
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isLocked, lockoutEndTime]);

  useEffect(() => {
    let interval;
    if (biometricLocked && biometricLockoutEnd) {
      interval = setInterval(() => {
        const now = Date.now();
        if (now >= biometricLockoutEnd) {
          setBiometricLocked(false);
          setBiometricLockoutEnd(null);
          resetBiometricFailedAttempts();
        }
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [biometricLocked, biometricLockoutEnd]);

  const initializeScreen = async () => {
    await checkMasterPasswordExists();
    await checkFailedAttempts();
    await checkBiometricFailedAttempts();
    const biometricHWAvailable = await checkBiometricAvailability();
    await loadUserPreferences();

    // Auto-trigger biometric if enabled in settings, available, and not locked
    if (biometricHWAvailable && biometricEnabled && !biometricLocked) {
      console.log(
        'Auto-triggering biometric authentication (enabled in settings)'
      );
      setIsAutoAuthenticating(true);
      setTimeout(() => {
        handleBiometricLogin(true);
      }, 500); // Small delay for better UX
    } else {
      console.log('Biometric auto-trigger skipped:', {
        hwAvailable: biometricHWAvailable,
        enabled: biometricEnabled,
        locked: biometricLocked,
      });
    }
  };

  const loadUserPreferences = async () => {
    try {
      console.log('Loading user preferences from storage...');

      // Use centralized functions for consistent storage access
      const biometricEnabledValue = await getBiometricEnabled();
      const mfaEnabledValue = await getMFAEnabled();

      setBiometricEnabled(biometricEnabledValue);
      setMfaEnabled(mfaEnabledValue);

      console.log('🔐 Final login options set:', {
        biometricEnabled: biometricEnabledValue,
        mfaEnabled: mfaEnabledValue,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error loading user preferences:', error);
      // Default to false on error for security
      setBiometricEnabled(false);
      setMfaEnabled(false);
    }
  };

  const checkMasterPasswordExists = async () => {
    try {
      const masterHash = await SecureStore.getItemAsync('vault_masterHash');
      if (!masterHash) {
        // No master password set, redirect to SetMasterPasswordScreen
        navigation.replace('SetMasterPasswordScreen');
      }
    } catch (error) {
      console.error('Error checking master password:', error);
      showSnackbar('Error checking vault status');
    }
  };

  const checkFailedAttempts = async () => {
    try {
      const attempts = await AsyncStorage.getItem(FAILED_ATTEMPTS_KEY);
      const lockoutTime = await AsyncStorage.getItem(LOCKOUT_TIME_KEY);

      const currentAttempts = attempts ? parseInt(attempts, 10) : 0;
      setFailedAttempts(currentAttempts);

      if (lockoutTime) {
        const lockoutEndTime = parseInt(lockoutTime, 10);
        const now = Date.now();

        if (now < lockoutEndTime) {
          setIsLocked(true);
          setLockoutEndTime(lockoutEndTime);
        } else {
          // Lockout expired, reset
          await resetFailedAttempts();
        }
      }
    } catch (error) {
      console.error('Error checking failed attempts:', error);
    }
  };

  const checkBiometricFailedAttempts = async () => {
    try {
      const attempts = await AsyncStorage.getItem(
        BIOMETRIC_FAILED_ATTEMPTS_KEY
      );
      const lastFailed = await AsyncStorage.getItem(BIOMETRIC_LAST_FAILED_KEY);

      const currentAttempts = attempts ? parseInt(attempts, 10) : 0;
      setBiometricFailedAttempts(currentAttempts);

      if (lastFailed && currentAttempts >= MAX_FAILED_ATTEMPTS) {
        const lastFailedTime = parseInt(lastFailed, 10);
        const now = Date.now();
        const lockoutEnd = lastFailedTime + BIOMETRIC_TIMEOUT_DURATION;

        if (now < lockoutEnd) {
          setBiometricLocked(true);
          setBiometricLockoutEnd(lockoutEnd);
        } else {
          // Timeout expired, reset biometric attempts
          await resetBiometricFailedAttempts();
        }
      }
    } catch (error) {
      console.error('Error checking biometric failed attempts:', error);
    }
  };

  const checkBiometricAvailability = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const available = hasHardware && isEnrolled;
      setBiometricAvailable(available);
      return available;
    } catch (error) {
      console.error('Error checking biometric availability:', error);
      setBiometricAvailable(false);
      return false;
    }
  };

  const incrementFailedAttempts = async () => {
    try {
      const newAttempts = failedAttempts + 1;
      setFailedAttempts(newAttempts);
      await AsyncStorage.setItem(FAILED_ATTEMPTS_KEY, newAttempts.toString());

      if (newAttempts >= MAX_FAILED_ATTEMPTS) {
        const lockoutEndTime = Date.now() + LOCKOUT_DURATION;
        await AsyncStorage.setItem(LOCKOUT_TIME_KEY, lockoutEndTime.toString());
        setIsLocked(true);
        setLockoutEndTime(lockoutEndTime);
        showLockoutModal();
      }
    } catch (error) {
      console.error('Error incrementing failed attempts:', error);
    }
  };

  const incrementBiometricFailedAttempts = async () => {
    try {
      const newAttempts = biometricFailedAttempts + 1;
      setBiometricFailedAttempts(newAttempts);
      await AsyncStorage.setItem(
        BIOMETRIC_FAILED_ATTEMPTS_KEY,
        newAttempts.toString()
      );

      if (newAttempts >= MAX_FAILED_ATTEMPTS) {
        const now = Date.now();
        const lockoutEnd = now + BIOMETRIC_TIMEOUT_DURATION;
        await AsyncStorage.setItem(BIOMETRIC_LAST_FAILED_KEY, now.toString());
        setBiometricLocked(true);
        setBiometricLockoutEnd(lockoutEnd);
        showSnackbar(
          `Biometric locked for 30 seconds. Please use password login.`
        );
      } else {
        showSnackbar(
          `Biometric failed. ${MAX_FAILED_ATTEMPTS - newAttempts} attempts remaining.`
        );
      }
    } catch (error) {
      console.error('Error incrementing biometric failed attempts:', error);
    }
  };

  const resetFailedAttempts = async () => {
    try {
      setFailedAttempts(0);
      await AsyncStorage.removeItem(FAILED_ATTEMPTS_KEY);
      await AsyncStorage.removeItem(LOCKOUT_TIME_KEY);
    } catch (error) {
      console.error('Error resetting failed attempts:', error);
    }
  };

  const resetBiometricFailedAttempts = async () => {
    try {
      setBiometricFailedAttempts(0);
      await AsyncStorage.removeItem(BIOMETRIC_FAILED_ATTEMPTS_KEY);
      await AsyncStorage.removeItem(BIOMETRIC_LAST_FAILED_KEY);
    } catch (error) {
      console.error('Error resetting biometric failed attempts:', error);
    }
  };

  const handleBiometricLogin = async (isAutoTrigger = false) => {
    if (!biometricAvailable) {
      if (!isAutoTrigger) {
        showSnackbar(
          'Biometric authentication not available. Please use password login.'
        );
      }
      setIsAutoAuthenticating(false);
      return;
    }

    if (biometricLocked) {
      showSnackbar(
        'Biometric authentication is temporarily locked. Please use password login.'
      );
      setIsAutoAuthenticating(false);
      return;
    }

    setIsLoading(true);

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to access SecureVault',
        cancelLabel: 'Cancel',
        fallbackLabel: 'Use Password',
      });

      if (result.success) {
        console.log('Biometric authentication successful');
        await resetBiometricFailedAttempts();
        setBiometricSucceeded(true);

        // Check if MFA is enabled
        if (mfaEnabled) {
          console.log(
            '🔐 MFA is ENABLED - requiring both biometric and password'
          );
          // MFA enabled: Show password modal for second factor
          setMfaMode(true);
          setShowPasswordModal(true);
          showSnackbar(
            'MFA Step 1 complete: Biometric verified. Please enter your master password.'
          );
        } else {
          console.log(
            '🔐 MFA is DISABLED - attempting biometric-only authentication'
          );
          // MFA disabled: Try to authenticate with biometric alone
          try {
            // Initialize vault service first
            await vaultService.initialize();

            // Optimize biometric-only authentication for instant login
            const biometricAuthSuccess =
              await vaultService.authenticateWithBiometric();

            if (biometricAuthSuccess) {
              console.log(
                '✅ Biometric-only authentication successful! Navigating immediately'
              );
              // Navigate instantly - no additional processing needed
              navigation.replace('MainTabs');
              return;
            } else {
              // Check if this is first-time setup by looking for biometric password storage
              const hasBiometricPassword = await SecureStore.getItemAsync(
                'vault_biometricPassword'
              );
              const hasSessionToken =
                await SecureStore.getItemAsync('vault_sessionToken');

              console.log('🔍 Biometric auth failed - checking storage:', {
                hasBiometricPassword: !!hasBiometricPassword,
                hasSessionToken: !!hasSessionToken,
                mfaEnabled: mfaEnabled,
              });

              if (!hasBiometricPassword && !hasSessionToken) {
                console.log(
                  '🔐 MFA DISABLED: First-time biometric setup - need password to enable biometric storage'
                );
                // First time setup - prompt for password to enable biometric storage
                setMfaMode(false);
                setShowPasswordModal(true);
                showSnackbar(
                  'First-time setup: Enter your master password to enable biometric-only login for future access.'
                );
              } else {
                console.log(
                  '🔐 MFA DISABLED: Biometric storage exists but authentication failed - trying password fallback'
                );
                // Biometric storage exists but failed - could be session expired or other issues
                setMfaMode(false);
                setShowPasswordModal(true);
                showSnackbar(
                  'Biometric authentication failed. Please enter your master password.'
                );
              }
            }
          } catch (error) {
            console.error('Error during biometric authentication:', error);
            setMfaMode(false);
            setShowPasswordModal(true);
            showSnackbar(
              'Please enter your master password to access vault data.'
            );
          }
        }
      } else {
        if (result.error === 'user_cancel') {
          if (!isAutoTrigger) {
            showSnackbar('Biometric authentication cancelled');
          }
        } else {
          await incrementBiometricFailedAttempts();
        }
      }
    } catch (error) {
      console.error('Biometric authentication error:', error);
      if (!isAutoTrigger) {
        showSnackbar(
          'Biometric authentication error. Please use password login.'
        );
      }
    } finally {
      setIsLoading(false);
      setIsAutoAuthenticating(false);
    }
  };

  const handlePasswordLogin = async () => {
    setPasswordError(''); // Clear any previous errors

    if (!masterPassword.trim()) {
      setPasswordError('Please enter your master password');
      return;
    }

    if (isLocked) {
      setPasswordError('Account is locked due to too many failed attempts');
      return;
    }

    setIsLoading(true);

    try {
      const storedHash = await SecureStore.getItemAsync('vault_masterHash');

      if (!storedHash) {
        showSnackbar('No master password found. Please set up your vault.');
        navigation.replace('SetMasterPasswordScreen');
        return;
      }

      // Optimize: Let vaultService handle password verification to avoid double bcrypt
      console.log(
        'Delegating password verification to vault service for optimal performance'
      );
      await resetFailedAttempts();
      await resetBiometricFailedAttempts(); // Reset biometric attempts on successful password

      try {
        // Clear session and authenticate with single bcrypt operation
        await vaultService.clearSession();
        const authSuccess = await vaultService.authenticate(masterPassword);

        if (authSuccess) {
          console.log(
            'Vault service authenticated successfully - navigating immediately'
          );

          // Update UI state and navigate immediately
          setShowPasswordModal(false);
          setMasterPassword('');
          setMfaMode(false);
          setBiometricSucceeded(false);

          // Navigate immediately for instant login
          navigation.replace('MainTabs');
        } else {
          await incrementFailedAttempts();
          if (mfaMode) {
            setPasswordError(
              'Invalid master password. MFA Step 2 failed - both biometric and password required.'
            );
          } else {
            setPasswordError(
              `Invalid password. ${MAX_FAILED_ATTEMPTS - (failedAttempts + 1)} attempts remaining.`
            );
          }
          setMasterPassword('');
        }
      } catch (vaultError) {
        console.error('Error authenticating vault service:', vaultError);
        // Handle specific authentication errors
        if (vaultError.message?.includes('Invalid')) {
          await incrementFailedAttempts();
          setPasswordError('Invalid master password');
          setMasterPassword('');
        } else {
          showSnackbar('Authentication error. Please try again.');
        }
        return;
      }
    } catch (error) {
      console.error('Password authentication error:', error);
      showSnackbar('Authentication error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const showLockoutModal = () => {
    Alert.alert(
      'Account Locked',
      'Too many failed attempts. Choose an option:',
      [
        {
          text: 'Use Recovery Phrase',
          onPress: () => navigation.navigate('RecoveryScreen'),
        },
        {
          text: 'Reset Vault',
          onPress: () => navigation.navigate('ResetVaultScreen'),
          style: 'destructive',
        },
      ],
      { cancelable: false }
    );
  };

  const handleForgotPassword = () => {
    setShowPasswordModal(false);
    setMfaMode(false);
    setBiometricSucceeded(false);
    navigation.navigate('ForgotPassword');
  };

  const handleResetVault = () => {
    setShowPasswordModal(false);
    setMfaMode(false);
    setBiometricSucceeded(false);
    Alert.alert(
      'Reset Vault',
      'This will permanently delete all stored data. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => navigation.navigate('ResetVaultScreen'),
        },
      ]
    );
  };

  const handleCancelPasswordModal = () => {
    setShowPasswordModal(false);
    setMasterPassword('');
    setShowPassword(false);
    setMfaMode(false);
    setBiometricSucceeded(false);
    setPasswordError(''); // Clear any error when modal is closed
  };

  const showSnackbar = message => {
    setSnackbar({ visible: true, message });
  };

  const formatRemainingTime = () => {
    if (!lockoutEndTime) return '';

    const remaining = Math.max(0, lockoutEndTime - Date.now());
    const minutes = Math.floor(remaining / (60 * 1000));
    const seconds = Math.floor((remaining % (60 * 1000)) / 1000);

    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatBiometricRemainingTime = () => {
    if (!biometricLockoutEnd) return '';

    const remaining = Math.max(0, biometricLockoutEnd - Date.now());
    const seconds = Math.floor(remaining / 1000);

    return `${seconds}s`;
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <LinearGradient
        colors={[theme.colors.primary, theme.colors.secondary]}
        style={styles.gradient}
      >
        <View style={styles.content}>
          {/* Logo */}
          <View style={styles.logoContainer}>
            <LinearGradient
              colors={[theme.colors.primary, theme.colors.secondary]}
              style={styles.logo}
            >
              <Icon name="shield-alt" size={40} color="#fff" />
            </LinearGradient>
          </View>

          {/* Title */}
          <Text style={styles.title}>SecureVault</Text>
          <Text style={styles.subtitle}>Your Trusted Password Manager</Text>

          {/* Auto-authentication indicator */}
          {isAutoAuthenticating && (
            <View style={styles.autoAuthContainer}>
              <Icon name="fingerprint" size={24} color="#fff" />
              <Text style={styles.autoAuthText}>
                Checking biometric authentication...
              </Text>
            </View>
          )}

          {/* Lockout Warning */}
          {isLocked && (
            <View style={styles.lockoutContainer}>
              <Icon name="exclamation-triangle" size={24} color="#fff" />
              <Text style={styles.lockoutText}>
                Account locked for {formatRemainingTime()}
              </Text>
              <Text style={styles.lockoutSubtext}>
                Too many failed attempts. Try again later or use recovery
                options.
              </Text>
            </View>
          )}

          {/* Biometric Lockout Warning */}
          {biometricLocked && (
            <View style={styles.lockoutContainer}>
              <Icon name="fingerprint" size={24} color="#fff" />
              <Text style={styles.lockoutText}>
                Biometric locked for {formatBiometricRemainingTime()}
              </Text>
              <Text style={styles.lockoutSubtext}>
                Too many failed biometric attempts. Use password login.
              </Text>
            </View>
          )}

          {/* Login Buttons */}
          <View style={styles.buttonContainer}>
            {/* Biometric Login Button - Only show if biometric is enabled in settings */}
            {biometricEnabled && (
              <TouchableOpacity
                style={styles.loginButton}
                onPress={() => handleBiometricLogin(false)}
                disabled={
                  isLoading ||
                  isLocked ||
                  !biometricAvailable ||
                  biometricLocked ||
                  isAutoAuthenticating
                }
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#3366cc', '#3B82F6']}
                  style={[
                    styles.buttonGradient,
                    (!biometricAvailable || isLocked || biometricLocked) &&
                      styles.disabledGradient,
                  ]}
                >
                  <Icon
                    name="fingerprint"
                    size={20}
                    color="#FFFFFF"
                    style={styles.buttonIcon}
                  />
                  <Text style={styles.buttonText}>Login with Biometric</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}

            {/* Password Login Button */}
            <TouchableOpacity
              style={styles.loginButton}
              onPress={() => setShowPasswordModal(true)}
              disabled={isLoading || isLocked}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#1E3A8A', '#3B82F6']}
                style={[
                  styles.buttonGradient,
                  isLocked && styles.disabledGradient,
                ]}
              >
                <Icon
                  name="lock"
                  size={20}
                  color="#FFFFFF"
                  style={styles.buttonIcon}
                />
                <Text style={styles.buttonText}>Login with Password</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Failed Attempts Warning */}
          {failedAttempts > 0 && !isLocked && (
            <Text style={styles.warningText}>
              {failedAttempts} failed password attempt
              {failedAttempts > 1 ? 's' : ''}.
              {MAX_FAILED_ATTEMPTS - failedAttempts} remaining.
            </Text>
          )}

          {/* Biometric Failed Attempts Warning */}
          {biometricFailedAttempts > 0 && !biometricLocked && (
            <Text style={styles.warningText}>
              {biometricFailedAttempts} failed biometric attempt
              {biometricFailedAttempts > 1 ? 's' : ''}.
              {MAX_FAILED_ATTEMPTS - biometricFailedAttempts} remaining.
            </Text>
          )}
        </View>
      </LinearGradient>

      {/* Password Modal */}
      <Modal
        visible={showPasswordModal}
        animationType="slide"
        transparent
        onRequestClose={handleCancelPasswordModal}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              { backgroundColor: theme.colors.card },
            ]}
          >
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
              {mfaMode
                ? 'Multi-Factor Authentication'
                : 'Vault Access Required'}
            </Text>

            <Text
              style={[
                styles.modalSubtitle,
                { color: theme.colors.textSecondary },
              ]}
            >
              {mfaMode
                ? biometricSucceeded
                  ? 'Step 2 of 2: Biometric authentication successful. Please enter your master password to complete MFA login.'
                  : 'Multi-Factor Authentication is enabled. Please enter your master password to complete the second authentication step.'
                : biometricSucceeded
                  ? 'Biometric authentication successful. Please enter your master password to access your vault.'
                  : 'Please enter your master password to access your vault.'}
            </Text>

            <SecureTextInput
              label="Master Password"
              value={masterPassword}
              onChangeText={text => {
                setMasterPassword(text);
                if (passwordError) setPasswordError(''); // Clear error when user types
              }}
              showPassword={showPassword}
              onTogglePassword={() => setShowPassword(!showPassword)}
              placeholder="Enter your master password"
              error={!!passwordError}
              errorText={passwordError}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handlePasswordLogin}
              style={styles.modalInput}
              testID="login-password-input"
            />

            {passwordError ? (
              <Text style={[styles.errorText, { color: theme.colors.error }]}>
                {passwordError}
              </Text>
            ) : null}

            <View style={styles.modalButtons}>
              <Button
                mode="text"
                onPress={handleForgotPassword}
                style={styles.modalLinkButton}
                textColor={theme.colors.primary}
              >
                <Text style={{ color: theme.colors.primary }}>
                  Forgot Password?
                </Text>
              </Button>
            </View>

            <View style={styles.modalActionButtons}>
              <TouchableOpacity
                style={styles.modalCancelButtonContainer}
                onPress={handleCancelPasswordModal}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.modalCancelButtonContent,
                    { backgroundColor: '#3A3A3C', borderColor: '#3A3A3C' },
                  ]}
                >
                  <Text
                    style={[styles.modalCancelButtonText, { color: '#FFFFFF' }]}
                  >
                    Cancel
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalLoginButtonContainer}
                onPress={handlePasswordLogin}
                disabled={!masterPassword.trim() || isLoading}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={[theme.colors.primary, theme.colors.secondary]}
                  style={[
                    styles.modalLoginButtonGradient,
                    (!masterPassword.trim() || isLoading) &&
                      styles.disabledGradient,
                  ]}
                >
                  {isLoading ? (
                    <Text style={styles.modalLoginButtonText}>Loading...</Text>
                  ) : (
                    <Text style={styles.modalLoginButtonText}>Login</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Snackbar */}
      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ visible: false, message: '' })}
        duration={3000}
      >
        {snackbar.message}
      </Snackbar>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 48,
  },
  autoAuthContainer: {
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  autoAuthText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 8,
    textAlign: 'center',
  },
  lockoutContainer: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 15,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  lockoutText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 10,
    textAlign: 'center',
  },
  lockoutSubtext: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 5,
    textAlign: 'center',
  },
  buttonContainer: {
    width: '80%',
    alignItems: 'center',
  },
  loginButton: {
    width: '100%',
    height: 56,
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    height: 56,
    borderRadius: 16,
  },
  disabledGradient: {
    opacity: 0.6,
  },
  buttonIcon: {
    marginRight: 10,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    flex: 1,
  },
  warningText: {
    marginTop: 20,
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 350,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  modalInput: {
    marginBottom: 8,
  },
  errorText: {
    fontSize: 12,
    marginTop: 4,
    marginBottom: 16,
    marginLeft: 12,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  modalLinkButton: {
    flex: 1,
  },
  modalActionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalCancelButtonContainer: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    overflow: 'hidden',
  },
  modalCancelButtonContent: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  modalCancelButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalLoginButtonContainer: {
    flex: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  modalLoginButtonGradient: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  modalLoginButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default LoginScreen;
