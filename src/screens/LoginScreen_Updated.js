/**
 * LoginScreen - Updated version with persistent session support
 */

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
import Icon from 'react-native-vector-icons/FontAwesome5';
import { useNavigation } from '@react-navigation/native';
import vaultService from '../services/vaultService';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../../App_Updated'; // Import useAuth hook
import SecureTextInput from '../components/SecureTextInput';
import { getMFAEnabled, getBiometricEnabled } from '../utils/authUtils';

const LoginScreen = ({ navigation: navProp }) => {
  const navigation = navProp || useNavigation();
  const { theme } = useTheme();
  const { login, getAutoLockSettings } = useAuth();

  // State management
  const [masterPassword, setMasterPassword] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [showAutoLockInfo, setShowAutoLockInfo] = useState(false);
  const [autoLockSetting, setAutoLockSetting] = useState(null);

  const colors = {
    background: theme?.colors?.background || '#8e44ad',
    surface: theme?.colors?.surface || '#ffffff',
    card: theme?.colors?.card || '#ffffff',
    primary: theme?.colors?.primary || '#8e44ad',
    text: theme?.colors?.text || '#333333',
    textSecondary: theme?.colors?.textSecondary || '#666666',
    border: theme?.colors?.border || '#e0e0e0',
    error: theme?.colors?.error || '#e74c3c',
    success: theme?.colors?.success || '#27ae60',
    warning: theme?.colors?.warning || '#f39c12',
    ...theme?.colors,
  };

  useEffect(() => {
    initializeScreen();
  }, []);

  const initializeScreen = async () => {
    try {
      await checkBiometricAvailability();
      await loadAutoLockSettings();
    } catch (error) {
      console.error('Error initializing login screen:', error);
    }
  };

  const loadAutoLockSettings = async () => {
    try {
      const settings = await getAutoLockSettings();
      setAutoLockSetting(settings);

      // Show info about "Never" setting if it's enabled
      if (settings.timeout === 0) {
        setShowAutoLockInfo(true);
      }
    } catch (error) {
      console.error('Error loading auto-lock settings:', error);
    }
  };

  const checkBiometricAvailability = async () => {
    try {
      const biometricEnabled = await getBiometricEnabled();
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      setBiometricAvailable(biometricEnabled && hasHardware && isEnrolled);
    } catch (error) {
      console.error('Error checking biometric availability:', error);
      setBiometricAvailable(false);
    }
  };

  const handlePasswordLogin = async () => {
    if (!masterPassword.trim()) {
      setPasswordError('Please enter your master password');
      return;
    }

    setIsLoading(true);
    setPasswordError('');

    try {
      // Validate master password
      const masterHash = await SecureStore.getItemAsync('vault_masterHash');
      if (!masterHash) {
        throw new Error('No master password found. Please set up your vault.');
      }

      const isValidPassword = await bcrypt.compare(masterPassword, masterHash);

      if (!isValidPassword) {
        setPasswordError('Invalid master password');
        setMasterPassword('');
        return;
      }

      // Initialize vault service with master password
      await vaultService.unlockVault(masterPassword);

      // Login with authentication context
      await login(masterPassword);

      // Clear password from memory
      setMasterPassword('');

      showSnackbar('Login successful!');

      // Navigate to main app (handled by AuthenticationManager)
    } catch (error) {
      console.error('Login error:', error);
      setPasswordError('Login failed. Please try again.');
      showSnackbar('Login failed. Please check your password and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBiometricLogin = async () => {
    try {
      setIsLoading(true);

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock your vault with biometrics',
        cancelLabel: 'Use Password',
        fallbackLabel: 'Use Master Password',
        disableDeviceFallback: false,
      });

      if (result.success) {
        // Get stored master password hash for validation
        const masterHash = await SecureStore.getItemAsync('vault_masterHash');
        if (!masterHash) {
          throw new Error('No master password found.');
        }

        // For biometric login, we need to retrieve the master password
        // This is a simplified approach - in production, you might want to use a different method
        const storedMasterPassword =
          await SecureStore.getItemAsync('vault_biometricKey');
        if (!storedMasterPassword) {
          showSnackbar(
            'Biometric login not properly set up. Please use master password.'
          );
          return;
        }

        // Initialize vault service
        await vaultService.unlockVault(storedMasterPassword);

        // Login with authentication context
        await login(storedMasterPassword);

        showSnackbar('Biometric login successful!');
      } else {
        showSnackbar(
          'Biometric authentication failed. Please try again or use your master password.'
        );
      }
    } catch (error) {
      console.error('Biometric login error:', error);
      showSnackbar(
        'Biometric authentication error. Please use your master password.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const showSnackbar = message => {
    setSnackbar({ visible: true, message });
  };

  const getAutoLockInfoMessage = () => {
    if (autoLockSetting?.timeout === 0) {
      return "Auto-lock is set to 'Never'. Your session will persist across app restarts.";
    }
    return '';
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#8e44ad', '#9b59b6', '#a569bd']}
        style={styles.gradient}
      >
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Icon name="shield-alt" size={60} color="white" />
            <Text style={styles.title}>SecureVault</Text>
            <Text style={styles.subtitle}>Vault Access Required</Text>
          </View>

          {/* Auto-lock info banner */}
          {showAutoLockInfo && autoLockSetting?.timeout === 0 && (
            <View
              style={[
                styles.infoBanner,
                { backgroundColor: 'rgba(255,255,255,0.1)' },
              ]}
            >
              <Icon name="info-circle" size={16} color="white" />
              <Text style={styles.infoBannerText}>
                {getAutoLockInfoMessage()}
              </Text>
              <TouchableOpacity
                onPress={() => setShowAutoLockInfo(false)}
                style={styles.infoBannerClose}
              >
                <Icon name="times" size={14} color="white" />
              </TouchableOpacity>
            </View>
          )}

          {/* Login Form */}
          <View style={styles.loginForm}>
            {/* Biometric Button */}
            {biometricAvailable && (
              <TouchableOpacity
                style={styles.biometricButton}
                onPress={handleBiometricLogin}
                disabled={isLoading}
              >
                <Icon name="fingerprint" size={40} color="white" />
                <Text style={styles.biometricText}>Use Biometric</Text>
              </TouchableOpacity>
            )}

            {/* OR Divider */}
            {biometricAvailable && (
              <View style={styles.dividerContainer}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR</Text>
                <View style={styles.dividerLine} />
              </View>
            )}

            {/* Password Input Button */}
            <TouchableOpacity
              style={styles.passwordButton}
              onPress={() => setShowPasswordModal(true)}
              disabled={isLoading}
            >
              <Icon name="key" size={20} color="white" />
              <Text style={styles.passwordButtonText}>
                Enter Master Password
              </Text>
            </TouchableOpacity>

            {/* Forgot Password */}
            <TouchableOpacity
              style={styles.forgotPasswordButton}
              onPress={() => navigation.navigate('ForgotPassword')}
            >
              <Text style={styles.forgotPasswordText}>
                Forgot your master password?
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>

      {/* Password Modal */}
      <Modal
        visible={showPasswordModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowPasswordModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[styles.modalContainer, { backgroundColor: colors.surface }]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Enter Master Password
              </Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setShowPasswordModal(false)}
              >
                <Icon name="times" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalContent}>
              <SecureTextInput
                value={masterPassword}
                onChangeText={setMasterPassword}
                placeholder="Master Password"
                secureTextEntry={!showPassword}
                error={passwordError}
                onSubmitEditing={handlePasswordLogin}
                style={{ marginBottom: 20 }}
              />

              <TouchableOpacity
                style={styles.togglePasswordButton}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Icon
                  name={showPassword ? 'eye-slash' : 'eye'}
                  size={16}
                  color={colors.primary}
                />
                <Text
                  style={[styles.togglePasswordText, { color: colors.primary }]}
                >
                  {showPassword ? 'Hide' : 'Show'} Password
                </Text>
              </TouchableOpacity>

              <Button
                mode="contained"
                onPress={handlePasswordLogin}
                loading={isLoading}
                disabled={isLoading || !masterPassword.trim()}
                style={[
                  styles.loginButton,
                  { backgroundColor: colors.primary },
                ]}
                contentStyle={styles.loginButtonContent}
              >
                {isLoading ? 'Unlocking...' : 'Unlock Vault'}
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      {/* Snackbar */}
      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ visible: false, message: '' })}
        duration={4000}
        style={styles.snackbar}
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
    paddingHorizontal: 30,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 50,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
    marginTop: 20,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  infoBannerText: {
    flex: 1,
    color: 'white',
    fontSize: 14,
    marginLeft: 8,
  },
  infoBannerClose: {
    padding: 4,
  },
  loginForm: {
    alignItems: 'center',
  },
  biometricButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 20,
    padding: 30,
    marginBottom: 30,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  biometricText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 10,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 30,
    width: '100%',
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  dividerText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 20,
  },
  passwordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 15,
    padding: 18,
    marginBottom: 20,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  passwordButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 10,
  },
  forgotPasswordButton: {
    marginTop: 20,
  },
  forgotPasswordText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 16,
    textDecorationLine: 'underline',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  modalContainer: {
    borderRadius: 15,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  modalCloseButton: {
    padding: 5,
  },
  modalContent: {
    padding: 20,
  },
  togglePasswordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginBottom: 20,
  },
  togglePasswordText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '500',
  },
  loginButton: {
    borderRadius: 10,
  },
  loginButtonContent: {
    paddingVertical: 8,
  },
  snackbar: {
    backgroundColor: '#2c3e50',
  },
});

export default LoginScreen;
