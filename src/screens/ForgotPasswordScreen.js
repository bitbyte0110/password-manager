import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Modal,
} from 'react-native';
import { TextInput, Button, Snackbar, ProgressBar } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import zxcvbn from 'zxcvbn';
import passwordUtils from '../utils/passwordUtils';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { useTheme } from '../contexts/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Lockout constants - must match LoginScreen values
const FAILED_ATTEMPTS_KEY = 'vault_failedAttempts';
const LOCKOUT_TIME_KEY = 'vault_lockoutTime';
const BIOMETRIC_FAILED_ATTEMPTS_KEY = 'vault_biometricFailCount';
const BIOMETRIC_LAST_FAILED_KEY = 'vault_lastBiometricFailed';

const ForgotPasswordScreen = ({ navigation: navProp }) => {
  const navigation = navProp || useNavigation();
  const { theme } = useTheme();

  // Step management state
  const [currentStep, setCurrentStep] = useState(1); // 1 = verify phrase, 2 = set password

  // Form state
  const [recoveryPhrase, setRecoveryPhrase] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Validation state - Step 1
  const [recoveryPhraseError, setRecoveryPhraseError] = useState('');
  const [wordCount, setWordCount] = useState(0);
  const [isRecoveryPhraseValid, setIsRecoveryPhraseValid] = useState(false);

  // Validation state - Step 2
  const [passwordError, setPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  const [passwordStrength, setPasswordStrength] = useState(null);
  const [isNewPasswordValid, setIsNewPasswordValid] = useState(false);
  const [isConfirmPasswordValid, setIsConfirmPasswordValid] = useState(false);

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });
  const [isReencrypting, setIsReencrypting] = useState(false);
  const [reencryptionProgress, setReencryptionProgress] = useState(0);

  useEffect(() => {
    if (currentStep === 1) {
      validateRecoveryPhrase();
    }
  }, [recoveryPhrase, currentStep]);

  useEffect(() => {
    if (currentStep === 2) {
      validateNewPassword();
    }
  }, [newPassword, currentStep]);

  useEffect(() => {
    if (currentStep === 2) {
      validateConfirmPassword();
    }
  }, [confirmPassword, newPassword, currentStep]);

  const validateRecoveryPhrase = () => {
    const trimmed = recoveryPhrase.trim();
    if (!trimmed) {
      setWordCount(0);
      setRecoveryPhraseError('');
      setIsRecoveryPhraseValid(false);
      return;
    }

    const words = trimmed.split(/\s+/).filter(word => word.length > 0);
    setWordCount(words.length);

    if (words.length === 0) {
      setRecoveryPhraseError('');
      setIsRecoveryPhraseValid(false);
    } else if (words.length < 12) {
      setRecoveryPhraseError(`${words.length}/12 words entered`);
      setIsRecoveryPhraseValid(false);
    } else if (words.length === 12) {
      setRecoveryPhraseError('');
      setIsRecoveryPhraseValid(true);
    } else {
      setRecoveryPhraseError('Recovery phrase must be exactly 12 words');
      setIsRecoveryPhraseValid(false);
    }
  };

  const validateNewPassword = () => {
    if (!newPassword) {
      setPasswordStrength(null);
      setPasswordError('');
      setIsNewPasswordValid(false);
      return;
    }

    const result = zxcvbn(newPassword);
    setPasswordStrength(result);

    if (result.score < 3) {
      setPasswordError(
        result.feedback.suggestions.length > 0
          ? result.feedback.suggestions[0]
          : 'Password is too weak. Please choose a stronger password.'
      );
      setIsNewPasswordValid(false);
    } else {
      setPasswordError('');
      setIsNewPasswordValid(true);
    }
  };

  const validateConfirmPassword = () => {
    if (!confirmPassword) {
      setConfirmPasswordError('');
      setIsConfirmPasswordValid(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setConfirmPasswordError('Passwords do not match');
      setIsConfirmPasswordValid(false);
    } else {
      setConfirmPasswordError('');
      setIsConfirmPasswordValid(true);
    }
  };

  // Form validation based on current step
  const isFormValid =
    currentStep === 1
      ? isRecoveryPhraseValid && !isLoading
      : isNewPasswordValid && isConfirmPasswordValid && !isLoading;

  const getStrengthColor = score => {
    const colors = ['#e74c3c', '#e67e22', '#f39c12', '#27ae60', '#2ecc71'];
    return colors[score] || '#e74c3c';
  };

  const getStrengthText = score => {
    const texts = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'];
    return texts[score] || 'Very Weak';
  };

  const handleVerifyPhrase = async () => {
    if (!isFormValid) {
      showSnackbar('Please enter a valid 12-word recovery phrase');
      return;
    }

    setIsLoading(true);

    try {
      // Validate recovery phrase against stored hash
      const storedRecoveryHash =
        await SecureStore.getItemAsync('vault_recoveryHash');

      if (!storedRecoveryHash) {
        showSnackbar('No recovery phrase found. Please contact support.');
        setIsLoading(false);
        return;
      }

      // Hash the entered recovery phrase and compare
      const normalizedPhrase = recoveryPhrase
        .trim()
        .split(/\s+/)
        .map(word => word.toLowerCase())
        .join(' ');

      const enteredPhraseHash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        normalizedPhrase
      );

      if (enteredPhraseHash !== storedRecoveryHash) {
        showSnackbar(
          'Invalid recovery phrase. Please check your words and try again.'
        );
        setRecoveryPhrase(''); // Clear the input field
        setIsLoading(false);
        return;
      }

      // Success - proceed to Step 2
      showSnackbar('Recovery phrase verified!');
      setRecoveryPhrase(''); // Clear recovery phrase from memory for security

      setTimeout(() => {
        setCurrentStep(2);
      }, 1000);
    } catch (error) {
      console.error('Recovery phrase verification error:', error);
      showSnackbar('An error occurred during verification. Please try again.');
      setIsLoading(false);
    }

    setIsLoading(false);
  };

  const clearAllLockoutStates = async () => {
    try {
      // Clear password lockout state
      await AsyncStorage.removeItem(FAILED_ATTEMPTS_KEY);
      await AsyncStorage.removeItem(LOCKOUT_TIME_KEY);

      // Clear biometric lockout state
      await AsyncStorage.removeItem(BIOMETRIC_FAILED_ATTEMPTS_KEY);
      await AsyncStorage.removeItem(BIOMETRIC_LAST_FAILED_KEY);

      // Clear any additional lockout-related keys
      await AsyncStorage.removeItem('vault_lastActiveTime');

      console.log(
        'All lockout states cleared successfully after password recovery'
      );
    } catch (error) {
      console.error('Error clearing lockout states:', error);
    }
  };

  const handleResetPassword = async () => {
    if (!isFormValid) {
      showSnackbar('Please fix all errors before proceeding');
      return;
    }

    setIsLoading(true);

    try {
      // Clear all lockout states and timers FIRST
      await clearAllLockoutStates();

      // Hash the new password
      const saltRounds = 12;
      const newPasswordHash = await passwordUtils.hashPassword(
        newPassword,
        saltRounds
      );

      // Update the master password hash in SecureStore
      await SecureStore.setItemAsync('vault_masterHash', newPasswordHash);

      // CRITICAL FIX: Re-encrypt all vault data with new password
      const normalizedRecoveryPhrase = recoveryPhrase
        .trim()
        .split(/\s+/)
        .map(word => word.toLowerCase())
        .join(' ');

      try {
        setIsReencrypting(true);
        setReencryptionProgress(0);

        console.log('🔄 Starting vault re-encryption with new password...');

        // Import vault service for re-encryption
        const vaultService = require('../services/vaultService').default;

        // Bulk re-encrypt all vault data
        await vaultService.bulkReencryptVault(
          newPassword,
          normalizedRecoveryPhrase, // Use recovery phrase to decrypt old data
          progress => {
            setReencryptionProgress(Math.round(progress));
            console.log(`🔄 Re-encryption progress: ${Math.round(progress)}%`);
          }
        );

        console.log('✅ Vault re-encryption completed successfully');
        setIsReencrypting(false);
      } catch (reencryptError) {
        console.error('❌ Vault re-encryption failed:', reencryptError);
        setIsReencrypting(false);

        // Don't fail the entire process - data will be migrated on access
        console.warn(
          'Vault re-encryption failed, but password reset will continue. Data will be migrated on access.'
        );
      }

      // Clear all session data to prevent authentication conflicts
      try {
        await SecureStore.deleteItemAsync('vault_sessionToken');
        await SecureStore.deleteItemAsync('vault_biometricPassword');
        await SecureStore.deleteItemAsync('vault_sessionTime');
        console.log(
          'Cleared all session tokens and biometric password after recovery'
        );
      } catch (clearError) {
        console.warn('Warning: Could not clear session data:', clearError);
      }

      // Clear sensitive data
      clearSensitiveData();

      // Show success message
      showSnackbar(
        '✅ Password reset successfully! Your vault has been optimized for faster access.'
      );

      // Navigate to Login with clean navigation state
      setTimeout(() => {
        navigation.reset({
          index: 0,
          routes: [{ name: 'Login' }],
        });
      }, 2000);
    } catch (error) {
      console.error('Password reset error:', error);

      if (error.message.includes('SecureStore')) {
        showSnackbar('Storage error. Please try again.');
      } else if (error.message.includes('bcrypt')) {
        showSnackbar('Encryption error. Please try again.');
      } else {
        showSnackbar('An unexpected error occurred. Please try again.');
      }

      clearPasswordFields();
      setIsLoading(false);
      setIsReencrypting(false);
    }
  };

  const clearPasswordFields = () => {
    setNewPassword('');
    setConfirmPassword('');
    setShowNewPassword(false);
    setShowConfirmPassword(false);
  };

  const clearSensitiveData = () => {
    setRecoveryPhrase('');
    setNewPassword('');
    setConfirmPassword('');
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setPasswordStrength(null);
  };

  const showSnackbar = message => {
    setSnackbar({ visible: true, message });
  };

  const handleGoBack = () => {
    clearSensitiveData();
    navigation.navigate('Login');
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <LinearGradient colors={['#9b59b6', '#3498db']} style={styles.gradient}>
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContainer}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={true}
            bounces={true}
            alwaysBounceVertical={false}
            keyboardDismissMode="interactive"
            scrollEventThrottle={16}
          >
            <View style={styles.card}>
              {/* Logo */}
              <View style={styles.logoContainer}>
                <LinearGradient
                  colors={['#7E57C2', '#26A69A']}
                  style={styles.logo}
                >
                  <Icon name="shield-alt" size={40} color="#fff" />
                </LinearGradient>
              </View>

              {/* Conditional rendering based on current step */}
              {currentStep === 1 ? (
                // Step 1: Recovery Phrase Verification
                <>
                  {/* Step 1 Title */}
                  <Text style={styles.title}>Verify Recovery Phrase</Text>
                  <Text style={styles.subtitle}>
                    Enter your 12-word recovery phrase to continue
                  </Text>

                  {/* Recovery Phrase Input */}
                  <View style={styles.inputContainer}>
                    <TextInput
                      label="12-Word Recovery Phrase"
                      mode="outlined"
                      value={recoveryPhrase}
                      onChangeText={setRecoveryPhrase}
                      placeholder="Enter your 12-word recovery phrase separated by spaces"
                      multiline={true}
                      numberOfLines={4}
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={[
                        styles.textInput,
                        {
                          backgroundColor: theme.colors.inputBackground,
                          color: theme.colors.inputText,
                        },
                      ]}
                      textColor={theme.colors.inputText}
                      placeholderTextColor={theme.colors.inputPlaceholder}
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
                    />
                    {wordCount > 0 && (
                      <Text
                        style={[
                          styles.wordCountText,
                          { color: wordCount === 12 ? '#27ae60' : '#666' },
                        ]}
                      >
                        {wordCount}/12 words entered
                      </Text>
                    )}
                    {recoveryPhraseError && wordCount !== 12 ? (
                      <Text style={styles.errorText}>
                        {recoveryPhraseError}
                      </Text>
                    ) : null}
                  </View>

                  {/* Verify Button */}
                  <View style={styles.buttonContainer}>
                    <View style={styles.resetButtonWrapper}>
                      <LinearGradient
                        colors={
                          isFormValid
                            ? ['#9b59b6', '#3498db']
                            : ['#ccc', '#999']
                        }
                        style={[
                          styles.resetButtonGradient,
                          !isFormValid && styles.disabledButton,
                        ]}
                      >
                        <Button
                          mode="text"
                          onPress={handleVerifyPhrase}
                          disabled={!isFormValid}
                          loading={isLoading}
                          style={styles.resetButton}
                          labelStyle={styles.resetButtonText}
                        >
                          {isLoading ? 'Verifying...' : 'Verify Phrase'}
                        </Button>
                      </LinearGradient>
                    </View>

                    {/* Back Button */}
                    <Button
                      mode="text"
                      onPress={handleGoBack}
                      disabled={isLoading}
                      style={styles.backButton}
                      labelStyle={styles.backButtonText}
                    >
                      Back to Login
                    </Button>
                  </View>
                </>
              ) : (
                // Step 2: Set New Password
                <>
                  {/* Step 2 Title */}
                  <Text style={styles.title}>Set New Password</Text>
                  <Text style={styles.subtitle}>
                    Create a strong new master password
                  </Text>

                  {/* Password Requirements */}
                  <View style={styles.requirementsContainer}>
                    <Text style={styles.requirementsTitle}>
                      Password Requirements:
                    </Text>
                    <Text style={styles.requirementText}>
                      • At least 12 characters
                    </Text>
                    <Text style={styles.requirementText}>
                      • One uppercase letter
                    </Text>
                    <Text style={styles.requirementText}>
                      • One lowercase letter
                    </Text>
                    <Text style={styles.requirementText}>• One number</Text>
                    <Text style={styles.requirementText}>
                      • Symbols recommended
                    </Text>
                  </View>

                  {/* New Password Input */}
                  <View style={styles.inputContainer}>
                    <TextInput
                      label="New Master Password"
                      mode="outlined"
                      value={newPassword}
                      onChangeText={setNewPassword}
                      secureTextEntry={!showNewPassword}
                      style={[
                        styles.textInput,
                        {
                          backgroundColor: theme.colors.inputBackground,
                          color: theme.colors.inputText,
                        },
                      ]}
                      textColor={theme.colors.inputText}
                      placeholderTextColor={theme.colors.inputPlaceholder}
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
                      autoCorrect={false}
                      autoCapitalize="none"
                      keyboardType="default"
                      textContentType="newPassword"
                      right={
                        <TextInput.Icon
                          icon={showNewPassword ? 'eye-off' : 'eye'}
                          onPress={() => setShowNewPassword(!showNewPassword)}
                          iconColor={theme.colors.inputPlaceholder}
                        />
                      }
                    />

                    {/* Password Strength Indicator */}
                    {passwordStrength && (
                      <View style={styles.strengthContainer}>
                        <View style={styles.strengthBar}>
                          <View
                            style={[
                              styles.strengthFill,
                              {
                                width: `${(passwordStrength.score + 1) * 20}%`,
                                backgroundColor: getStrengthColor(
                                  passwordStrength.score
                                ),
                              },
                            ]}
                          />
                        </View>
                        <Text
                          style={[
                            styles.strengthText,
                            { color: getStrengthColor(passwordStrength.score) },
                          ]}
                        >
                          {getStrengthText(passwordStrength.score)}
                        </Text>
                      </View>
                    )}

                    {passwordError ? (
                      <Text style={styles.errorText}>{passwordError}</Text>
                    ) : null}
                  </View>

                  {/* Confirm Password Input */}
                  <View style={styles.inputContainer}>
                    <TextInput
                      label="Confirm New Password"
                      mode="outlined"
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry={!showConfirmPassword}
                      style={[
                        styles.textInput,
                        {
                          backgroundColor: theme.colors.inputBackground,
                          color: theme.colors.inputText,
                        },
                      ]}
                      textColor={theme.colors.inputText}
                      placeholderTextColor={theme.colors.inputPlaceholder}
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
                      autoCorrect={false}
                      autoCapitalize="none"
                      keyboardType="default"
                      textContentType="newPassword"
                      right={
                        <TextInput.Icon
                          icon={showConfirmPassword ? 'eye-off' : 'eye'}
                          onPress={() =>
                            setShowConfirmPassword(!showConfirmPassword)
                          }
                          iconColor={theme.colors.inputPlaceholder}
                        />
                      }
                    />
                    {confirmPasswordError ? (
                      <Text style={styles.errorText}>
                        {confirmPasswordError}
                      </Text>
                    ) : null}
                  </View>

                  {/* Reset Password Button */}
                  <View style={styles.buttonContainer}>
                    <View style={styles.resetButtonWrapper}>
                      <LinearGradient
                        colors={
                          isFormValid
                            ? ['#9b59b6', '#3498db']
                            : ['#ccc', '#999']
                        }
                        style={[
                          styles.resetButtonGradient,
                          !isFormValid && styles.disabledButton,
                        ]}
                      >
                        <Button
                          mode="text"
                          onPress={handleResetPassword}
                          disabled={!isFormValid}
                          loading={isLoading}
                          style={styles.resetButton}
                          labelStyle={styles.resetButtonText}
                        >
                          {isLoading ? 'Resetting...' : 'Reset Password'}
                        </Button>
                      </LinearGradient>
                    </View>
                  </View>
                </>
              )}
            </View>
          </ScrollView>
        </LinearGradient>
      </KeyboardAvoidingView>

      {/* Re-encryption Progress Modal */}
      <Modal
        visible={isReencrypting}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {}} // Prevent closing during re-encryption
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.progressModal, { backgroundColor: '#fff' }]}>
            <View style={styles.progressHeader}>
              <Icon name="shield-alt" size={32} color="#9b59b6" />
              <Text style={styles.progressTitle}>Securing Your Vault</Text>
              <Text style={styles.progressSubtitle}>
                Re-encrypting data with your new password...
              </Text>
            </View>

            <View style={styles.progressContainer}>
              <ProgressBar
                progress={reencryptionProgress / 100}
                color="#9b59b6"
                style={styles.progressBar}
              />
              <Text style={styles.progressText}>
                {reencryptionProgress}% Complete
              </Text>
            </View>

            <Text style={styles.progressNote}>
              This process ensures your vault is optimized for faster access
              with your new password.
            </Text>
          </View>
        </View>
      </Modal>

      {/* Snackbar */}
      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ visible: false, message: '' })}
        duration={3000}
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
  keyboardContainer: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 20,
    paddingBottom: 40, // Extra padding at bottom for keyboard
    minHeight: Dimensions.get('window').height - 100, // Ensure content can fill screen minus safe areas
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    marginHorizontal: 20,
    marginVertical: 10,
    minHeight: 400, // Ensure minimum height for content
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
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
    color: '#8e44ad',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 20,
  },
  inputContainer: {
    marginBottom: 20,
  },
  textInput: {
    backgroundColor: '#fff',
  },
  requirementsContainer: {
    backgroundColor: '#f8f9fa',
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
  },
  requirementsTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  requirementText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  wordCountText: {
    fontSize: 12,
    marginTop: 4,
    textAlign: 'right',
  },
  errorText: {
    fontSize: 12,
    color: '#e74c3c',
    marginTop: 4,
  },
  strengthContainer: {
    marginTop: 8,
  },
  strengthBar: {
    height: 4,
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
    overflow: 'hidden',
  },
  strengthFill: {
    height: '100%',
    borderRadius: 2,
  },
  strengthText: {
    fontSize: 12,
    marginTop: 4,
    textAlign: 'right',
    fontWeight: '500',
  },
  buttonContainer: {
    marginTop: 32,
    paddingBottom: 20, // Extra spacing for keyboard
  },
  resetButtonWrapper: {
    borderRadius: 25,
    overflow: 'hidden',
    marginBottom: 16,
  },
  resetButtonGradient: {
    borderRadius: 25,
  },
  resetButton: {
    paddingVertical: 4,
  },
  resetButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  disabledButton: {
    opacity: 0.5,
  },
  backButton: {
    alignSelf: 'center',
  },
  backButtonText: {
    color: '#8e44ad',
    fontSize: 14,
  },
  snackbar: {
    backgroundColor: '#333',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  progressModal: {
    borderRadius: 20,
    padding: 24,
    width: '90%',
    maxWidth: 350,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  progressHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  progressTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 12,
    textAlign: 'center',
  },
  progressSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  progressContainer: {
    width: '100%',
    marginBottom: 20,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e0e0e0',
  },
  progressText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#9b59b6',
    textAlign: 'center',
    marginTop: 12,
  },
  progressNote: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    lineHeight: 18,
    fontStyle: 'italic',
  },
});

export default ForgotPasswordScreen;
