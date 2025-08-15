/**
 * ExportScreen - Allows users to export their vault data securely
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../contexts/ThemeContext';
import VaultService from '../services/vaultService';
import ImportExportService from '../services/importExportService';

const ExportScreen = ({ navigation }) => {
  const { theme } = useTheme();
  const colors = {
    background: theme?.colors?.background || '#ffffff',
    surface: theme?.colors?.surface || '#f8f9fa',
    card: theme?.colors?.card || '#ffffff',
    primary: theme?.colors?.primary || '#8e44ad',
    text: theme?.colors?.text || '#333333',
    textSecondary: theme?.colors?.textSecondary || '#666666',
    border: theme?.colors?.border || '#e0e0e0',
    error: theme?.colors?.error || '#e74c3c',
    warning: theme?.colors?.warning || '#f39c12',
    ...theme?.colors,
  };
  const [exportPassword, setExportPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState([]);

  // Refresh session when screen gains focus to prevent timeout during export process
  useFocusEffect(
    React.useCallback(() => {
      const refreshSession = async () => {
        try {
          console.log('ExportScreen: Refreshing session on focus...');
          await VaultService.refreshSession();
        } catch (error) {
          console.warn('ExportScreen: Failed to refresh session:', error);
        }
      };
      refreshSession();

      // No cleanup needed with simplified approach
      return () => {
        // Session management now handled by timer-based system
      };
    }, [isExporting])
  );

  // Simple activity update to maintain session during export
  const updateExportActivity = async () => {
    try {
      const timestamp = Date.now().toString();
      await AsyncStorage.setItem('vault_lastActiveTime', timestamp);
      console.log('ExportScreen: Updated activity timestamp during export');
    } catch (error) {
      console.error('ExportScreen: Failed to update activity:', error);
    }
  };

  const validatePasswords = () => {
    const errors = [];

    if (!exportPassword) {
      errors.push('Export password is required');
      return errors;
    }

    if (exportPassword !== confirmPassword) {
      errors.push('Passwords do not match');
    }

    const validation =
      ImportExportService.validateExportPassword(exportPassword);
    if (!validation.isValid) {
      errors.push(...validation.errors);
    }

    return errors;
  };

  const handleExport = async () => {
    try {
      setIsExporting(true);
      setPasswordErrors([]);

      // Update activity to keep session alive during export
      await updateExportActivity();

      // Validate passwords
      const errors = validatePasswords();
      if (errors.length > 0) {
        setPasswordErrors(errors);
        setIsExporting(false);
        return;
      }

      // Get all vault data
      const vaultData = await VaultService.getAllPasswords();

      if (!vaultData || vaultData.length === 0) {
        Alert.alert(
          'Empty Vault',
          'Your vault is empty. There are no passwords to export.',
          [{ text: 'OK' }]
        );
        setIsExporting(false);
        return;
      }

      // Export with encryption
      const result = await ImportExportService.exportVaultToFile(
        vaultData,
        exportPassword
      );

      if (result.success) {
        Alert.alert(
          'Export Successful',
          `${result.message}\n\nFile: ${result.filename}\n\n⚠️ Keep your export password safe - you'll need it to import this data.`,
          [
            {
              text: 'OK',
              onPress: () => {
                navigation.goBack();
              },
            },
          ]
        );
      } else {
        Alert.alert('Export Failed', result.error, [{ text: 'OK' }]);
      }
    } catch (error) {
      console.error('Export error:', error);
      Alert.alert(
        'Export Error',
        'An unexpected error occurred during export. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handlePasswordChange = text => {
    setExportPassword(text);
    if (passwordErrors.length > 0) {
      setPasswordErrors([]);
    }
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
      paddingTop: 40,
      paddingBottom: 16,
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
    scrollContent: {
      flexGrow: 1,
      padding: 20,
    },
    pageHeader: {
      marginBottom: 30,
    },
    subtitle: {
      fontSize: 16,
      color: colors.textSecondary,
      lineHeight: 22,
    },
    warningBox: {
      backgroundColor: `${colors.warning || '#f39c12'}20`,
      borderColor: colors.warning || '#f39c12',
      borderWidth: 1,
      borderRadius: 8,
      padding: 16,
      marginBottom: 24,
    },
    warningText: {
      color: colors.warning || '#f39c12',
      fontSize: 14,
      lineHeight: 20,
    },
    inputContainer: {
      marginBottom: 20,
    },
    label: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 8,
    },
    passwordInputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
    },
    passwordInput: {
      flex: 1,
      height: 48,
      color: colors.text,
      fontSize: 16,
    },
    eyeIcon: {
      padding: 4,
    },
    errorContainer: {
      marginTop: 8,
    },
    errorText: {
      color: colors.error,
      fontSize: 14,
      marginBottom: 4,
    },
    exportButton: {
      backgroundColor: colors.primary,
      borderRadius: 8,
      height: 48,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 20,
    },
    exportButtonDisabled: {
      opacity: 0.5,
    },
    exportButtonText: {
      color: 'white',
      fontSize: 16,
      fontWeight: '600',
    },
    loadingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadingText: {
      color: 'white',
      fontSize: 16,
      fontWeight: '600',
      marginLeft: 8,
    },
    infoSection: {
      marginTop: 32,
      padding: 16,
      backgroundColor: colors.surface,
      borderRadius: 8,
    },
    infoTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 8,
    },
    infoText: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 20,
      marginBottom: 8,
    },
  });

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Go back"
        >
          <Icon name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Export Vault
        </Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.pageHeader}>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Export all your passwords to an encrypted file that you can import
            on another device.
          </Text>
        </View>

        <View style={styles.warningBox}>
          <Text style={styles.warningText}>
            🔒 Your exported file will be encrypted with the password you set
            below. Make sure to remember this password - you'll need it to
            import your data later.
          </Text>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Export Password</Text>
          <View style={styles.passwordInputContainer}>
            <TextInput
              style={styles.passwordInput}
              value={exportPassword}
              onChangeText={handlePasswordChange}
              placeholder="Enter a strong password"
              placeholderTextColor={colors.textSecondary}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={styles.eyeIcon}
              onPress={() => setShowPassword(!showPassword)}
            >
              <Icon
                name={showPassword ? 'eye-slash' : 'eye'}
                size={20}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Confirm Password</Text>
          <View style={styles.passwordInputContainer}>
            <TextInput
              style={styles.passwordInput}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm your export password"
              placeholderTextColor={colors.textSecondary}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>

        {passwordErrors.length > 0 && (
          <View style={styles.errorContainer}>
            {passwordErrors.map((error, index) => (
              <Text key={index} style={styles.errorText}>
                • {error}
              </Text>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.exportButton,
            (isExporting || !exportPassword || !confirmPassword) &&
              styles.exportButtonDisabled,
          ]}
          onPress={handleExport}
          disabled={isExporting || !exportPassword || !confirmPassword}
        >
          {isExporting ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="white" />
              <Text style={styles.loadingText}>Exporting...</Text>
            </View>
          ) : (
            <Text style={styles.exportButtonText}>Export Vault</Text>
          )}
        </TouchableOpacity>

        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>About Export</Text>
          <Text style={styles.infoText}>
            • Your vault data is encrypted using AES-256 encryption before
            export
          </Text>
          <Text style={styles.infoText}>
            • The export password is separate from your master password
          </Text>
          <Text style={styles.infoText}>
            • Export files can be safely shared or stored in cloud storage
          </Text>
          <Text style={styles.infoText}>
            • You can import this file on any device with this app
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default ExportScreen;
