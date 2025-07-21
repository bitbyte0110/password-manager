import React from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { useTheme } from '../contexts/ThemeContext';

const SecureTextInput = ({
  label,
  value,
  onChangeText,
  secureTextEntry = true,
  showPassword = false,
  onTogglePassword,
  placeholder,
  error = false,
  errorText = '',
  autoFocus = false,
  returnKeyType = 'done',
  onSubmitEditing,
  style,
  testID,
  ...otherProps
}) => {
  const { theme } = useTheme();

  const inputStyles = [
    styles.input,
    {
      backgroundColor: theme.colors.inputBackground,
      borderColor: error ? theme.colors.error : theme.colors.inputBorder,
      color: theme.colors.inputText,
    },
    style,
  ];

  const focusedInputStyles = [
    ...inputStyles,
    {
      borderColor: error ? theme.colors.error : theme.colors.inputBorderFocused,
      borderWidth: 2,
    },
  ];

  return (
    <View style={styles.container}>
      {label && (
        <Text style={[styles.label, { color: theme.colors.text }]}>
          {label}
        </Text>
      )}

      <View style={styles.inputContainer}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry && !showPassword}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.inputPlaceholder}
          style={inputStyles}
          autoFocus={autoFocus}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          autoCorrect={false}
          autoCapitalize="none"
          keyboardType="default"
          textContentType="password"
          testID={testID}
          {...otherProps}
        />

        {onTogglePassword && (
          <TouchableOpacity
            style={styles.eyeButton}
            onPress={onTogglePassword}
            accessibilityLabel={
              showPassword ? 'Hide password' : 'Show password'
            }
          >
            <Icon
              name={showPassword ? 'eye-slash' : 'eye'}
              size={18}
              color={theme.colors.textSecondary}
            />
          </TouchableOpacity>
        )}
      </View>

      {error && errorText && (
        <Text style={[styles.errorText, { color: theme.colors.error }]}>
          {errorText}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
  },
  inputContainer: {
    position: 'relative',
  },
  input: {
    height: 56,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingRight: 50, // Space for eye icon
    fontSize: 16,
    fontFamily: 'System', // Use system font for better security
  },
  eyeButton: {
    position: 'absolute',
    right: 16,
    top: '50%',
    marginTop: -12, // Half of icon height
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 12,
    marginTop: 4,
  },
});

export default SecureTextInput;
