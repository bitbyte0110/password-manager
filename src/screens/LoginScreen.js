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

const FAILED_ATTEMPTS_KEY = 'vault_failedAttempts';
const LOCKOUT_TIME_KEY = 'vault_lockoutTime';
const MAX_FAILED_ATTEMPTS = 3;
const LOCKOUT_DURATION = 30 * 60 * 1000; // 30 minutes

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

  useEffect(() => {
    checkMasterPasswordExists();
    checkFailedAttempts();
    checkBiometricAvailability();
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

  const checkBiometricAvailability = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      setBiometricAvailable(hasHardware && isEnrolled);
    } catch (error) {
      console.error('Error checking biometric availability:', error);
      setBiometricAvailable(false);
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

  const resetFailedAttempts = async () => {
    try {
      setFailedAttempts(0);
      await AsyncStorage.removeItem(FAILED_ATTEMPTS_KEY);
      await AsyncStorage.removeItem(LOCKOUT_TIME_KEY);
    } catch (error) {
      console.error('Error resetting failed attempts:', error);
    }
  };

  const handleBiometricLogin = async () => {
    if (!biometricAvailable) {
      showSnackbar(
        'Biometric authentication not available. Please use password login.'
      );
      return;
    }

    if (isLocked) {
      showSnackbar('Account is locked due to too many failed attempts');
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
        await resetFailedAttempts();
        navigation.replace('MainApp');
      } else {
        if (result.error === 'user_cancel') {
          showSnackbar('Biometric authentication cancelled');
        } else {
          showSnackbar('Biometric authentication failed. Please try again.');
        }
      }
    } catch (error) {
      console.error('Biometric authentication error:', error);
      showSnackbar(
        'Biometric authentication error. Please use password login.'
      );
    } finally {
      setIsLoading(false);
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
        setShowPasswordModal(false);
        setMasterPassword('');
        navigation.replace('MainApp');
      } else {
        await incrementFailedAttempts();
        showSnackbar(
          `Invalid password. ${MAX_FAILED_ATTEMPTS - (failedAttempts + 1)} attempts remaining.`
        );
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
    navigation.navigate('RecoveryScreen');
  };

  const handleResetVault = () => {
    setShowPasswordModal(false);
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

          {/* Login Buttons */}
          <View style={styles.buttonContainer}>
            {/* Biometric Login Button */}
            <TouchableOpacity
              style={[
                styles.loginButton,
                (isLocked || !biometricAvailable) && styles.disabledButton,
              ]}
              onPress={handleBiometricLogin}
              disabled={isLoading || isLocked || !biometricAvailable}
              activeOpacity={0.8}
            >
              <Icon
                name="fingerprint"
                size={20}
                color={isLocked || !biometricAvailable ? '#888' : '#FFFFFF'}
                style={styles.buttonIcon}
              />
              <Text
                style={[
                  styles.buttonText,
                  (isLocked || !biometricAvailable) &&
                    styles.disabledButtonText,
                ]}
              >
                {biometricAvailable
                  ? 'Login with Biometric'
                  : 'Biometric Not Available'}
              </Text>
            </TouchableOpacity>

            {/* Password Login Button */}
            <TouchableOpacity
              style={[styles.loginButton, isLocked && styles.disabledButton]}
              onPress={() => setShowPasswordModal(true)}
              disabled={isLoading || isLocked}
              activeOpacity={0.8}
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
            </TouchableOpacity>
          </View>

          {/* Failed Attempts Warning */}
          {failedAttempts > 0 && !isLocked && (
            <Text style={styles.warningText}>
              {failedAttempts} failed attempt{failedAttempts > 1 ? 's' : ''}.
              {MAX_FAILED_ATTEMPTS - failedAttempts} remaining.
            </Text>
          )}
        </View>
      </LinearGradient>

      {/* Password Modal */}
      <Modal
        visible={showPasswordModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowPasswordModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Enter Master Password</Text>

            <TextInput
              label="Master Password"
              mode="outlined"
              value={masterPassword}
              onChangeText={setMasterPassword}
              secureTextEntry={!showPassword}
              style={styles.modalInput}
              autoFocus
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
              <Button
                mode="outlined"
                onPress={() => {
                  setShowPasswordModal(false);
                  setMasterPassword('');
                  setShowPassword(false);
                }}
                style={styles.modalCancelButton}
              >
                <Text>Cancel</Text>
              </Button>

              <Button
                mode="contained"
                onPress={handlePasswordLogin}
                loading={isLoading}
                disabled={!masterPassword.trim() || isLoading}
                style={styles.modalLoginButton}
              >
                <Text>Login</Text>
              </Button>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2C3E50',
    borderRadius: 25,
    paddingVertical: 16,
    paddingHorizontal: 24,
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
  buttonIcon: {
    marginRight: 14,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  disabledButton: {
    backgroundColor: '#ccc',
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
    borderRadius: 15,
    padding: 24,
    width: '100%',
    maxWidth: 400,
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
  modalCancelButton: {
    flex: 1,
  },
  modalLoginButton: {
    flex: 1,
    backgroundColor: '#8e44ad',
  },
});

export default LoginScreen;
