import React, { useState, useEffect } from 'react';
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
import { Button, RadioButton } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AutoLockSettingsScreen = () => {
  const navigation = useNavigation();
  const [selectedTimeout, setSelectedTimeout] = useState('120'); // Default 2 minutes
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
    success: '#2ecc71',
  };

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
      const timeoutMessage = timeoutValue === 0 
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
      style={[styles.optionItem, { backgroundColor: theme.card }]}
      onPress={() => setSelectedTimeout(option.value)}
      activeOpacity={0.7}
    >
      <View style={styles.optionContent}>
        <View style={styles.optionLeft}>
          <Text style={[styles.optionLabel, { color: theme.text }]}>
            {option.label}
          </Text>
          <Text
            style={[styles.optionDescription, { color: theme.textSecondary }]}
          >
            {option.description}
          </Text>
        </View>
        <RadioButton
          value={option.value}
          status={selectedTimeout === option.value ? 'checked' : 'unchecked'}
          onPress={() => setSelectedTimeout(option.value)}
          color={theme.primary}
        />
      </View>
    </TouchableOpacity>
  );

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
              { backgroundColor: theme.primary + '10' },
            ]}
          >
            <Icon name="info-circle" size={20} color={theme.primary} />
            <Text style={[styles.infoText, { color: theme.text }]}>
              Auto-lock automatically locks your vault after a period of
              inactivity to protect your passwords.
            </Text>
          </View>

          {/* Timeout Options */}
          <View style={styles.optionsContainer}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Select Auto-Lock Timeout
            </Text>

            <View style={[styles.optionsList, { backgroundColor: theme.card }]}>
              {timeoutOptions.map((option, index) => (
                <View key={option.value}>
                  {renderTimeoutOption(option)}
                  {index < timeoutOptions.length - 1 && (
                    <View
                      style={[
                        styles.divider,
                        { backgroundColor: theme.border },
                      ]}
                    />
                  )}
                </View>
              ))}
            </View>
          </View>

          {/* Security Note */}
          <View style={[styles.securityNote, { backgroundColor: theme.card }]}>
            <Icon name="shield-alt" size={18} color={theme.primary} />
            <Text style={[styles.securityText, { color: theme.textSecondary }]}>
              For maximum security, we recommend using 2 minutes or less. Longer
              timeouts may expose your passwords if you leave your device
              unattended.
            </Text>
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
          onPress={handleSave}
          style={[styles.button, { backgroundColor: theme.primary }]}
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
