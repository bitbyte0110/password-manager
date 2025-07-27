import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { Button, Snackbar } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { useNavigation } from '@react-navigation/native';
import vaultService from '../services/vaultService';
import { useTheme } from '../contexts/ThemeContext';
import SecureTextInput from '../components/SecureTextInput';
import { getMFAEnabled, getBiometricEnabled } from '../utils/authUtils';

// Password lockout constants
const FAILED_ATTEMPTS_KEY = 'vault_failedAttempts';
const MAX_FAILED_ATTEMPTS = 3;

const LoginScreen = ({ navigation: navProp }) => {
  const navigation = navProp || useNavigation();
  const { theme } = useTheme();

  // State management
  const [masterPassword, setMasterPassword] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [showLockoutModal, setShowLockoutModal] = useState(false);

  // New state for enhanced features
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(false);
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
      checkFailedAttempts();
    });

    return unsubscribe;
  }, [navigation]);

  const initializeScreen = async () => {
    await checkMasterPasswordExists();
    await checkFailedAttempts();
    const biometricHWAvailable = await checkBiometricAvailability();
    await loadUserPreferences();

    // Auto-trigger biometric if enabled in settings, available, and not locked
    if (biometricHWAvailable && biometricEnabled && !isLocked) {
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
        locked: isLocked,
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
      const currentAttempts = attempts ? parseInt(attempts, 10) : 0;
      setFailedAttempts(currentAttempts);

      if (currentAttempts >= MAX_FAILED_ATTEMPTS) {
        setIsLocked(true);
      }
    } catch (error) {
      console.error('Error checking failed attempts:', error);
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
        setIsLocked(true);
        setShowLockoutModal(true);
      }
    } catch (error) {
      console.error('Error incrementing failed attempts:', error);
    }
  };

  const resetFailedAttempts = async () => {
    try {
      setFailedAttempts(0);
      setIsLocked(false);
      await AsyncStorage.removeItem(FAILED_ATTEMPTS_KEY);
    } catch (error) {
      console.error('Error resetting failed attempts:', error);
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

    if (isLocked) {
      showSnackbar('Account is locked. Please use recovery phrase.');
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
            '🔐 MFA is DISABLED - biometric authentication at OS level succeeded, granting access'
          );
          // MFA disabled: OS-level biometric success is sufficient for vault access
          try {
            // Initialize vault service first
            await vaultService.initialize();

            // Try optimized biometric authentication first (uses stored credentials)
            const biometricAuthSuccess =
              await vaultService.authenticateWithBiometric();

            if (biometricAuthSuccess) {
              console.log(
                '✅ Biometric authentication successful via stored session/credentials!'
              );
              await resetFailedAttempts();
              navigation.replace('MainTabs');
              return;
            }

            // If biometric storage/session is not available but OS biometric auth succeeded,
            // and MFA is disabled, we should allow access by creating a temporary session.
            // This is the key fix: don't require password entry when MFA is disabled.
            console.log(
              '🔐 MFA DISABLED: OS biometric succeeded, attempting direct vault access'
            );

            // Try to get the master password hash to verify the vault is set up
            const masterHash =
              await SecureStore.getItemAsync('vault_masterHash');
            if (!masterHash) {
              throw new Error('No vault found');
            }

            // The issue is that biometric storage or session is not available.
            // When MFA is disabled, we should NOT require password entry after successful biometric auth.
            // Instead, let's check if we can restore the session with more lenient settings.

            console.log(
              '🔐 MFA DISABLED: Checking if we can restore authentication with extended session'
            );

            // Since MFA is disabled and OS biometric auth succeeded,
            // try to restore authentication with a longer session timeout
            const sessionRestored =
              await vaultService.tryRestoreAuthentication();
            if (sessionRestored) {
              console.log('✅ Extended session restored after biometric auth!');
              await resetFailedAttempts();
              navigation.replace('MainTabs');
              return;
            }

            // When MFA is disabled and OS biometric auth succeeded, grant immediate access
            // No setup required - biometric authentication at OS level is sufficient
            console.log(
              '🔐 MFA DISABLED: OS biometric succeeded, granting immediate vault access'
            );

            try {
              // Initialize vault service first
              await vaultService.initialize();

              // Use the new OS biometric authentication method
              const osAuthSuccess =
                await vaultService.authenticateWithOSBiometric();

              if (osAuthSuccess) {
                console.log(
                  '✅ OS biometric authentication successful - immediate access granted!'
                );
                await resetFailedAttempts();
                navigation.replace('MainTabs');
                return;
              }

              // This shouldn't happen since OS biometric already succeeded
              console.error(
                '⚠️ OS biometric auth succeeded but vault service failed'
              );
              throw new Error(
                'Vault service OS biometric authentication failed'
              );
            } catch (directAccessError) {
              console.error(
                'Error with OS biometric vault access:',
                directAccessError
              );
              // This should not happen in normal circumstances
              throw directAccessError;
            }
          } catch (error) {
            console.error('Error during biometric vault access:', error);
            // Only fall back to password if absolutely necessary
            console.log(
              '🔐 Fallback: Requesting password due to error:',
              error.message
            );
            setMfaMode(false);
            setShowPasswordModal(true);
            showSnackbar(
              'Please enter your master password to access your vault.'
            );
          }
        }
      } else {
        if (result.error === 'user_cancel') {
          if (!isAutoTrigger) {
            showSnackbar('Biometric authentication cancelled');
          }
        } else {
          showSnackbar('Biometric authentication failed. Please try again.');
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
      setPasswordError('Account is locked. Please use recovery phrase.');
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

      try {
        // Clear session and authenticate with single bcrypt operation
        await vaultService.clearSession();
        const authSuccess = await vaultService.authenticate(masterPassword);

        if (authSuccess) {
          console.log(
            'Vault service authenticated successfully - navigating immediately'
          );

          // Reset failed attempts on successful login
          await resetFailedAttempts();

          // Only enable biometric storage for MFA scenarios where we need stored credentials
          // For non-MFA biometric login, we use OS-level authentication directly
          if (biometricSucceeded && mfaEnabled && biometricEnabled) {
            try {
              console.log(
                '🔐 MFA scenario: Enabling biometric storage for future MFA workflows'
              );
              await vaultService.enableBiometricAccess(masterPassword);
              showSnackbar('Biometric storage updated for MFA workflows.');
            } catch (error) {
              console.error('Error enabling biometric access:', error);
              // Don't block login if biometric setup fails
            }
          }

          // Update UI state and navigate immediately
          setShowPasswordModal(false);
          setMasterPassword('');
          setMfaMode(false);
          setBiometricSucceeded(false);

          // Navigate immediately for instant login
          navigation.replace('MainTabs');
        } else {
          // Handle failed authentication
          await incrementFailedAttempts();
          const newAttempts = failedAttempts + 1;
          const attemptsRemaining = MAX_FAILED_ATTEMPTS - newAttempts;

          if (mfaMode) {
            setPasswordError(
              'Invalid master password. MFA Step 2 failed - both biometric and password required.'
            );
          } else if (attemptsRemaining > 0) {
            const attemptText =
              attemptsRemaining === 1 ? 'attempt' : 'attempts';
            setPasswordError(
              `Invalid master password. ${attemptsRemaining} ${attemptText} remaining.`
            );
          } else {
            setPasswordError('Invalid master password.');
          }
          setMasterPassword('');
        }
      } catch (vaultError) {
        console.error('Error authenticating vault service:', vaultError);
        // Handle specific authentication errors
        if (vaultError.message?.includes('Invalid')) {
          // Handle failed authentication (same logic as the else block above)
          await incrementFailedAttempts();
          const newAttempts = failedAttempts + 1;
          const attemptsRemaining = MAX_FAILED_ATTEMPTS - newAttempts;

          if (mfaMode) {
            setPasswordError(
              'Invalid master password. MFA Step 2 failed - both biometric and password required.'
            );
          } else if (attemptsRemaining > 0) {
            const attemptText =
              attemptsRemaining === 1 ? 'attempt' : 'attempts';
            setPasswordError(
              `Invalid master password. ${attemptsRemaining} ${attemptText} remaining.`
            );
          } else {
            setPasswordError('Invalid master password.');
          }
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

  const handleUseRecoveryPhrase = () => {
    setShowLockoutModal(false);
    setShowPasswordModal(false);
    setMfaMode(false);
    setBiometricSucceeded(false);
    navigation.navigate('ForgotPassword');
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
              <Text style={styles.lockoutText}>Account Locked</Text>
              <Text style={styles.lockoutSubtext}>
                You have entered an incorrect master password 3 times. To unlock
                your account, please use your 12-word recovery phrase.
              </Text>
              <TouchableOpacity
                style={styles.recoveryButton}
                onPress={handleUseRecoveryPhrase}
              >
                <Text style={styles.recoveryButtonText}>
                  Use Recovery Phrase
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Login Buttons */}
          {!isLocked && (
            <View style={styles.buttonContainer}>
              {/* Biometric Login Button - Only show if biometric is enabled in settings */}
              {biometricEnabled && (
                <TouchableOpacity
                  style={styles.loginButton}
                  onPress={() => handleBiometricLogin(false)}
                  disabled={
                    isLoading || !biometricAvailable || isAutoAuthenticating
                  }
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={['#3366cc', '#3B82F6']}
                    style={[
                      styles.buttonGradient,
                      !biometricAvailable && styles.disabledGradient,
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
                disabled={isLoading}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#1E3A8A', '#3B82F6']}
                  style={styles.buttonGradient}
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
          )}

          {/* Failed Attempts Warning */}
          {failedAttempts > 0 && !isLocked && (
            <Text style={styles.warningText}>
              {failedAttempts} failed password attempt
              {failedAttempts > 1 ? 's' : ''}.{' '}
              {MAX_FAILED_ATTEMPTS - failedAttempts} remaining.
            </Text>
          )}
        </View>
      </LinearGradient>

      {/* Lockout Modal */}
      <Modal
        visible={showLockoutModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowLockoutModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.lockoutModalContainer,
              { backgroundColor: theme.colors.card },
            ]}
          >
            <View style={styles.lockoutModalHeader}>
              <Icon name="exclamation-triangle" size={40} color="#e74c3c" />
              <Text
                style={[styles.lockoutModalTitle, { color: theme.colors.text }]}
              >
                Account Locked
              </Text>
            </View>
            <Text
              style={[
                styles.lockoutModalMessage,
                { color: theme.colors.textSecondary },
              ]}
            >
              You have entered an incorrect master password 3 times. To unlock
              your account, please use your 12-word recovery phrase.
            </Text>
            <TouchableOpacity
              style={styles.recoveryModalButton}
              onPress={handleUseRecoveryPhrase}
            >
              <LinearGradient
                colors={['#8e44ad', '#9b59b6']}
                style={styles.recoveryModalButtonGradient}
              >
                <Text style={styles.recoveryModalButtonText}>
                  Use Recovery Phrase
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
                onPress={handleUseRecoveryPhrase}
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
    width: '90%',
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
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 20,
  },
  recoveryButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  recoveryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
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
  lockoutModalContainer: {
    borderRadius: 20,
    padding: 24,
    width: '90%',
    maxWidth: 400,
    alignItems: 'center',
  },
  lockoutModalHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  lockoutModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 12,
    textAlign: 'center',
  },
  lockoutModalMessage: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  recoveryModalButton: {
    width: '100%',
    borderRadius: 10,
    overflow: 'hidden',
  },
  recoveryModalButtonGradient: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  recoveryModalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
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
