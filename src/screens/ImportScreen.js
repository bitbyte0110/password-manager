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
  SafeAreaView,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { useTheme } from '../contexts/ThemeContext';
import VaultService from '../services/vaultService';
import ImportExportService from '../services/importExportService';

const ImportScreen = ({ navigation }) => {
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

      // Check authentication first
      if (!VaultService.isUserAuthenticated()) {
        Alert.alert(
          'Authentication Error',
          'Please log in to import passwords.'
        );
        return;
      }

      let importedCount = 0;

      if (importMode === 'replace') {
        // Clear existing passwords first
        console.log('Clearing all existing passwords...');
        const deletedCount = await VaultService.clearAllPasswords();
        console.log(`Cleared ${deletedCount} existing passwords`);
      }

      // Process each imported password
      console.log(
        `Processing ${importedData.length} password entries for import...`
      );

      for (const passwordEntry of importedData) {
        try {
          console.log('Processing password entry:', {
            website: passwordEntry.website || passwordEntry.title,
            username: passwordEntry.username,
            hasPassword: !!passwordEntry.password,
          });
          // Check if password already exists (for merge mode)
          if (importMode === 'merge') {
            const existing = await VaultService.findDuplicatePassword(
              passwordEntry.website || passwordEntry.title,
              passwordEntry.username
            );

            if (existing) {
              // Skip or update existing entry based on user preference
              continue;
            }
          }

          // Add the password entry
          await VaultService.addPassword({
            website: passwordEntry.website || passwordEntry.title,
            title: passwordEntry.website || passwordEntry.title,
            username: passwordEntry.username,
            password: passwordEntry.password,
            url: passwordEntry.url || '',
            category: passwordEntry.category || 'General',
            notes: passwordEntry.notes || '',
            favorite: passwordEntry.favorite || false,
          });

          importedCount++;
          console.log(`Successfully imported entry ${importedCount}`);
        } catch (entryError) {
          console.error('Failed to import entry:', passwordEntry, entryError);
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
            onPress: () => {
              // Navigate to MainTabs and then to MyVault
              navigation.reset({
                index: 0,
                routes: [
                  {
                    name: 'MainTabs',
                    state: { routes: [{ name: 'MyVault' }] },
                  },
                ],
              });
            },
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
      backgroundColor: `${colors.primary || '#8e44ad'}20`,
      borderColor: colors.primary || '#8e44ad',
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
      borderColor: colors.primary || '#8e44ad',
    },
    radioCircleUnselected: {
      borderColor: colors.border,
    },
    radioInner: {
      height: 8,
      width: 8,
      borderRadius: 4,
      backgroundColor: colors.primary || '#8e44ad',
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
          Import Vault
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
    </SafeAreaView>
  );
};

export default ImportScreen;
