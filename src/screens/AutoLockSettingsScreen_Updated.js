/**
 * AutoLockSettingsScreen - Updated version with persistent session support
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../../App_Updated'; // Import useAuth hook

const AutoLockSettingsScreen = ({ navigation }) => {
  const { theme } = useTheme();
  const { saveAutoLockSettings, getAutoLockSettings } = useAuth();
  
  const [selectedTimeout, setSelectedTimeout] = useState(120); // Default 2 minutes
  const [isLoading, setIsLoading] = useState(true);

  const colors = {
    background: theme?.colors?.background || '#ffffff',
    surface: theme?.colors?.surface || '#f8f9fa',
    card: theme?.colors?.card || '#ffffff',
    primary: theme?.colors?.primary || '#8e44ad',
    text: theme?.colors?.text || '#333333',
    textSecondary: theme?.colors?.textSecondary || '#666666',
    border: theme?.colors?.border || '#e0e0e0',
    success: theme?.colors?.success || '#27ae60',
    warning: theme?.colors?.warning || '#f39c12',
    ...theme?.colors,
  };

  const timeoutOptions = [
    { value: 30, label: '30 seconds', description: 'Very secure but frequent' },
    { value: 60, label: '1 minute', description: 'Secure and convenient' },
    { value: 120, label: '2 minutes', description: 'Balanced security' },
    { value: 300, label: '5 minutes', description: 'Less secure but convenient' },
    { value: 600, label: '10 minutes', description: 'Minimal security' },
    { value: 1800, label: '30 minutes', description: 'Low security' },
    { value: 0, label: 'Never', description: 'Login persists across app restarts' },
  ];

  useEffect(() => {
    loadCurrentSettings();
  }, []);

  const loadCurrentSettings = async () => {
    try {
      setIsLoading(true);
      const settings = await getAutoLockSettings();
      setSelectedTimeout(settings.timeout);
    } catch (error) {
      console.error('Error loading auto-lock settings:', error);
      Alert.alert('Error', 'Failed to load current settings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      // Show warning for "Never" option
      if (selectedTimeout === 0) {
        Alert.alert(
          'Security Warning',
          'Setting auto-lock to "Never" will keep you logged in even after closing and reopening the app. This reduces security but increases convenience.\n\nYour session will persist until you manually log out or change this setting.\n\nAre you sure you want to continue?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Enable Never',
              style: 'destructive',
              onPress: () => saveSettings(),
            },
          ]
        );
        return;
      }

      // Show info for changing from "Never" to any other option
      const currentSettings = await getAutoLockSettings();
      if (currentSettings.timeout === 0 && selectedTimeout !== 0) {
        Alert.alert(
          'Session Reset',
          'Changing from "Never" to a timed auto-lock will end your persistent session. You will need to log in again when the app is closed or when the timeout is reached.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Continue',
              onPress: () => saveSettings(),
            },
          ]
        );
        return;
      }

      await saveSettings();
    } catch (error) {
      console.error('Error saving auto-lock settings:', error);
      Alert.alert('Error', 'Failed to save settings. Please try again.');
    }
  };

  const saveSettings = async () => {
    try {
      await saveAutoLockSettings({
        timeout: selectedTimeout,
        enabled: true,
      });

      Alert.alert(
        'Settings Saved',
        selectedTimeout === 0 
          ? 'Auto-lock is now set to "Never". Your session will persist across app restarts.'
          : `Auto-lock is now set to ${getTimeoutLabel(selectedTimeout)}.`,
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } catch (error) {
      console.error('Error in saveSettings:', error);
      Alert.alert('Error', 'Failed to save settings. Please try again.');
    }
  };

  const getTimeoutLabel = (timeout) => {
    const option = timeoutOptions.find(opt => opt.value === timeout);
    return option ? option.label : 'Unknown';
  };

  const renderTimeoutOption = (option) => {
    const isSelected = selectedTimeout === option.value;
    
    return (
      <TouchableOpacity
        key={option.value}
        style={[
          styles.optionContainer,
          {
            backgroundColor: isSelected ? `${colors.primary}15` : colors.surface,
            borderColor: isSelected ? colors.primary : colors.border,
          },
        ]}
        onPress={() => setSelectedTimeout(option.value)}
      >
        <View style={styles.optionContent}>
          <View style={styles.optionLeft}>
            <View
              style={[
                styles.radioButton,
                {
                  borderColor: isSelected ? colors.primary : colors.border,
                },
              ]}
            >
              {isSelected && (
                <View
                  style={[
                    styles.radioButtonInner,
                    { backgroundColor: colors.primary },
                  ]}
                />
              )}
            </View>
            <View style={styles.optionText}>
              <Text
                style={[
                  styles.optionLabel,
                  {
                    color: colors.text,
                    fontWeight: isSelected ? '600' : '400',
                  },
                ]}
              >
                {option.label}
              </Text>
              <Text
                style={[
                  styles.optionDescription,
                  { color: colors.textSecondary },
                ]}
              >
                {option.description}
              </Text>
            </View>
          </View>
          {option.value === 0 && (
            <Icon
              name="exclamation-triangle"
              size={20}
              color={colors.warning}
              style={styles.warningIcon}
            />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: colors.text }]}>
            Loading settings...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Icon name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Auto-Lock Settings
        </Text>
        <TouchableOpacity
          style={styles.saveButton}
          onPress={handleSaveSettings}
        >
          <Text style={[styles.saveButtonText, { color: colors.primary }]}>
            Save
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Description */}
        <View style={styles.descriptionContainer}>
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            Choose when your vault should automatically lock due to inactivity.
          </Text>
        </View>

        {/* Warning for "Never" option */}
        {selectedTimeout === 0 && (
          <View style={[styles.warningContainer, { 
            backgroundColor: `${colors.warning}15`,
            borderColor: colors.warning 
          }]}>
            <Icon name="shield-alt" size={20} color={colors.warning} />
            <Text style={[styles.warningText, { color: colors.warning }]}>
              "Never" keeps you logged in across app restarts. This reduces security but increases convenience.
            </Text>
          </View>
        )}

        {/* Security Tip */}
        <View style={[styles.tipContainer, { 
          backgroundColor: `${colors.success}15`,
          borderColor: colors.success 
        }]}>
          <Icon name="lightbulb" size={16} color={colors.success} />
          <Text style={[styles.tipText, { color: colors.success }]}>
            <Text style={{ fontWeight: '600' }}>Security Tip: </Text>
            Shorter timeouts provide better security, especially on shared or public devices.
          </Text>
        </View>

        {/* Timeout Options */}
        <View style={styles.optionsContainer}>
          {timeoutOptions.map(renderTimeoutOption)}
        </View>

        {/* Additional Info */}
        <View style={styles.infoContainer}>
          <Text style={[styles.infoTitle, { color: colors.text }]}>
            How Auto-Lock Works
          </Text>
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            • The timer starts when you stop interacting with the app
          </Text>
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            • Moving to background resets the timer when you return
          </Text>
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            • "Never" creates a persistent session that survives app restarts
          </Text>
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            • You can always manually lock by logging out
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
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
    flex: 1,
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  saveButton: {
    width: 60,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  descriptionContainer: {
    paddingVertical: 20,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    marginLeft: 12,
  },
  tipContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 24,
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    marginLeft: 8,
  },
  optionsContainer: {
    marginBottom: 32,
  },
  optionContainer: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  radioButtonInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  optionText: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 16,
    lineHeight: 20,
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 14,
    lineHeight: 18,
  },
  warningIcon: {
    marginLeft: 8,
  },
  infoContainer: {
    paddingBottom: 32,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  infoText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
});

export default AutoLockSettingsScreen;