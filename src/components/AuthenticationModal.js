import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { TextInput, Button } from 'react-native-paper';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import bcrypt from 'bcryptjs';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { useTheme } from '../contexts/ThemeContext';

const AuthenticationModal = ({
  visible,
  onClose,
  onSuccess,
  title = 'Authentication Required',
  message = 'Please authenticate to continue',
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [authMethod, setAuthMethod] = useState('password'); // 'password', 'biometric', 'mfa'
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [mfaStep, setMfaStep] = useState(1); // 1 = biometric, 2 = password
  const [biometricSucceeded, setBiometricSucceeded] = useState(false);
  const { theme } = useTheme();

  useEffect(() => {
    if (visible) {
      initializeAuth();
    } else {
      // Reset state when modal closes
      setPassword('');
      setError('');
      setMfaStep(1);
      setBiometricSucceeded(false);
    }
  }, [visible]);

  const initializeAuth = async () => {
    try {
      // Load user preferences
      const biometricEnabled = await SecureStore.getItemAsync(
        'vault_biometricEnabled'
      );
      const mfaEnabled = await SecureStore.getItemAsync('vault_mfaEnabled');

      const isBiometricEnabled = biometricEnabled === 'true';
      const isMfaEnabled = mfaEnabled === 'true';

      // Check biometric availability
      let biometricSupported = false;
      if (isBiometricEnabled) {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        biometricSupported = hasHardware && isEnrolled;
      }

      setBiometricAvailable(biometricSupported);

      // Determine authentication method
      if (isMfaEnabled && biometricSupported) {
        setAuthMethod('mfa');
        setMfaStep(1);
        // Auto-trigger biometric for MFA
        handleBiometricAuth();
      } else if (isBiometricEnabled && biometricSupported) {
        setAuthMethod('biometric');
        // Auto-trigger biometric
        handleBiometricAuth();
      } else {
        setAuthMethod('password');
      }
    } catch (error) {
      console.error('Error initializing auth:', error);
      setAuthMethod('password');
    }
  };

  const handleBiometricAuth = async () => {
    try {
      setIsLoading(true);
      setError('');

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage:
          authMethod === 'mfa'
            ? 'Complete biometric authentication first'
            : message,
        cancelLabel: 'Cancel',
        fallbackLabel: 'Use Password',
      });

      if (result.success) {
        setBiometricSucceeded(true);
        if (authMethod === 'mfa') {
          // Move to password step for MFA
          setMfaStep(2);
        } else {
          // Biometric only - success
          onSuccess({ success: true, method: 'biometric' });
        }
      } else {
        if (result.error === 'user_cancel') {
          onClose();
        } else {
          // Fallback to password
          setAuthMethod('password');
          setError(
            'Biometric authentication failed. Please use your password.'
          );
        }
      }
    } catch (error) {
      console.error('Biometric auth error:', error);
      setAuthMethod('password');
      setError('Biometric authentication error. Please use your password.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordAuth = async () => {
    if (!password.trim()) {
      setError('Password is required');
      return;
    }

    try {
      setIsLoading(true);
      setError('');

      const storedHash = await SecureStore.getItemAsync('vault_masterHash');
      if (!storedHash) {
        setError('No master password found');
        return;
      }

      const isValid = await bcrypt.compare(password, storedHash);
      if (isValid) {
        const method = authMethod === 'mfa' ? 'mfa' : 'password';
        onSuccess({ success: true, method, password });
      } else {
        setError('Invalid password');
        setPassword('');
      }
    } catch (error) {
      console.error('Password auth error:', error);
      setError('Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  const getModalTitle = () => {
    if (authMethod === 'mfa') {
      return mfaStep === 1 ? 'Multi-Factor Authentication' : 'Enter Password';
    }
    return title;
  };

  const getModalMessage = () => {
    if (authMethod === 'mfa') {
      return mfaStep === 1
        ? 'Complete biometric authentication first'
        : biometricSucceeded
          ? 'Biometric authentication successful. Now enter your master password.'
          : 'Please enter your master password to continue.';
    }
    return message;
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.modalContainer,
            { backgroundColor: theme.colors.card },
          ]}
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.colors.text }]}>
              {getModalTitle()}
            </Text>
            <Text
              style={[styles.message, { color: theme.colors.textSecondary }]}
            >
              {getModalMessage()}
            </Text>
          </View>

          {/* Show biometric prompt for MFA step 1 */}
          {authMethod === 'mfa' && mfaStep === 1 && (
            <View style={styles.biometricSection}>
              <Icon name="fingerprint" size={48} color={theme.colors.primary} />
              <Text
                style={[
                  styles.biometricText,
                  { color: theme.colors.textSecondary },
                ]}
              >
                Touch the fingerprint sensor
              </Text>
              <TouchableOpacity
                style={[
                  styles.retryButton,
                  { borderColor: theme.colors.primary },
                ]}
                onPress={handleBiometricAuth}
                disabled={isLoading}
              >
                <Text
                  style={[
                    styles.retryButtonText,
                    { color: theme.colors.primary },
                  ]}
                >
                  Retry Biometric
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Show password input for password-only or MFA step 2 */}
          {(authMethod === 'password' ||
            (authMethod === 'mfa' && mfaStep === 2)) && (
            <View style={styles.passwordSection}>
              <TextInput
                label="Master Password"
                mode="outlined"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                style={[styles.passwordInput, { backgroundColor: theme.colors.inputBackground }]}
                theme={{
                  colors: {
                    primary: theme.colors.inputBorderFocused,
                    accent: theme.colors.inputBorderFocused,
                    text: theme.colors.inputText,
                    background: theme.colors.inputBackground,
                    outline: theme.colors.inputBorder,
                    placeholder: theme.colors.inputPlaceholder,
                    onSurfaceVariant: theme.colors.inputPlaceholder,
                  },
                }}
                textColor={theme.colors.inputText}
                placeholderTextColor={theme.colors.inputPlaceholder}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handlePasswordAuth}
                right={
                  <TextInput.Icon
                    icon={showPassword ? 'eye-off' : 'eye'}
                    onPress={() => setShowPassword(!showPassword)}
                  />
                }
              />

              {error && (
                <Text style={[styles.errorText, { color: theme.colors.error }]}>
                  {error}
                </Text>
              )}

              {authMethod === 'password' && biometricAvailable && (
                <TouchableOpacity
                  style={styles.biometricAlternative}
                  onPress={handleBiometricAuth}
                  disabled={isLoading}
                >
                  <Icon
                    name="fingerprint"
                    size={20}
                    color={theme.colors.primary}
                  />
                  <Text
                    style={[
                      styles.biometricAlternativeText,
                      { color: theme.colors.primary },
                    ]}
                  >
                    Use biometric instead
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <View style={styles.buttonContainer}>
            <Button
              mode="contained"
              onPress={onClose}
              style={[styles.button, { backgroundColor: '#3A3A3C' }]}
              textColor="#FFFFFF"
              disabled={isLoading}
            >
              Cancel
            </Button>

            {(authMethod === 'password' ||
              (authMethod === 'mfa' && mfaStep === 2)) && (
              <Button
                mode="contained"
                onPress={handlePasswordAuth}
                style={[
                  styles.button,
                  { backgroundColor: theme.colors.primary },
                ]}
                loading={isLoading}
                disabled={isLoading || !password.trim()}
              >
                Authenticate
              </Button>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  biometricSection: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  biometricText: {
    fontSize: 14,
    marginTop: 16,
    marginBottom: 24,
  },
  retryButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  passwordSection: {
    marginBottom: 24,
  },
  passwordInput: {
    marginBottom: 8,
  },
  errorText: {
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  biometricAlternative: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    padding: 8,
  },
  biometricAlternativeText: {
    fontSize: 14,
    marginLeft: 8,
    fontWeight: '500',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
  },
});

export default AuthenticationModal;
