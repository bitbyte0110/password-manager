import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  useColorScheme,
  Alert,
} from 'react-native';
import { TextInput, Button } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { useNavigation } from '@react-navigation/native';

const ResetVaultScreen = () => {
  const navigation = useNavigation();
  const [confirmationText, setConfirmationText] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === 'dark';

  const theme = {
    background: isDarkMode ? '#121212' : '#ffffff',
    card: isDarkMode ? '#2c2c2c' : '#ffffff',
    primary: '#8e44ad',
    text: isDarkMode ? '#ffffff' : '#333333',
    textSecondary: isDarkMode ? '#b0b0b0' : '#666666',
    border: isDarkMode ? '#333333' : '#e0e0e0',
    error: '#e74c3c',
    warning: '#f39c12',
  };

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
      // In a real app, this would:
      // 1. Delete all password entries from database
      // 2. Clear all encrypted data
      // 3. Reset all settings
      // 4. Clear secure storage
      // 5. Navigate back to setup/login

      // Simulate reset process
      await new Promise(resolve => setTimeout(resolve, 2000));

      Alert.alert(
        'Vault Reset Complete',
        'All data has been permanently deleted. You will now be returned to the setup screen.',
        [
          {
            text: 'OK',
            onPress: () => {
              // Navigate to setup or login screen
              navigation.reset({
                index: 0,
                routes: [{ name: 'SetMasterPassword' }],
              });
            },
          },
        ]
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to reset vault. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Icon name="arrow-left" size={20} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          Reset Vault
        </Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          {/* Danger Warning */}
          <View
            style={[styles.dangerCard, { backgroundColor: theme.error + '15' }]}
          >
            <Icon name="exclamation-triangle" size={32} color={theme.error} />
            <Text style={[styles.dangerTitle, { color: theme.error }]}>
              DANGER ZONE
            </Text>
            <Text style={[styles.dangerSubtitle, { color: theme.text }]}>
              This action cannot be undone
            </Text>
          </View>

          {/* Warning Message */}
          <View style={[styles.warningCard, { backgroundColor: theme.card }]}>
            <Text style={[styles.warningTitle, { color: theme.text }]}>
              What will be deleted:
            </Text>

            <View style={styles.deletionList}>
              <View style={styles.deletionItem}>
                <Icon name="times-circle" size={16} color={theme.error} />
                <Text
                  style={[styles.deletionText, { color: theme.textSecondary }]}
                >
                  All saved passwords and login credentials
                </Text>
              </View>
              <View style={styles.deletionItem}>
                <Icon name="times-circle" size={16} color={theme.error} />
                <Text
                  style={[styles.deletionText, { color: theme.textSecondary }]}
                >
                  All categories and organization
                </Text>
              </View>
              <View style={styles.deletionItem}>
                <Icon name="times-circle" size={16} color={theme.error} />
                <Text
                  style={[styles.deletionText, { color: theme.textSecondary }]}
                >
                  All encrypted data and security settings
                </Text>
              </View>
              <View style={styles.deletionItem}>
                <Icon name="times-circle" size={16} color={theme.error} />
                <Text
                  style={[styles.deletionText, { color: theme.textSecondary }]}
                >
                  Your master password and vault access
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.cautionBox,
                { backgroundColor: theme.warning + '15' },
              ]}
            >
              <Icon name="info-circle" size={18} color={theme.warning} />
              <Text style={[styles.cautionText, { color: theme.text }]}>
                <Text style={{ fontWeight: 'bold' }}>Before proceeding:</Text>
                {'\n'}
                Make sure you have exported or backed up any passwords you want
                to keep. This action will completely wipe your vault and require
                you to start over.
              </Text>
            </View>
          </View>

          {/* Confirmation Input */}
          <View
            style={[styles.confirmationCard, { backgroundColor: theme.card }]}
          >
            <Text style={[styles.confirmationTitle, { color: theme.text }]}>
              Type "RESET" to confirm
            </Text>
            <Text
              style={[
                styles.confirmationSubtitle,
                { color: theme.textSecondary },
              ]}
            >
              This extra step helps prevent accidental deletion.
            </Text>

            <TextInput
              style={[
                styles.confirmationInput,
                { backgroundColor: theme.background },
              ]}
              value={confirmationText}
              onChangeText={setConfirmationText}
              placeholder="Type RESET here"
              mode="outlined"
              error={
                confirmationText.length > 0 &&
                confirmationText.toUpperCase() !== 'RESET'
              }
              theme={{ colors: { primary: theme.error } }}
              autoCapitalize="characters"
            />
          </View>
        </View>
      </ScrollView>

      {/* Action Buttons */}
      <View
        style={[styles.buttonContainer, { backgroundColor: theme.background }]}
      >
        <Button
          mode="outlined"
          onPress={() => navigation.goBack()}
          style={[styles.button, { borderColor: theme.border }]}
          textColor={theme.textSecondary}
          disabled={isLoading}
        >
          Cancel
        </Button>
        <Button
          mode="contained"
          onPress={handleResetVault}
          style={[styles.button, { backgroundColor: theme.error }]}
          loading={isLoading}
          disabled={isLoading || confirmationText.toUpperCase() !== 'RESET'}
        >
          Reset Vault
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
