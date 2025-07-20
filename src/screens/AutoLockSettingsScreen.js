import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Button, RadioButton } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../contexts/ThemeContext';

const AutoLockSettingsScreen = () => {
  const navigation = useNavigation();
  const { theme } = useTheme();
  const [selectedTimeout, setSelectedTimeout] = useState('120'); // Default 2 minutes
  const [isLoading, setIsLoading] = useState(false);

  const timeoutOptions = [
    { value: '0', label: 'Never', description: 'Disables auto-lock' },
    {
      value: '30',
      label: '30 seconds',
      description: 'Lock after 30 seconds of inactivity',
    },
    {
      value: '60',
      label: '1 minute',
      description: 'Lock after 1 minute of inactivity',
    },
    {
      value: '120',
      label: '2 minutes',
      description: 'Lock after 2 minutes of inactivity (recommended)',
    },
    {
      value: '300',
      label: '5 minutes',
      description: 'Lock after 5 minutes of inactivity',
    },
    {
      value: '600',
      label: '10 minutes',
      description: 'Lock after 10 minutes of inactivity',
    },
  ];

  useEffect(() => {
    loadCurrentSetting();
  }, []);

  const loadCurrentSetting = async () => {
    try {
      const settings = await AsyncStorage.getItem('userSettings');
      if (settings) {
        const parsedSettings = JSON.parse(settings);
        setSelectedTimeout(parsedSettings.autoLockTimeout?.toString() || '120');
      }
    } catch (error) {
      console.error('Error loading auto-lock settings:', error);
    }
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const settings = await AsyncStorage.getItem('userSettings');
      const parsedSettings = settings ? JSON.parse(settings) : {};

      const updatedSettings = {
        ...parsedSettings,
        autoLockTimeout: parseInt(selectedTimeout, 10),
      };

      await AsyncStorage.setItem(
        'userSettings',
        JSON.stringify(updatedSettings)
      );

      // Update activity timestamp so new timeout takes effect immediately
      const timestamp = Date.now().toString();
      await AsyncStorage.setItem('vault_lastActiveTime', timestamp);

      const timeoutValue = parseInt(selectedTimeout, 10);
      const timeoutMessage =
        timeoutValue === 0
          ? 'Auto-lock has been disabled'
          : `Auto-lock timeout set to ${timeoutValue} seconds`;

      Alert.alert(
        'Settings Saved',
        `${timeoutMessage}. The new setting is now active.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      console.error('Error saving auto-lock settings:', error);
      Alert.alert('Error', 'Failed to save auto-lock settings');
    } finally {
      setIsLoading(false);
    }
  };

  const renderTimeoutOption = option => (
    <TouchableOpacity
      key={option.value}
      style={[styles.optionItem, { backgroundColor: theme.colors.card }]}
      onPress={() => setSelectedTimeout(option.value)}
      activeOpacity={0.7}
    >
      <View style={styles.optionContent}>
        <View style={styles.optionLeft}>
          <Text style={[styles.optionLabel, { color: theme.colors.text }]}>
            {option.label}
          </Text>
          <Text
            style={[styles.optionDescription, { color: theme.colors.textSecondary }]}
          >
            {option.description}
          </Text>
        </View>
        <RadioButton
          value={option.value}
          status={selectedTimeout === option.value ? 'checked' : 'unchecked'}
          onPress={() => setSelectedTimeout(option.value)}
          color={theme.colors.primary}
        />
      </View>
    </TouchableOpacity>
  );

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
          Auto-Lock Settings
        </Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          {/* Info Section */}
          <View
            style={[
              styles.infoSection,
              { backgroundColor: theme.colors.primary + '10' },
            ]}
          >
            <Icon name="info-circle" size={20} color={theme.colors.primary} />
            <Text style={[styles.infoText, { color: theme.colors.text }]}>
              Auto-lock automatically locks your vault after a period of
              inactivity to protect your passwords.
            </Text>
          </View>

          {/* Timeout Options */}
          <View style={styles.optionsContainer}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
              Select Auto-Lock Timeout
            </Text>

            <View style={[styles.optionsList, { backgroundColor: theme.colors.card }]}>
              {timeoutOptions.map((option, index) => (
                <View key={option.value}>
                  {renderTimeoutOption(option)}
                  {index < timeoutOptions.length - 1 && (
                    <View
                      style={[
                        styles.divider,
                        { backgroundColor: theme.colors.border },
                      ]}
                    />
                  )}
                </View>
              ))}
            </View>
          </View>

          {/* Security Note */}
          <View style={[styles.securityNote, { backgroundColor: theme.colors.card }]}>
            <Icon name="shield-alt" size={18} color={theme.colors.primary} />
            <Text style={[styles.securityText, { color: theme.colors.textSecondary }]}>
              For maximum security, we recommend using 2 minutes or less. Longer
              timeouts may expose your passwords if you leave your device
              unattended.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Action Buttons */}
      <View
        style={[styles.buttonContainer, { backgroundColor: theme.colors.background }]}
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
          Save Settings
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
  infoSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  optionsContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  optionsList: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  optionItem: {
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionLeft: {
    flex: 1,
    marginRight: 16,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 14,
    lineHeight: 18,
  },
  divider: {
    height: 1,
    marginLeft: 16,
  },
  securityNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  securityText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
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

export default AutoLockSettingsScreen;
