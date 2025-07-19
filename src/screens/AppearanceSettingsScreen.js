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

const AppearanceSettingsScreen = () => {
  const navigation = useNavigation();
  const [selectedTheme, setSelectedTheme] = useState('light');
  const [isLoading, setIsLoading] = useState(false);

  const getEffectiveTheme = themeChoice => {
    return themeChoice === 'dark';
  };

  const isDarkMode = getEffectiveTheme(selectedTheme);

  const theme = {
    background: isDarkMode ? '#121212' : '#ffffff',
    card: isDarkMode ? '#2c2c2c' : '#ffffff',
    primary: '#8e44ad',
    text: isDarkMode ? '#ffffff' : '#333333',
    textSecondary: isDarkMode ? '#b0b0b0' : '#666666',
    border: isDarkMode ? '#333333' : '#e0e0e0',
    success: '#2ecc71',
  };

  const themeOptions = [
    {
      value: 'light',
      label: 'Light Mode',
      description: 'Always use light theme',
      icon: 'sun',
      colors: { bg: '#ffffff', text: '#333333', accent: '#8e44ad' },
    },
    {
      value: 'dark',
      label: 'Dark Mode',
      description: 'Always use dark theme',
      icon: 'moon',
      colors: { bg: '#121212', text: '#ffffff', accent: '#8e44ad' },
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
        // If the saved theme is 'system', default to 'light'
        const savedTheme = parsedSettings.theme;
        setSelectedTheme(
          savedTheme === 'system' ? 'light' : savedTheme || 'light'
        );
      }
    } catch (error) {
      console.error('Error loading theme settings:', error);
    }
  };

  const handleThemeChange = newTheme => {
    setSelectedTheme(newTheme);
    // Apply theme immediately for preview
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const settings = await AsyncStorage.getItem('userSettings');
      const parsedSettings = settings ? JSON.parse(settings) : {};

      const updatedSettings = {
        ...parsedSettings,
        theme: selectedTheme,
      };

      await AsyncStorage.setItem(
        'userSettings',
        JSON.stringify(updatedSettings)
      );

      Alert.alert(
        'Theme Updated',
        'Your theme preference has been saved and will be applied throughout the app.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to save theme settings');
    } finally {
      setIsLoading(false);
    }
  };

  const renderThemeOption = option => (
    <TouchableOpacity
      key={option.value}
      style={[styles.themeOption, { backgroundColor: theme.card }]}
      onPress={() => handleThemeChange(option.value)}
      activeOpacity={0.7}
    >
      <View style={styles.optionContent}>
        <View style={styles.optionLeft}>
          <View
            style={[
              styles.themeIcon,
              { backgroundColor: theme.primary + '20' },
            ]}
          >
            <Icon name={option.icon} size={20} color={theme.primary} />
          </View>
          <View style={styles.themeInfo}>
            <Text style={[styles.themeLabel, { color: theme.text }]}>
              {option.label}
            </Text>
            <Text
              style={[styles.themeDescription, { color: theme.textSecondary }]}
            >
              {option.description}
            </Text>
          </View>
        </View>
        <View style={styles.optionRight}>
          {/* Theme Preview */}
          <View style={styles.themePreview}>
            <View
              style={[
                styles.previewBox,
                {
                  backgroundColor: option.colors.bg,
                  borderColor: theme.border,
                },
              ]}
            >
              <View
                style={[
                  styles.previewHeader,
                  { backgroundColor: option.colors.accent },
                ]}
              />
              <View
                style={[
                  styles.previewText,
                  { backgroundColor: option.colors.text + '20' },
                ]}
              />
              <View
                style={[
                  styles.previewText,
                  { backgroundColor: option.colors.text + '10', width: '60%' },
                ]}
              />
            </View>
          </View>
          <RadioButton
            value={option.value}
            status={selectedTheme === option.value ? 'checked' : 'unchecked'}
            onPress={() => handleThemeChange(option.value)}
            color={theme.primary}
          />
        </View>
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
          Appearance
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
            <Icon name="paint-brush" size={20} color={theme.primary} />
            <Text style={[styles.infoText, { color: theme.text }]}>
              Choose your preferred theme. Changes apply immediately and affect
              the entire app interface.
            </Text>
          </View>

          {/* Theme Options */}
          <View style={styles.themeContainer}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Select Theme
            </Text>

            <View style={styles.themeList}>
              {themeOptions.map((option, index) => (
                <View key={option.value}>
                  {renderThemeOption(option)}
                  {index < themeOptions.length - 1 && (
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

          {/* Current Preview */}
          <View
            style={[styles.currentPreview, { backgroundColor: theme.card }]}
          >
            <Text style={[styles.previewTitle, { color: theme.text }]}>
              Current Theme Preview
            </Text>
            <View style={styles.previewContainer}>
              <View
                style={[
                  styles.largPreviewBox,
                  {
                    backgroundColor: theme.background,
                    borderColor: theme.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.largePreviewHeader,
                    { backgroundColor: theme.primary },
                  ]}
                >
                  <View
                    style={[
                      styles.headerElement,
                      { backgroundColor: '#ffffff40' },
                    ]}
                  />
                  <View
                    style={[
                      styles.headerElement,
                      { backgroundColor: '#ffffff40', width: 80 },
                    ]}
                  />
                </View>
                <View style={styles.largePreviewContent}>
                  <View
                    style={[
                      styles.contentLine,
                      { backgroundColor: theme.text + '80' },
                    ]}
                  />
                  <View
                    style={[
                      styles.contentLine,
                      { backgroundColor: theme.text + '60', width: '70%' },
                    ]}
                  />
                  <View
                    style={[
                      styles.contentLine,
                      { backgroundColor: theme.text + '40', width: '50%' },
                    ]}
                  />
                </View>
              </View>
            </View>
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
          Save Theme
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
  themeContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  themeList: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  themeOption: {
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  themeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  themeInfo: {
    flex: 1,
  },
  themeLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  themeDescription: {
    fontSize: 14,
  },
  optionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  themePreview: {
    marginRight: 8,
  },
  previewBox: {
    width: 40,
    height: 30,
    borderRadius: 6,
    borderWidth: 1,
    overflow: 'hidden',
  },
  previewHeader: {
    height: 8,
  },
  previewText: {
    height: 3,
    margin: 2,
    borderRadius: 1,
  },
  divider: {
    height: 1,
    marginLeft: 68,
  },
  currentPreview: {
    borderRadius: 12,
    padding: 20,
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  previewContainer: {
    alignItems: 'center',
  },
  largPreviewBox: {
    width: 200,
    height: 120,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  largePreviewHeader: {
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  headerElement: {
    height: 8,
    width: 40,
    borderRadius: 4,
  },
  largePreviewContent: {
    padding: 12,
    gap: 6,
  },
  contentLine: {
    height: 6,
    borderRadius: 3,
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

export default AppearanceSettingsScreen;
