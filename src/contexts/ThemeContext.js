import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme, Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [themePreference, setThemePreference] = useState('system');
  const [isLoading, setIsLoading] = useState(true);

  // Calculate effective theme based on preference and system setting
  const getEffectiveTheme = preference => {
    switch (preference) {
      case 'light':
        return 'light';
      case 'dark':
        return 'dark';
      case 'system':
      default:
        return systemColorScheme || 'light';
    }
  };

  const effectiveTheme = getEffectiveTheme(themePreference);
  const isDarkMode = effectiveTheme === 'dark';

  // Theme colors - Updated to match the specified dark mode palette
  const theme = {
    mode: effectiveTheme,
    preference: themePreference,
    isDark: isDarkMode,
    colors: {
      background: isDarkMode ? '#181824' : '#ffffff',
      surface: isDarkMode ? '#1e1e2e' : '#f8f9fa',
      card: isDarkMode ? '#23243a' : '#ffffff',
      primary: isDarkMode ? '#9747ff' : '#8e44ad',
      secondary: '#3498db',
      accent: isDarkMode ? '#9747ff' : '#3498db',
      text: isDarkMode ? '#ffffff' : '#333333',
      textSecondary: isDarkMode ? '#e0e0e0' : '#666666',
      border: isDarkMode ? '#9747ff' : '#e0e0e0',
      error: '#e74c3c',
      success: '#2ecc71',
      warning: '#f39c12',
      info: '#3498db',
      // Additional colors for specific UI elements
      tabBar: isDarkMode ? '#23243a' : '#ffffff',
      tabBarActive: isDarkMode ? '#9747ff' : '#8e44ad',
      tabBarInactive: isDarkMode ? '#b0b0b0' : '#999999',
      modalOverlay: 'rgba(0, 0, 0, 0.5)',
      divider: isDarkMode ? '#444458' : '#e0e0e0',
      // Input field specific colors
      inputBackground: isDarkMode ? '#23243a' : '#ffffff',
      inputText: isDarkMode ? '#ffffff' : '#333333',
      inputPlaceholder: isDarkMode ? '#b0b0b0' : '#999999',
      inputBorder: isDarkMode ? '#9747ff' : '#e0e0e0',
      inputBorderFocused: isDarkMode ? '#9747ff' : '#8e44ad',
    },
  };

  // Load theme preference from storage
  useEffect(() => {
    loadThemePreference();
  }, []);

  // Listen for system theme changes when using system preference
  useEffect(() => {
    if (themePreference === 'system') {
      const subscription = Appearance.addChangeListener(({ colorScheme }) => {
        // Theme will automatically update through systemColorScheme
      });

      return () => subscription?.remove();
    }
  }, [themePreference]);

  const loadThemePreference = async () => {
    try {
      setIsLoading(true);
      const settings = await AsyncStorage.getItem('userSettings');
      if (settings) {
        const parsedSettings = JSON.parse(settings);
        const savedTheme = parsedSettings.theme || 'system';
        setThemePreference(savedTheme);
      }
    } catch (error) {
      console.error('Error loading theme preference:', error);
      setThemePreference('system');
    } finally {
      setIsLoading(false);
    }
  };

  const setTheme = async newTheme => {
    try {
      // Update state immediately for instant UI feedback
      setThemePreference(newTheme);

      // Save to storage
      const settings = await AsyncStorage.getItem('userSettings');
      const parsedSettings = settings ? JSON.parse(settings) : {};

      const updatedSettings = {
        ...parsedSettings,
        theme: newTheme,
      };

      await AsyncStorage.setItem(
        'userSettings',
        JSON.stringify(updatedSettings)
      );
      console.log(`Theme changed to: ${newTheme}`);
    } catch (error) {
      console.error('Error saving theme preference:', error);
      // Revert state on error
      loadThemePreference();
    }
  };

  const value = {
    theme,
    themePreference,
    setTheme,
    isDarkMode,
    isLoading,
  };

  if (isLoading) {
    // Return a basic theme while loading
    const basicTheme = {
      mode: 'light',
      preference: 'system',
      isDark: false,
      colors: {
        background: '#ffffff',
        surface: '#f8f9fa',
        card: '#ffffff',
        primary: '#8e44ad',
        secondary: '#3498db',
        accent: '#3498db',
        text: '#333333',
        textSecondary: '#666666',
        border: '#e0e0e0',
        error: '#e74c3c',
        success: '#2ecc71',
        warning: '#f39c12',
        info: '#3498db',
        tabBar: '#ffffff',
        tabBarActive: '#8e44ad',
        tabBarInactive: '#999999',
        modalOverlay: 'rgba(0, 0, 0, 0.5)',
        divider: '#e0e0e0',
        // Input field specific colors
        inputBackground: '#ffffff',
        inputText: '#333333',
        inputPlaceholder: '#999999',
        inputBorder: '#e0e0e0',
        inputBorderFocused: '#8e44ad',
      },
    };

    return (
      <ThemeContext.Provider
        value={{
          theme: basicTheme,
          themePreference: 'system',
          setTheme,
          isDarkMode: false,
          isLoading: true,
        }}
      >
        {children}
      </ThemeContext.Provider>
    );
  }

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};
