import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Button } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { useNavigation } from '@react-navigation/native';
import vaultService from '../services/vaultService';
import { useTheme } from '../contexts/ThemeContext';
import SecureTextInput from '../components/SecureTextInput';

const ChangeMasterPasswordScreen = () => {
  const navigation = useNavigation();
  const { theme } = useTheme();
  const [formData, setFormData] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showPasswords, setShowPasswords] = useState({
    old: false,
    new: false,
    confirm: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState(null);
  const [errors, setErrors] = useState({});

  const validatePassword = password => {
    const strength = {
      score: 0,
      feedback: [],
    };

    if (password.length >= 8) strength.score += 1;
    else strength.feedback.push('At least 8 characters');

    if (/[A-Z]/.test(password)) strength.score += 1;
    else strength.feedback.push('One uppercase letter');

    if (/[a-z]/.test(password)) strength.score += 1;
    else strength.feedback.push('One lowercase letter');

    if (/\d/.test(password)) strength.score += 1;
    else strength.feedback.push('One number');

    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) strength.score += 1;
    else strength.feedback.push('One special character');

    return strength;
  };

  const handlePasswordChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));

    if (field === 'newPassword') {
      setPasswordStrength(validatePassword(value));
    }

    // Clear errors when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.oldPassword) {
      newErrors.oldPassword = 'Current password is required';
    }

    if (!formData.newPassword) {
      newErrors.newPassword = 'New password is required';
    } else {
      const strength = validatePassword(formData.newPassword);
      if (strength.score < 3) {
        newErrors.newPassword = 'Password is too weak';
      }
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your new password';
    } else if (formData.newPassword !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    if (formData.oldPassword === formData.newPassword) {
      newErrors.newPassword =
        'New password must be different from current password';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      await vaultService.changeMasterPassword(
        formData.oldPassword,
        formData.newPassword
      );
      Alert.alert('Success', 'Master password changed successfully', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to change password');
    } finally {
      setIsLoading(false);
    }
  };

  const getStrengthColor = () => {
    if (!passwordStrength) return theme.colors.textSecondary;
    if (passwordStrength.score < 2) return theme.colors.error;
    if (passwordStrength.score < 4) return theme.colors.warning;
    return theme.colors.success;
  };

  const getStrengthText = () => {
    if (!passwordStrength) return '';
    if (passwordStrength.score < 2) return 'Weak';
    if (passwordStrength.score < 4) return 'Medium';
    return 'Strong';
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Icon name="arrow-left" size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
          Change Master Password
        </Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          {/* Current Password */}
          <View style={styles.inputGroup}>
            <SecureTextInput
              label="Current Password"
              value={formData.oldPassword}
              onChangeText={value =>
                handlePasswordChange('oldPassword', value)
              }
              showPassword={showPasswords.old}
              onTogglePassword={() =>
                setShowPasswords(prev => ({ ...prev, old: !prev.old }))
              }
              placeholder="Enter current password"
              error={!!errors.oldPassword}
              errorText={errors.oldPassword}
              testID="current-password-input"
            />
          </View>

          {/* New Password */}
          <View style={styles.inputGroup}>
            <SecureTextInput
              label="New Password"
              value={formData.newPassword}
              onChangeText={value =>
                handlePasswordChange('newPassword', value)
              }
              showPassword={showPasswords.new}
              onTogglePassword={() =>
                setShowPasswords(prev => ({ ...prev, new: !prev.new }))
              }
              placeholder="Enter new password"
              error={!!errors.newPassword}
              errorText={errors.newPassword}
              testID="new-password-input"
            />

            {/* Password Strength Indicator */}
            {formData.newPassword && passwordStrength && (
              <View style={styles.strengthContainer}>
                <View style={styles.strengthBar}>
                  {[...Array(5)].map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.strengthSegment,
                        {
                          backgroundColor:
                            i < passwordStrength.score
                              ? getStrengthColor()
                              : theme.colors.border,
                        },
                      ]}
                    />
                  ))}
                </View>
                <Text
                  style={[styles.strengthText, { color: getStrengthColor() }]}
                >
                  {getStrengthText()}
                </Text>
              </View>
            )}

            {passwordStrength && passwordStrength.feedback.length > 0 && (
              <View style={styles.feedbackContainer}>
                <Text
                  style={[
                    styles.feedbackTitle,
                    { color: theme.colors.textSecondary },
                  ]}
                >
                  Password should include:
                </Text>
                {passwordStrength.feedback.map((item, index) => (
                  <Text
                    key={index}
                    style={[
                      styles.feedbackItem,
                      { color: theme.colors.textSecondary },
                    ]}
                  >
                    • {item}
                  </Text>
                ))}
              </View>
            )}
          </View>

          {/* Confirm Password */}
          <View style={styles.inputGroup}>
            <SecureTextInput
              label="Confirm New Password"
              value={formData.confirmPassword}
              onChangeText={value =>
                handlePasswordChange('confirmPassword', value)
              }
              showPassword={showPasswords.confirm}
              onTogglePassword={() =>
                setShowPasswords(prev => ({
                  ...prev,
                  confirm: !prev.confirm,
                }))
              }
              placeholder="Confirm new password"
              error={!!errors.confirmPassword}
              errorText={errors.confirmPassword}
              testID="confirm-password-input"
            />
          </View>
        </View>
      </ScrollView>

      {/* Action Buttons */}
      <View
        style={[
          styles.buttonContainer,
          { backgroundColor: theme.colors.background },
        ]}
      >
        <Button
          mode="contained"
          onPress={() => navigation.goBack()}
          style={[styles.button, { backgroundColor: '#3A3A3C' }]}
          textColor="#FFFFFF"
          disabled={isLoading}
        >
          Cancel
        </Button>
        <Button
          mode="contained"
          onPress={handleSave}
          style={[styles.button, { backgroundColor: theme.colors.primary }]}
          loading={isLoading}
          disabled={isLoading}
        >
          Save Changes
        </Button>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  headerRight: {
    width: 44,
  },
  scrollContainer: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  inputGroup: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
  },
  passwordInputContainer: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 56, // Increased padding to prevent text overlap with eye icon
  },
  eyeButton: {
    position: 'absolute',
    right: 12,
    top: '50%',
    marginTop: -20, // Half of height to center vertically
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  strengthContainer: {
    marginTop: 8,
  },
  strengthBar: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 4,
  },
  strengthSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  strengthText: {
    fontSize: 12,
    fontWeight: '500',
  },
  feedbackContainer: {
    marginTop: 8,
  },
  feedbackTitle: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
  },
  feedbackItem: {
    fontSize: 12,
    marginLeft: 8,
  },
  errorText: {
    fontSize: 12,
    marginTop: 4,
  },
  buttonContainer: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
  },
  button: {
    flex: 1,
  },
});

export default ChangeMasterPasswordScreen;
