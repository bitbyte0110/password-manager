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
import { Divider } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import vaultService from '../services/vaultService';
import { usePasswords } from '../PasswordContext';

const LAST_ACTIVE_TIME_KEY = 'vault_lastActiveTime';

const SettingsScreen = () => {
  const navigation = useNavigation();
  const { clearPasswords } = usePasswords();
  const [appVersion] = useState('1.0.0');
  const [userSettings, setUserSettings] = useState({
    biometricEnabled: false,
    mfaEnabled: false,
    autoLockTimeout: 120, // seconds
    clipboardTimeout: 30, // seconds
    theme: 'system',
  });

  // Get color scheme for theme support
  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === 'dark';

  // Theme colors
  const theme = {
    background: isDarkMode ? '#121212' : '#ffffff',
    surface: isDarkMode ? '#1e1e1e' : '#f8f9fa',
    card: isDarkMode ? '#2c2c2c' : '#ffffff',
    primary: '#8e44ad',
    secondary: '#3498db',
    text: isDarkMode ? '#ffffff' : '#333333',
    textSecondary: isDarkMode ? '#b0b0b0' : '#666666',
    border: isDarkMode ? '#333333' : '#e0e0e0',
    error: '#e74c3c',
    success: '#2ecc71',
    warning: '#f39c12',
  };

  useEffect(() => {
    loadUserSettings();
  }, []);

  const loadUserSettings = async () => {
    try {
      // Load settings from storage
      const settings = await AsyncStorage.getItem('userSettings');
      if (settings) {
        setUserSettings(JSON.parse(settings));
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const updateActivity = async () => {
    try {
      const timestamp = Date.now().toString();
      await AsyncStorage.setItem(LAST_ACTIVE_TIME_KEY, timestamp);
    } catch (error) {
      console.error('Error updating activity timestamp:', error);
    }
  };

  const handleSettingPress = (screenName, requiresAuth = true) => {
    updateActivity();

    if (requiresAuth) {
      // For now, navigate directly. In production, add authentication check
      navigation.navigate(screenName);
    } else {
      navigation.navigate(screenName);
    }
  };

  const handleLogOut = async () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out? You will need to authenticate again to access your vault.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            try {
              // Clear vault service session
              await vaultService.clearSession();

              // Clear password context
              clearPasswords();

              // Clear activity timestamp
              await AsyncStorage.removeItem(LAST_ACTIVE_TIME_KEY);

              // Navigate to login screen
              navigation.reset({
                index: 0,
                routes: [{ name: 'Login' }],
              });
            } catch (error) {
              console.error('Error during logout:', error);
              Alert.alert('Error', 'Failed to log out. Please try again.');
            }
          },
        },
      ]
    );
  };

  const renderSettingItem = (
    title,
    subtitle,
    iconName,
    onPress,
    showChevron = true,
    rightComponent = null
  ) => (
    <TouchableOpacity
      style={[styles.settingItem, { backgroundColor: theme.card }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.settingItemLeft}>
        <View
          style={[
            styles.settingIcon,
            { backgroundColor: theme.primary + '20' },
          ]}
        >
          <Icon name={iconName} size={20} color={theme.primary} />
        </View>
        <View style={styles.settingContent}>
          <Text style={[styles.settingTitle, { color: theme.text }]}>
            {title}
          </Text>
          {subtitle && (
            <Text
              style={[styles.settingSubtitle, { color: theme.textSecondary }]}
            >
              {subtitle}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.settingItemRight}>
        {rightComponent}
        {showChevron && (
          <Icon name="chevron-right" size={14} color={theme.textSecondary} />
        )}
      </View>
    </TouchableOpacity>
  );

  const renderSection = (title, children) => (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
        {title}
      </Text>
      <View style={[styles.sectionContent, { backgroundColor: theme.card }]}>
        {children}
      </View>
    </View>
  );

  const renderDivider = () => (
    <Divider style={[styles.divider, { backgroundColor: theme.border }]} />
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
          Settings
        </Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Account & Security Section */}
        {renderSection(
          'ACCOUNT & SECURITY',
          <>
            {renderSettingItem(
              'Change Master Password',
              'Update your master password',
              'key',
              () => handleSettingPress('ChangeMasterPassword')
            )}
            {renderDivider()}
            {renderSettingItem(
              'Multi-Factor Authentication',
              userSettings.mfaEnabled ? 'Enabled' : 'Disabled',
              'shield-alt',
              () => handleSettingPress('MFASettings')
            )}
            {renderDivider()}
            {renderSettingItem(
              'Biometric Login',
              userSettings.biometricEnabled ? 'Enabled' : 'Disabled',
              'fingerprint',
              () => handleSettingPress('BiometricSettings')
            )}
            {renderDivider()}
            {renderSettingItem(
              'Auto-Lock',
              `${userSettings.autoLockTimeout === 0 ? 'Never' : `${userSettings.autoLockTimeout}s`}`,
              'lock',
              () => handleSettingPress('AutoLockSettings')
            )}
            {renderDivider()}
            {renderSettingItem(
              'Clipboard Auto-Clear',
              `${userSettings.clipboardTimeout === 0 ? 'Never' : `${userSettings.clipboardTimeout}s`}`,
              'clipboard',
              () => handleSettingPress('ClipboardSettings')
            )}
          </>
        )}

        {/* Vault Management Section */}
        {renderSection(
          'VAULT MANAGEMENT',
          <>
            {renderSettingItem(
              'Reset Vault',
              'Delete all stored data permanently',
              'exclamation-triangle',
              () => handleSettingPress('ResetVault')
            )}
          </>
        )}

        {/* Appearance Section */}
        {renderSection(
          'APPEARANCE',
          <>
            {renderSettingItem(
              'Theme',
              'Dark, Light, or System',
              'paint-brush',
              () => handleSettingPress('AppearanceSettings', false)
            )}
          </>
        )}

        {/* About Section */}
        {renderSection(
          'ABOUT',
          <>
            {renderSettingItem(
              'App Version',
              appVersion,
              'info-circle',
              () => handleSettingPress('About', false),
              false
            )}
            {renderDivider()}
            {renderSettingItem(
              'Log Out',
              'Sign out of your vault',
              'sign-out-alt',
              handleLogOut,
              false
            )}
          </>
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>
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
  section: {
    marginTop: 32,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  sectionContent: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  settingItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 2,
  },
  settingSubtitle: {
    fontSize: 14,
  },
  settingItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  divider: {
    height: 1,
    marginLeft: 68,
  },
  bottomPadding: {
    height: 40,
  },
});

export default SettingsScreen;
