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

const ClipboardSettingsScreen = () => {
  const navigation = useNavigation();
  const { theme } = useTheme();
  const [selectedTimeout, setSelectedTimeout] = useState('30');
  const [isLoading, setIsLoading] = useState(false);

  const timeoutOptions = [
    {
      value: '0',
      label: 'Never',
      description: 'Passwords remain in clipboard until manually cleared',
    },
    {
      value: '10',
      label: '10 seconds',
      description: 'Clear clipboard after 10 seconds',
    },
    {
      value: '30',
      label: '30 seconds',
      description: 'Clear clipboard after 30 seconds (recommended)',
    },
    {
      value: '60',
      label: '60 seconds',
      description: 'Clear clipboard after 1 minute',
    },
    {
      value: '120',
      label: '120 seconds',
      description: 'Clear clipboard after 2 minutes',
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
        setSelectedTimeout(parsedSettings.clipboardTimeout?.toString() || '30');
      }
    } catch (error) {
      console.error('Error loading clipboard settings:', error);
    }
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const settings = await AsyncStorage.getItem('userSettings');
      const parsedSettings = settings ? JSON.parse(settings) : {};

      const updatedSettings = {
        ...parsedSettings,
        clipboardTimeout: parseInt(selectedTimeout, 10),
      };

      await AsyncStorage.setItem(
        'userSettings',
        JSON.stringify(updatedSettings)
      );

      const timeoutValue = parseInt(selectedTimeout, 10);
      const timeoutMessage =
        timeoutValue === 0
          ? 'Clipboard auto-clear has been disabled'
          : `Clipboard will auto-clear after ${timeoutValue} seconds`;

      Alert.alert(
        'Settings Saved',
        `${timeoutMessage}. The new setting is now active for future password copies.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      console.error('Error saving clipboard settings:', error);
      Alert.alert('Error', 'Failed to save clipboard settings');
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
          Clipboard Auto-Clear
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
              For security, passwords copied to your clipboard are automatically
              cleared after the selected timeout to prevent unauthorized access.
            </Text>
          </View>

          {/* Timeout Options */}
          <View style={styles.optionsContainer}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
              Select Auto-Clear Timeout
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

          {/* Security Explanation */}
          <View style={[styles.securityNote, { backgroundColor: theme.colors.card }]}>
            <Icon name="shield-alt" size={18} color={theme.colors.primary} />
            <Text style={[styles.securityText, { color: theme.colors.textSecondary }]}>
              <Text style={{ fontWeight: '600' }}>Why auto-clear?</Text>
              {'\n'}
              Other apps or malicious software could potentially access your
              clipboard. Auto-clearing ensures passwords don't remain accessible
              longer than necessary.
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

export default ClipboardSettingsScreen;
