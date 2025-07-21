/**
 * ImportScreen - Allows users to import vault data from an encrypted export file
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
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { useTheme } from '../contexts/ThemeContext';
import VaultService from '../services/vaultService';
import ImportExportService from '../services/importExportService';

const ImportScreen = ({ navigation }) => {
  const { theme, colors } = useTheme();
  const [importPassword, setImportPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importMode, setImportMode] = useState('merge'); // 'merge' or 'replace'

  const handleImport = async () => {
    try {
      if (!importPassword.trim()) {
        Alert.alert('Error', 'Please enter the import password');
        return;
      }

      setIsImporting(true);

      // Import and decrypt the file
      const result =
        await ImportExportService.importVaultFromFile(importPassword);

      if (!result.success) {
        Alert.alert('Import Failed', result.error);
        setIsImporting(false);
        return;
      }

      // Show confirmation dialog with import details
      Alert.alert(
        'Confirm Import',
        `Found ${result.data.length} passwords to import.\n\nImport mode: ${importMode === 'merge' ? 'Merge with existing passwords' : 'Replace all existing passwords'}\n\nThis action cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Import',
            style: 'destructive',
            onPress: () => processImport(result.data, result.metadata),
          },
        ]
      );
    } catch (error) {
      console.error('Import error:', error);
      Alert.alert(
        'Import Error',
        'An unexpected error occurred. Please try again.'
      );
    } finally {
      setIsImporting(false);
    }
  };

  const processImport = async (importedData, metadata) => {
    try {
      setIsImporting(true);

      let importedCount = 0;

      if (importMode === 'replace') {
        // Clear existing passwords first
        await VaultService.clearAllPasswords();
      }

      // Process each imported password
      for (const passwordEntry of importedData) {
        try {
          // Check if password already exists (for merge mode)
          if (importMode === 'merge') {
            const existing = await VaultService.findDuplicatePassword(
              passwordEntry.website,
              passwordEntry.username
            );

            if (existing) {
              // Skip or update existing entry based on user preference
              continue;
            }
          }

          // Add the password entry
          await VaultService.addPassword({
            website: passwordEntry.website,
            username: passwordEntry.username,
            password: passwordEntry.password,
            category: passwordEntry.category || 'General',
            notes: passwordEntry.notes || '',
            favorite: passwordEntry.favorite || false,
          });

          importedCount++;
        } catch (entryError) {
          console.warn('Failed to import entry:', passwordEntry, entryError);
          // Continue with other entries
        }
      }

      // Show success message
      Alert.alert(
        'Import Successful',
        `Successfully imported ${importedCount} passwords.\n\nExported: ${new Date(metadata.exportedAt).toLocaleDateString()}`,
        [
          {
            text: 'OK',
            onPress: () => navigation.navigate('MyVault'),
          },
        ]
      );
    } catch (error) {
      console.error('Process import error:', error);
      Alert.alert(
        'Import Error',
        'Some passwords could not be imported. Please check your vault and try again if needed.'
      );
    } finally {
      setIsImporting(false);
    }
  };

  const showImportModeHelp = () => {
    Alert.alert(
      'Import Modes',
      'Merge: Adds imported passwords to your existing vault. Duplicate entries are skipped.\n\nReplace: Removes all existing passwords and imports only the passwords from the file.',
      [{ text: 'Got it' }]
    );
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      flexGrow: 1,
      padding: 20,
    },
    header: {
      marginBottom: 30,
    },
    title: {
      fontSize: 24,
      fontWeight: 'bold',
      color: colors.text,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 16,
      color: colors.textSecondary,
      lineHeight: 22,
    },
    warningBox: {
      backgroundColor: colors.warning + '20',
      borderColor: colors.warning,
      borderWidth: 1,
      borderRadius: 8,
      padding: 16,
      marginBottom: 24,
    },
    warningText: {
      color: colors.warning,
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
    importModeContainer: {
      marginBottom: 24,
    },
    importModeHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    importModeLabel: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      flex: 1,
    },
    helpIcon: {
      padding: 4,
    },
    modeOption: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 8,
      borderWidth: 1,
      marginBottom: 8,
    },
    modeOptionSelected: {
      backgroundColor: colors.primary + '20',
      borderColor: colors.primary,
    },
    modeOptionUnselected: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
    },
    radioCircle: {
      height: 20,
      width: 20,
      borderRadius: 10,
      borderWidth: 2,
      marginRight: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioCircleSelected: {
      borderColor: colors.primary,
    },
    radioCircleUnselected: {
      borderColor: colors.border,
    },
    radioInner: {
      height: 8,
      width: 8,
      borderRadius: 4,
      backgroundColor: colors.primary,
    },
    modeOptionText: {
      flex: 1,
    },
    modeOptionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 2,
    },
    modeOptionDescription: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    importButton: {
      backgroundColor: colors.primary,
      borderRadius: 8,
      height: 48,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 20,
    },
    importButtonDisabled: {
      opacity: 0.5,
    },
    importButtonText: {
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
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Import Vault</Text>
          <Text style={styles.subtitle}>
            Select an encrypted vault export file and import your passwords.
          </Text>
        </View>

        <View style={styles.warningBox}>
          <Text style={styles.warningText}>
            🔒 Make sure you have the correct password for the export file. This
            is the password that was set when the file was exported.
          </Text>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Import Password</Text>
          <View style={styles.passwordInputContainer}>
            <TextInput
              style={styles.passwordInput}
              value={importPassword}
              onChangeText={setImportPassword}
              placeholder="Enter the password for the export file"
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

        <View style={styles.importModeContainer}>
          <View style={styles.importModeHeader}>
            <Text style={styles.importModeLabel}>Import Mode</Text>
            <TouchableOpacity
              style={styles.helpIcon}
              onPress={showImportModeHelp}
            >
              <Icon
                name="question-circle"
                size={20}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[
              styles.modeOption,
              importMode === 'merge'
                ? styles.modeOptionSelected
                : styles.modeOptionUnselected,
            ]}
            onPress={() => setImportMode('merge')}
          >
            <View
              style={[
                styles.radioCircle,
                importMode === 'merge'
                  ? styles.radioCircleSelected
                  : styles.radioCircleUnselected,
              ]}
            >
              {importMode === 'merge' && <View style={styles.radioInner} />}
            </View>
            <View style={styles.modeOptionText}>
              <Text style={styles.modeOptionTitle}>Merge</Text>
              <Text style={styles.modeOptionDescription}>
                Add imported passwords to existing vault (recommended)
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.modeOption,
              importMode === 'replace'
                ? styles.modeOptionSelected
                : styles.modeOptionUnselected,
            ]}
            onPress={() => setImportMode('replace')}
          >
            <View
              style={[
                styles.radioCircle,
                importMode === 'replace'
                  ? styles.radioCircleSelected
                  : styles.radioCircleUnselected,
              ]}
            >
              {importMode === 'replace' && <View style={styles.radioInner} />}
            </View>
            <View style={styles.modeOptionText}>
              <Text style={styles.modeOptionTitle}>Replace</Text>
              <Text style={styles.modeOptionDescription}>
                Replace all existing passwords with imported ones
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[
            styles.importButton,
            (isImporting || !importPassword) && styles.importButtonDisabled,
          ]}
          onPress={handleImport}
          disabled={isImporting || !importPassword}
        >
          {isImporting ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="white" />
              <Text style={styles.loadingText}>Importing...</Text>
            </View>
          ) : (
            <Text style={styles.importButtonText}>Select File & Import</Text>
          )}
        </TouchableOpacity>

        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>Import Requirements</Text>
          <Text style={styles.infoText}>
            • Files must be exported from this password manager app
          </Text>
          <Text style={styles.infoText}>
            • You need the exact password used when exporting the file
          </Text>
          <Text style={styles.infoText}>
            • Import process is secure and happens locally on your device
          </Text>
          <Text style={styles.infoText}>
            • Backup your current vault before replacing (if using Replace mode)
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

export default ImportScreen;
