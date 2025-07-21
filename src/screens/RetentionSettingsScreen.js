import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { RadioButton } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../contexts/ThemeContext';

const RetentionSettingsScreen = ({ navigation }) => {
  const { theme } = useTheme();
  const [selectedPeriod, setSelectedPeriod] = useState('30');
  const [originalPeriod, setOriginalPeriod] = useState('30');
  const [loading, setLoading] = useState(true);

  const retentionOptions = [
    { value: '7', label: '7 Days', description: 'Items deleted after 1 week' },
    { value: '30', label: '30 Days', description: 'Items deleted after 1 month (Default)' },
    { value: '60', label: '60 Days', description: 'Items deleted after 2 months' },
    { value: '90', label: '90 Days', description: 'Items deleted after 3 months' },
  ];

  useEffect(() => {
    loadCurrentSetting();
  }, []);

  const loadCurrentSetting = async () => {
    try {
      const settings = await AsyncStorage.getItem('userSettings');
      if (settings) {
        const parsedSettings = JSON.parse(settings);
        const currentPeriod = String(parsedSettings.trashRetentionDays || 30);
        setSelectedPeriod(currentPeriod);
        setOriginalPeriod(currentPeriod);
      }
    } catch (error) {
      console.error('Error loading retention setting:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (selectedPeriod === originalPeriod) {
      navigation.goBack();
      return;
    }

    try {
      const settings = await AsyncStorage.getItem('userSettings');
      const parsedSettings = settings ? JSON.parse(settings) : {};
      
      const newSettings = {
        ...parsedSettings,
        trashRetentionDays: parseInt(selectedPeriod),
      };
      
      await AsyncStorage.setItem('userSettings', JSON.stringify(newSettings));
      
      Alert.alert(
        'Success',
        `Retention period updated to ${selectedPeriod} days`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      console.error('Error updating retention period:', error);
      Alert.alert('Error', 'Failed to update retention period');
    }
  };

  const handleCancel = () => {
    if (selectedPeriod !== originalPeriod) {
      Alert.alert(
        'Discard Changes?',
        'You have unsaved changes. Are you sure you want to go back?',
        [
          { text: 'Stay', style: 'cancel' },
          { text: 'Discard', onPress: () => navigation.goBack() },
        ]
      );
    } else {
      navigation.goBack();
    }
  };

  const renderOption = (option) => (
    <TouchableOpacity
      key={option.value}
      style={[
        styles.optionContainer,
        { 
          backgroundColor: theme.colors.surface,
          borderColor: selectedPeriod === option.value ? theme.colors.primary : theme.colors.border,
        },
      ]}
      onPress={() => setSelectedPeriod(option.value)}
      activeOpacity={0.7}
    >
      <View style={styles.optionContent}>
        <View style={styles.optionText}>
          <Text style={[styles.optionTitle, { color: theme.colors.text }]}>
            {option.label}
          </Text>
          <Text style={[styles.optionDescription, { color: theme.colors.textSecondary }]}>
            {option.description}
          </Text>
        </View>
        <RadioButton
          value={option.value}
          status={selectedPeriod === option.value ? 'checked' : 'unchecked'}
          onPress={() => setSelectedPeriod(option.value)}
          color={theme.colors.primary}
          uncheckedColor={theme.colors.textSecondary}
        />
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: theme.colors.text }]}>
            Loading settings...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <TouchableOpacity style={styles.backButton} onPress={handleCancel}>
          <Icon name="arrow-left" size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
          Retention Period
        </Text>
        <TouchableOpacity 
          style={[
            styles.saveButton,
            { 
              backgroundColor: selectedPeriod !== originalPeriod ? theme.colors.primary : 'transparent',
            },
          ]}
          onPress={handleSave}
          disabled={selectedPeriod === originalPeriod}
        >
          <Text 
            style={[
              styles.saveButtonText,
              { 
                color: selectedPeriod !== originalPeriod ? theme.colors.onPrimary : theme.colors.textSecondary,
              },
            ]}
          >
            Save
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={[styles.description, { color: theme.colors.textSecondary }]}>
          Choose how long deleted passwords should be kept in trash before being permanently deleted.
        </Text>

        <View style={styles.optionsContainer}>
          {retentionOptions.map(renderOption)}
        </View>

        <View style={[styles.warningContainer, { backgroundColor: theme.colors.warning + '20' }]}>
          <Icon name="exclamation-triangle" size={16} color={theme.colors.warning} />
          <Text style={[styles.warningText, { color: theme.colors.warning }]}>
            Changing this setting only affects newly deleted passwords. Existing items in trash will keep their original expiration dates.
          </Text>
        </View>
      </View>
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
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 16,
  },
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 60,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 24,
  },
  optionsContainer: {
    gap: 12,
    marginBottom: 24,
  },
  optionContainer: {
    borderRadius: 12,
    borderWidth: 2,
    overflow: 'hidden',
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  optionText: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 14,
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 8,
    gap: 12,
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
});

export default RetentionSettingsScreen;