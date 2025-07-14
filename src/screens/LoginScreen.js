import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Modal,
  Alert,
  Dimensions,
} from 'react-native';
import { Button, TextInput, Snackbar } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import bcrypt from 'bcryptjs';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { useNavigation } from '@react-navigation/native';

const { width: screenWidth } = Dimensions.get('window');

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

  // New state for enhanced features
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [biometricFailedAttempts, setBiometricFailedAttempts] = useState(0);
  const [biometricLocked, setBiometricLocked] = useState(false);
  const [biometricLockoutEnd, setBiometricLockoutEnd] = useState(null);
  const [isAutoAuthenticating, setIsAutoAuthenticating] = useState(false);
  const [mfaMode, setMfaMode] = useState(false); // When waiting for password after biometric success

  useEffect(() => {
    initializeScreen();
  }, []);

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

    // Auto-trigger biometric if enabled and available
    if (biometricHWAvailable && biometricEnabled && !biometricLocked) {
      setIsAutoAuthenticating(true);
      setTimeout(() => {
        handleBiometricLogin(true);
      }, 500); // Small delay for better UX
    }
  };

  const loadUserPreferences = async () => {
    try {
      const biometricEnabledValue = await SecureStore.getItemAsync(
        'vault_biometricEnabled'
      );
      const mfaEnabledValue =
        await SecureStore.getItemAsync('vault_mfaEnabled');

      setBiometricEnabled(biometricEnabledValue === 'true');
      setMfaEnabled(mfaEnabledValue === 'true');
    } catch (error) {
      console.error('Error loading user preferences:', error);
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
        await resetBiometricFailedAttempts();

        // Check if MFA is enabled
        if (mfaEnabled) {
          // MFA enabled: Show password modal for second factor
          setMfaMode(true);
          setShowPasswordModal(true);
          showSnackbar(
            'Biometric authentication successful. Please enter your master password.'
          );
        } else {
          // MFA disabled: Go directly to MainApp
          await resetFailedAttempts(); // Reset password attempts too
          navigation.replace('MainApp');
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
    if (!masterPassword.trim()) {
      showSnackbar('Please enter your master password');
      return;
    }

    if (isLocked) {
      showSnackbar('Account is locked due to too many failed attempts');
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

      const isValid = await bcrypt.compare(masterPassword, storedHash);

      if (isValid) {
        await resetFailedAttempts();
        await resetBiometricFailedAttempts(); // Reset biometric attempts on successful password
        setShowPasswordModal(false);
        setMasterPassword('');
        setMfaMode(false);
        navigation.replace('MainApp');
      } else {
        await incrementFailedAttempts();
        if (mfaMode) {
          showSnackbar(
            'Invalid master password. MFA requires both biometric and password.'
          );
        } else {
          showSnackbar(
            `Invalid password. ${MAX_FAILED_ATTEMPTS - (failedAttempts + 1)} attempts remaining.`
          );
        }
        setMasterPassword('');
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
    navigation.navigate('RecoveryScreen');
  };

  const handleResetVault = () => {
    setShowPasswordModal(false);
    setMfaMode(false);
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
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={['#9b59b6', '#3498db']} style={styles.gradient}>
        <View style={styles.content}>
          {/* Logo */}
          <View style={styles.logoContainer}>
            <LinearGradient colors={['#7E57C2', '#26A69A']} style={styles.logo}>
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
            {/* Biometric Login Button */}
            <TouchableOpacity
              style={[
                styles.loginButton,
                (isLocked || !biometricAvailable || biometricLocked) &&
                  styles.disabledButton,
              ]}
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
                colors={['#9b59b6', '#3498db']}
                style={[
                  styles.buttonGradient,
                  (isLocked || !biometricAvailable || biometricLocked) &&
                    styles.disabledButtonGradient,
                ]}
              >
                <Icon
                  name="fingerprint"
                  size={20}
                  color={
                    isLocked || !biometricAvailable || biometricLocked
                      ? '#888'
                      : '#FFFFFF'
                  }
                  style={styles.buttonIcon}
                />
                <Text
                  style={[
                    styles.buttonText,
                    (isLocked || !biometricAvailable || biometricLocked) &&
                      styles.disabledButtonText,
                  ]}
                >
                  {biometricAvailable
                    ? biometricLocked
                      ? 'Biometric Locked'
                      : 'Login with Biometric'
                    : 'Biometric Not Available'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* Password Login Button */}
            <TouchableOpacity
              style={[styles.loginButton, isLocked && styles.disabledButton]}
              onPress={() => setShowPasswordModal(true)}
              disabled={isLoading || isLocked}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#9b59b6', '#3498db']}
                style={[
                  styles.buttonGradient,
                  isLocked && styles.disabledButtonGradient,
                ]}
              >
                <Icon
                  name="lock"
                  size={20}
                  color={isLocked ? '#888' : '#FFFFFF'}
                  style={styles.buttonIcon}
                />
                <Text
                  style={[
                    styles.buttonText,
                    isLocked && styles.disabledButtonText,
                  ]}
                >
                  Login with Password
                </Text>
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
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {mfaMode
                ? 'Multi-Factor Authentication'
                : 'Enter Master Password'}
            </Text>

            {mfaMode && (
              <Text style={styles.modalSubtitle}>
                Biometric authentication successful. Please enter your master
                password to complete login.
              </Text>
            )}

            <TextInput
              label="Master Password"
              mode="outlined"
              value={masterPassword}
              onChangeText={setMasterPassword}
              secureTextEntry={!showPassword}
              style={styles.modalInput}
              theme={{
                colors: {
                  primary: '#9b59b6',
                  accent: '#9b59b6',
                },
              }}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handlePasswordLogin}
              right={
                <TextInput.Icon
                  icon={showPassword ? 'eye-off' : 'eye'}
                  onPress={() => setShowPassword(!showPassword)}
                />
              }
            />

            <View style={styles.modalButtons}>
              <Button
                mode="text"
                onPress={handleForgotPassword}
                style={styles.modalLinkButton}
                textColor="#9b59b6"
              >
                <Text>Forgot Password?</Text>
              </Button>

              <Button
                mode="text"
                onPress={handleResetVault}
                style={styles.modalLinkButton}
                textColor="#e74c3c"
              >
                <Text>Reset Vault</Text>
              </Button>
            </View>

            <View style={styles.modalActionButtons}>
              <TouchableOpacity
                style={styles.modalCancelButtonContainer}
                onPress={handleCancelPasswordModal}
                activeOpacity={0.8}
              >
                <View style={styles.modalCancelButtonContent}>
                  <Text style={styles.modalCancelButtonText}>Cancel</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalLoginButtonContainer}
                onPress={handlePasswordLogin}
                disabled={!masterPassword.trim() || isLoading}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#9b59b6', '#3498db']}
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
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
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
    width: '100%',
    alignItems: 'center',
  },
  loginButton: {
    borderRadius: 25,
    marginBottom: 16,
    width: screenWidth * 0.87,
    height: 56,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 5,
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 25,
    paddingVertical: 16,
    paddingHorizontal: 24,
    height: 56,
  },
  disabledButton: {
    shadowOpacity: 0,
    elevation: 0,
  },
  disabledButtonGradient: {
    opacity: 0.5,
  },
  buttonIcon: {
    marginRight: 14,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  disabledButtonText: {
    color: '#888',
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
    marginBottom: 20,
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
    backgroundColor: '#fff',
  },
  modalCancelButtonText: {
    color: '#666',
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
  disabledGradient: {
    opacity: 0.5,
  },
});

export default LoginScreen;
