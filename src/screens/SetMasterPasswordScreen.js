import 'react-native-get-random-values';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
} from 'react-native';
import { Card, TextInput, Snackbar, ProgressBar } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import bcrypt from 'bcryptjs';
import zxcvbn from 'zxcvbn';
import FontAwesome5 from 'react-native-vector-icons/FontAwesome5';
import { generateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

const SetMasterPasswordScreen = ({ navigation }) => {
  const [masterPassword, setMasterPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState({
    score: 0,
    feedback: {},
  });
  const [isLoading, setIsLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });
  const [errors, setErrors] = useState({});
  const [isVaultInitialized, setIsVaultInitialized] = useState(false);

  // Check if vault is already initialized
  useEffect(() => {
    checkVaultStatus();
  }, []);

  // Update password strength in real-time
  useEffect(() => {
    if (masterPassword) {
      const result = zxcvbn(masterPassword);
      setPasswordStrength(result);
    } else {
      setPasswordStrength({ score: 0, feedback: {} });
    }
  }, [masterPassword]);

  const checkVaultStatus = async () => {
    try {
      const existingHash = await SecureStore.getItemAsync('vault_masterHash');
      if (existingHash) {
        setIsVaultInitialized(true);
        // If vault is already initialized, navigate to main app
        if (navigation) {
          navigation.replace('MainApp');
        }
      }
    } catch (error) {
      console.error('Error checking vault status:', error);
    }
  };

  // Custom password strength validation
  const isStrongPassword = password => {
    if (!password || typeof password !== 'string') return false;

    // Minimum 12 characters
    if (password.length < 12) return false;

    // At least one uppercase letter
    if (!/[A-Z]/.test(password)) return false;

    // At least one lowercase letter
    if (!/[a-z]/.test(password)) return false;

    // At least one number
    if (!/[0-9]/.test(password)) return false;

    return true;
  };

  const validateInputs = () => {
    const newErrors = {};

    if (!masterPassword || typeof masterPassword !== 'string') {
      newErrors.masterPassword = 'Master password is required';
    } else if (!isStrongPassword(masterPassword)) {
      newErrors.masterPassword =
        'Password must be at least 12 characters with uppercase, lowercase, and numbers';
    } else if (passwordStrength.score < 2) {
      newErrors.masterPassword =
        'Password is too weak. Please choose a stronger password.';
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (masterPassword !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateInputs()) return;

    // Ensure masterPassword is a valid string and not empty
    const passwordString = String(masterPassword || '').trim();
    if (!passwordString) {
      showSnackbar('Invalid password format');
      return;
    }

    setIsLoading(true);
    try {
      // Hash the master password with bcrypt (salt rounds = 10)
      // Ensure we're passing a proper string to bcrypt
      const hashedPassword = await bcrypt.hash(passwordString, 10);

      // Generate recovery phrase
      const recoveryPhrase = generateMnemonic(wordlist);

      // Hash the recovery phrase with SHA-256
      const recoveryHash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        recoveryPhrase
      );

      // Store the hashed password and recovery phrase hash
      await SecureStore.setItemAsync('vault_masterHash', hashedPassword);
      await SecureStore.setItemAsync('vault_recoveryHash', recoveryHash);

      showSnackbar('Master password set successfully!');

      // Navigate to ShowRecoveryPhraseScreen with the recovery phrase
      setTimeout(() => {
        if (navigation) {
          navigation.replace('ShowRecoveryPhraseScreen', {
            recoveryPhrase: recoveryPhrase,
          });
        }
      }, 1500);
    } catch (error) {
      console.error('Error setting master password:', error);
      if (error.message && error.message.includes('Invalid string')) {
        showSnackbar('Password format error. Please try again.');
      } else {
        showSnackbar('Error setting master password. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const showSnackbar = message => {
    setSnackbar({ visible: true, message });
  };

  const getPasswordStrengthColor = score => {
    const colors = ['#e74c3c', '#e67e22', '#f39c12', '#2ecc71', '#27ae60'];
    return colors[score];
  };

  const getPasswordStrengthText = score => {
    const labels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'];
    return labels[score];
  };

  // Don't render if vault is already initialized
  if (isVaultInitialized) {
    return null;
  }

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={['#9b59b6', '#3498db']} style={styles.gradient}>
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
        >
          <Card style={styles.card}>
            {/* Logo */}
            <View style={styles.logoContainer}>
              <LinearGradient
                colors={['#7E57C2', '#26A69A']}
                style={styles.logo}
              >
                <FontAwesome5 name="shield-alt" size={40} color="#fff" />
              </LinearGradient>
            </View>

            {/* Title */}
            <Text style={styles.title}>SecureVault</Text>
            <Text style={styles.subtitle}>Your Trusted Password Manager</Text>

            {/* Password Requirements */}
            <View style={styles.requirementsContainer}>
              <Text style={styles.requirementsTitle}>
                Password Requirements:
              </Text>
              <Text style={styles.requirementItem}>
                • At least 12 characters
              </Text>
              <Text style={styles.requirementItem}>• One uppercase letter</Text>
              <Text style={styles.requirementItem}>• One lowercase letter</Text>
              <Text style={styles.requirementItem}>• One number</Text>
              <Text style={styles.requirementItem}>• Symbols recommended</Text>
            </View>

            {/* Master Password Input */}
            <TextInput
              label="Master Password"
              mode="outlined"
              value={masterPassword}
              onChangeText={setMasterPassword}
              secureTextEntry={!showPassword}
              error={!!errors.masterPassword}
              style={styles.input}
              right={
                <TextInput.Icon
                  icon={showPassword ? 'eye-off' : 'eye'}
                  onPress={() => setShowPassword(!showPassword)}
                />
              }
            />
            {errors.masterPassword && (
              <Text style={styles.errorText}>{errors.masterPassword}</Text>
            )}

            {/* Password Strength Indicator */}
            {masterPassword && (
              <View style={styles.strengthContainer}>
                <View style={styles.strengthHeader}>
                  <Text style={styles.strengthLabel}>Password Strength:</Text>
                  <Text
                    style={[
                      styles.strengthValue,
                      {
                        color: getPasswordStrengthColor(passwordStrength.score),
                      },
                    ]}
                  >
                    {getPasswordStrengthText(passwordStrength.score)}
                  </Text>
                </View>
                <ProgressBar
                  progress={passwordStrength.score / 4}
                  color={getPasswordStrengthColor(passwordStrength.score)}
                  style={styles.progressBar}
                />
                {passwordStrength.feedback.suggestions && (
                  <Text style={styles.suggestionText}>
                    {passwordStrength.feedback.suggestions.join(' ')}
                  </Text>
                )}
              </View>
            )}

            {/* Confirm Password Input */}
            <TextInput
              label="Confirm Password"
              mode="outlined"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirmPassword}
              error={!!errors.confirmPassword}
              style={styles.input}
              right={
                <TextInput.Icon
                  icon={showConfirmPassword ? 'eye-off' : 'eye'}
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                />
              }
            />
            {errors.confirmPassword && (
              <Text style={styles.errorText}>{errors.confirmPassword}</Text>
            )}

            {/* Submit Button */}
            <TouchableOpacity
              style={styles.submitButton}
              onPress={handleSubmit}
              disabled={isLoading}
            >
              <LinearGradient
                colors={['#8e44ad', '#3498db']}
                style={styles.submitGradient}
              >
                <Text style={styles.submitButtonText}>
                  {isLoading ? 'Setting Password...' : 'Set Master Password'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </Card>
        </ScrollView>

        {/* Snackbar */}
        <Snackbar
          visible={snackbar.visible}
          onDismiss={() => setSnackbar({ visible: false, message: '' })}
          duration={3000}
        >
          {snackbar.message}
        </Snackbar>
      </LinearGradient>
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
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    borderRadius: 20,
    padding: 24,
    backgroundColor: '#fff',
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
    marginBottom: 20,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 10,
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
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  requirementsContainer: {
    backgroundColor: '#f8f9fa',
    padding: 16,
    borderRadius: 8,
    marginBottom: 24,
  },
  requirementsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 8,
  },
  requirementItem: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  input: {
    marginBottom: 16,
  },
  errorText: {
    color: '#e74c3c',
    fontSize: 12,
    marginBottom: 8,
    marginTop: -12,
  },
  strengthContainer: {
    marginBottom: 16,
  },
  strengthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  strengthLabel: {
    fontSize: 14,
    color: '#666',
  },
  strengthValue: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    marginBottom: 8,
  },
  suggestionText: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
  submitButton: {
    borderRadius: 8,
    overflow: 'hidden',
    marginTop: 20,
  },
  submitGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default SetMasterPasswordScreen;
