import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TextInput, Button } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { useNavigation } from '@react-navigation/native';
import vaultService from '../services/vaultService';
import databaseService from '../services/databaseService';
import { usePasswords } from '../PasswordContext';
import { useTheme } from '../contexts/ThemeContext';

const ResetVaultScreen = () => {
  const navigation = useNavigation();
  const { theme } = useTheme();
  const { clearPasswords } = usePasswords();
  const [confirmationText, setConfirmationText] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleResetVault = () => {
    if (confirmationText.toUpperCase() !== 'RESET') {
      Alert.alert(
        'Confirmation Required',
        'Please type "RESET" to confirm this action.'
      );
      return;
    }

    Alert.alert(
      'Final Warning',
      'This action will permanently delete ALL your stored passwords and cannot be undone. Are you absolutely sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Delete Everything',
          style: 'destructive',
          onPress: performVaultReset,
        },
      ]
    );
  };

  const performVaultReset = async () => {
    setIsLoading(true);
    try {
      // First, authenticate the user
      const isAuthenticated = vaultService.isUserAuthenticated();
      if (!isAuthenticated) {
        Alert.alert(
          'Authentication Required',
          'Please authenticate to reset your vault.'
        );
        setIsLoading(false);
        return;
      }

      // Clear all vault data
      console.log('Starting vault reset...');

      // 1. Clear password context
      clearPasswords();

      // 2. Reset database (delete all tables and recreate)
      await databaseService.resetDatabase();

      // 3. Clear vault service session
      await vaultService.clearSession();

      // 4. Clear all secure storage
      await SecureStore.deleteItemAsync('vault_masterHash');
      await SecureStore.deleteItemAsync('vault_sessionToken');
      await SecureStore.deleteItemAsync('vault_recoveryPhrase');

      // 5. Clear AsyncStorage
      await AsyncStorage.clear();

      console.log('Vault reset completed successfully');

      // Navigate directly to SetMasterPasswordScreen without any loading screen
      navigation.reset({
        index: 0,
        routes: [{ name: 'SetMasterPassword' }],
      });
    } catch (error) {
      console.error('Error during vault reset:', error);
      Alert.alert('Error', 'Failed to reset vault. Please try again.');
    } finally {
      setIsLoading(false);
    }
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
          Reset Vault
        </Text>
        <View style={styles.headerRight} />
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
        >
          <View style={styles.content}>
            {/* Danger Warning */}
            <View
              style={[
                styles.dangerCard,
                { backgroundColor: theme.colors.error + '15' },
              ]}
            >
              <Icon
                name="exclamation-triangle"
                size={32}
                color={theme.colors.error}
              />
              <Text style={[styles.dangerTitle, { color: theme.colors.error }]}>
                DANGER ZONE
              </Text>
              <Text
                style={[styles.dangerSubtitle, { color: theme.colors.text }]}
              >
                This action cannot be undone
              </Text>
            </View>

            {/* Warning Message */}
            <View
              style={[
                styles.warningCard,
                { backgroundColor: theme.colors.card },
              ]}
            >
              <Text style={[styles.warningTitle, { color: theme.colors.text }]}>
                What will be deleted:
              </Text>

              <View style={styles.deletionList}>
                <View style={styles.deletionItem}>
                  <Icon
                    name="times-circle"
                    size={16}
                    color={theme.colors.error}
                  />
                  <Text
                    style={[
                      styles.deletionText,
                      { color: theme.colors.textSecondary },
                    ]}
                  >
                    All saved passwords and login credentials
                  </Text>
                </View>
                <View style={styles.deletionItem}>
                  <Icon
                    name="times-circle"
                    size={16}
                    color={theme.colors.error}
                  />
                  <Text
                    style={[
                      styles.deletionText,
                      { color: theme.colors.textSecondary },
                    ]}
                  >
                    All categories and organization
                  </Text>
                </View>
                <View style={styles.deletionItem}>
                  <Icon
                    name="times-circle"
                    size={16}
                    color={theme.colors.error}
                  />
                  <Text
                    style={[
                      styles.deletionText,
                      { color: theme.colors.textSecondary },
                    ]}
                  >
                    All encrypted data and security settings
                  </Text>
                </View>
                <View style={styles.deletionItem}>
                  <Icon
                    name="times-circle"
                    size={16}
                    color={theme.colors.error}
                  />
                  <Text
                    style={[
                      styles.deletionText,
                      { color: theme.colors.textSecondary },
                    ]}
                  >
                    Your master password and vault access
                  </Text>
                </View>
              </View>

              <View
                style={[
                  styles.cautionBox,
                  { backgroundColor: theme.colors.warning + '15' },
                ]}
              >
                <Icon
                  name="info-circle"
                  size={18}
                  color={theme.colors.warning}
                />
                <Text
                  style={[styles.cautionText, { color: theme.colors.text }]}
                >
                  <Text style={{ fontWeight: 'bold' }}>Before proceeding:</Text>
                  {'\n'}
                  Make sure you have exported or backed up any passwords you
                  want to keep. This action will completely wipe your vault and
                  require you to start over.
                </Text>
              </View>
            </View>

            {/* Confirmation Input */}
            <View
              style={[
                styles.confirmationCard,
                { backgroundColor: theme.colors.card },
              ]}
            >
              <Text
                style={[styles.confirmationTitle, { color: theme.colors.text }]}
              >
                Type "RESET" to confirm
              </Text>
              <Text
                style={[
                  styles.confirmationSubtitle,
                  { color: theme.colors.textSecondary },
                ]}
              >
                This extra step helps prevent accidental deletion.
              </Text>

              <TextInput
                style={[
                  styles.confirmationInput,
                  { backgroundColor: theme.colors.inputBackground },
                ]}
                value={confirmationText}
                onChangeText={setConfirmationText}
                placeholder="Type RESET here"
                mode="outlined"
                error={
                  confirmationText.length > 0 &&
                  confirmationText.toUpperCase() !== 'RESET'
                }
                theme={{
                  colors: {
                    primary: theme.colors.error,
                    accent: theme.colors.error,
                    text: theme.colors.inputText,
                    background: theme.colors.inputBackground,
                    outline: theme.colors.inputBorder,
                    placeholder: theme.colors.inputPlaceholder,
                    onSurfaceVariant: theme.colors.inputPlaceholder,
                  },
                }}
                textColor={theme.colors.inputText}
                placeholderTextColor={theme.colors.inputPlaceholder}
                autoCapitalize="characters"
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
            onPress={handleResetVault}
            style={[styles.button, { backgroundColor: theme.colors.error }]}
            loading={isLoading}
            disabled={isLoading || confirmationText.toUpperCase() !== 'RESET'}
          >
            Reset Vault
          </Button>
        </View>
      </KeyboardAvoidingView>
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
  keyboardAvoid: {
    flex: 1,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  content: {
    padding: 20,
  },
  dangerCard: {
    alignItems: 'center',
    padding: 24,
    borderRadius: 12,
    marginBottom: 20,
  },
  dangerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 8,
    marginBottom: 4,
  },
  dangerSubtitle: {
    fontSize: 14,
  },
  warningCard: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  warningTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  deletionList: {
    gap: 12,
    marginBottom: 20,
  },
  deletionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  deletionText: {
    fontSize: 14,
    flex: 1,
  },
  cautionBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 8,
    gap: 12,
  },
  cautionText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  confirmationCard: {
    borderRadius: 12,
    padding: 20,
  },
  confirmationTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  confirmationSubtitle: {
    fontSize: 14,
    marginBottom: 16,
  },
  confirmationInput: {
    marginBottom: 8,
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

export default ResetVaultScreen;
