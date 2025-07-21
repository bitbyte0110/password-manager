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
import { Divider } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import vaultService from '../services/vaultService';
import { usePasswords } from '../PasswordContext';
import AuthenticationModal from '../components/AuthenticationModal';
import { useTheme } from '../contexts/ThemeContext';

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
    theme: 'light',
    trashRetentionDays: 30, // days
  });
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState(null);
  const { theme } = useTheme();

  useEffect(() => {
    loadUserSettings();
  }, []);

  // Reload settings when screen comes into focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadUserSettings();
    });

    return unsubscribe;
  }, [navigation]);

  const loadUserSettings = async () => {
    try {
      // Load settings from storage
      const settings = await AsyncStorage.getItem('userSettings');
      const defaults = {
        biometricEnabled: false,
        mfaEnabled: false,
        autoLockTimeout: 120, // seconds (2 minutes default)
        clipboardTimeout: 30, // seconds default
        theme: 'light',
      };

      if (settings) {
        // Merge loaded settings with defaults to ensure no undefined values
        const parsed = JSON.parse(settings);
        setUserSettings({ ...defaults, ...parsed });
      } else {
        // No settings exist, use defaults and save them
        setUserSettings(defaults);
        await AsyncStorage.setItem('userSettings', JSON.stringify(defaults));
        console.log('Created default user settings');
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      // On error, fallback to defaults
      setUserSettings({
        biometricEnabled: false,
        mfaEnabled: false,
        autoLockTimeout: 120,
        clipboardTimeout: 30,
        theme: 'light',
      });
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
      setPendingNavigation(screenName);
      setShowAuthModal(true);
    } else {
      navigation.navigate(screenName);
    }
  };

  const handleAuthSuccess = authResult => {
    setShowAuthModal(false);
    if (pendingNavigation) {
      navigation.navigate(pendingNavigation);
      setPendingNavigation(null);
    }
  };

  const handleAuthCancel = () => {
    setShowAuthModal(false);
    setPendingNavigation(null);
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

  const handleRetentionSettings = () => {
    navigation.navigate('RetentionSettings');
  };

  const handleEmptyTrash = () => {
    Alert.alert(
      'Empty Trash',
      'Are you sure you want to permanently delete all items in trash? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Empty Trash',
          style: 'destructive',
          onPress: async () => {
            try {
              const deletedCount = await vaultService.emptyTrash(true);
              Alert.alert(
                'Success',
                `${deletedCount} items permanently deleted`
              );
            } catch (error) {
              console.error('Error emptying trash:', error);
              Alert.alert('Error', 'Failed to empty trash');
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
      style={[styles.settingItem, { backgroundColor: theme.colors.card }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.settingItemLeft}>
        <View
          style={[
            styles.settingIcon,
            { backgroundColor: theme.colors.primary + '20' },
          ]}
        >
          <Icon name={iconName} size={20} color={theme.colors.primary} />
        </View>
        <View style={styles.settingContent}>
          <Text style={[styles.settingTitle, { color: theme.colors.text }]}>
            {title}
          </Text>
          {subtitle && (
            <Text
              style={[
                styles.settingSubtitle,
                { color: theme.colors.textSecondary },
              ]}
            >
              {subtitle}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.settingItemRight}>
        {rightComponent}
        {showChevron && (
          <Icon
            name="chevron-right"
            size={14}
            color={theme.colors.textSecondary}
          />
        )}
      </View>
    </TouchableOpacity>
  );

  const renderSection = (title, children) => (
    <View style={styles.section}>
      <Text
        style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}
      >
        {title}
      </Text>
      <View
        style={[styles.sectionContent, { backgroundColor: theme.colors.card }]}
      >
        {children}
      </View>
    </View>
  );

  const renderDivider = () => (
    <Divider
      style={[styles.divider, { backgroundColor: theme.colors.border }]}
    />
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
              () => handleSettingPress('MFASettings', true)
            )}
            {renderDivider()}
            {renderSettingItem(
              'Biometric Login',
              userSettings.biometricEnabled ? 'Enabled' : 'Disabled',
              'fingerprint',
              () => handleSettingPress('BiometricSettings', true)
            )}
            {renderDivider()}
            {renderSettingItem(
              'Auto-Lock',
              `${userSettings.autoLockTimeout === 0 ? 'Never' : `${userSettings.autoLockTimeout}s`}`,
              'lock',
              () => handleSettingPress('AutoLockSettings', false)
            )}
            {renderDivider()}
            {renderSettingItem(
              'Clipboard Auto-Clear',
              `${userSettings.clipboardTimeout === 0 ? 'Never' : `${userSettings.clipboardTimeout}s`}`,
              'clipboard',
              () => handleSettingPress('ClipboardSettings', false)
            )}
          </>
        )}

        {/* Data Management Section */}
        {renderSection(
          'DATA MANAGEMENT',
          <>
            {renderSettingItem(
              'Export Vault',
              'Export all passwords to encrypted file',
              'download',
              () => handleSettingPress('Export', true)
            )}
            {renderDivider()}
            {renderSettingItem(
              'Import Vault',
              'Import passwords from encrypted file',
              'upload',
              () => handleSettingPress('Import', true)
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

        {/* Deleted Password Recovery Section */}
        {renderSection(
          'DELETED PASSWORD RECOVERY',
          <>
            {renderSettingItem(
              'Trash',
              'View and restore deleted passwords',
              'trash-alt',
              () => navigation.navigate('Trash')
            )}
            {renderDivider()}
            {renderSettingItem(
              'Retention Period',
              `${userSettings.trashRetentionDays || 30} days`,
              'calendar-alt',
              () => handleRetentionSettings()
            )}
            {renderDivider()}
            {renderSettingItem(
              'Empty Trash',
              'Permanently delete all items in trash',
              'trash',
              () => handleEmptyTrash()
            )}
          </>
        )}

        {/* Appearance Section */}
        {renderSection(
          'APPEARANCE',
          <>
            {renderSettingItem('Theme', 'Dark or Light', 'paint-brush', () =>
              handleSettingPress('AppearanceSettings', false)
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

      <AuthenticationModal
        visible={showAuthModal}
        onClose={handleAuthCancel}
        onSuccess={handleAuthSuccess}
        title="Settings Access"
        message="Authenticate to access this setting"
      />
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
