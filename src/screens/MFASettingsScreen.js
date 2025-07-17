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
import { Button, Switch } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MFASettingsScreen = () => {
  const navigation = useNavigation();
  const [mfaEnabled, setMfaEnabled] = useState(false);
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
    warning: '#f39c12',
    error: '#e74c3c',
  };

  useEffect(() => {
    loadCurrentSetting();
  }, []);

  const loadCurrentSetting = async () => {
    try {
      const settings = await AsyncStorage.getItem('userSettings');
      if (settings) {
        const parsedSettings = JSON.parse(settings);
        setMfaEnabled(parsedSettings.mfaEnabled || false);
      }
    } catch (error) {
      console.error('Error loading MFA settings:', error);
    }
  };

  const handleToggleMFA = () => {
    if (mfaEnabled) {
      // Show confirmation dialog for disabling
      Alert.alert(
        'Disable Multi-Factor Authentication',
        'Are you sure you want to disable MFA? This will reduce the security of your vault.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Disable',
            style: 'destructive',
            onPress: () => handleDisableMFA(),
          },
        ]
      );
    } else {
      // Navigate to MFA setup
      handleSetupMFA();
    }
  };

  const handleSetupMFA = () => {
    // In a real app, this would navigate to biometric setup or MFA configuration
    Alert.alert(
      'Setup Multi-Factor Authentication',
      'MFA setup would integrate with your device biometrics or secondary authentication method.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Enable',
          onPress: () => saveMFASetting(true),
        },
      ]
    );
  };

  const handleDisableMFA = () => {
    saveMFASetting(false);
  };

  const saveMFASetting = async enabled => {
    setIsLoading(true);
    try {
      const settings = await AsyncStorage.getItem('userSettings');
      const parsedSettings = settings ? JSON.parse(settings) : {};

      const updatedSettings = {
        ...parsedSettings,
        mfaEnabled: enabled,
      };

      await AsyncStorage.setItem(
        'userSettings',
        JSON.stringify(updatedSettings)
      );
      setMfaEnabled(enabled);

      Alert.alert(
        'Settings Saved',
        `Multi-Factor Authentication has been ${enabled ? 'enabled' : 'disabled'}`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to save MFA settings');
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
          Multi-Factor Authentication
        </Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          {/* Status Card */}
          <View style={[styles.statusCard, { backgroundColor: theme.card }]}>
            <View style={styles.statusHeader}>
              <View
                style={[
                  styles.statusIcon,
                  {
                    backgroundColor: mfaEnabled
                      ? theme.success + '20'
                      : theme.warning + '20',
                  },
                ]}
              >
                <Icon
                  name={mfaEnabled ? 'shield-alt' : 'exclamation-triangle'}
                  size={24}
                  color={mfaEnabled ? theme.success : theme.warning}
                />
              </View>
              <View style={styles.statusContent}>
                <Text style={[styles.statusTitle, { color: theme.text }]}>
                  MFA Status
                </Text>
                <Text
                  style={[
                    styles.statusSubtitle,
                    {
                      color: mfaEnabled ? theme.success : theme.warning,
                    },
                  ]}
                >
                  {mfaEnabled ? 'Enabled' : 'Disabled'}
                </Text>
              </View>
              <Switch
                value={mfaEnabled}
                onValueChange={handleToggleMFA}
                color={theme.primary}
                disabled={isLoading}
              />
            </View>
          </View>

          {/* Description Section */}
          <View
            style={[styles.descriptionCard, { backgroundColor: theme.card }]}
          >
            <Text style={[styles.descriptionTitle, { color: theme.text }]}>
              About Multi-Factor Authentication
            </Text>
            <Text
              style={[styles.descriptionText, { color: theme.textSecondary }]}
            >
              Multi-Factor Authentication adds an extra layer of security to
              your vault by requiring both your master password and a second
              factor (like biometric authentication) to access your passwords.
            </Text>

            <View style={styles.benefitsList}>
              <View style={styles.benefitItem}>
                <Icon name="check-circle" size={16} color={theme.success} />
                <Text
                  style={[styles.benefitText, { color: theme.textSecondary }]}
                >
                  Protection against password theft
                </Text>
              </View>
              <View style={styles.benefitItem}>
                <Icon name="check-circle" size={16} color={theme.success} />
                <Text
                  style={[styles.benefitText, { color: theme.textSecondary }]}
                >
                  Enhanced security for sensitive data
                </Text>
              </View>
              <View style={styles.benefitItem}>
                <Icon name="check-circle" size={16} color={theme.success} />
                <Text
                  style={[styles.benefitText, { color: theme.textSecondary }]}
                >
                  Peace of mind with two-factor protection
                </Text>
              </View>
            </View>
          </View>

          {/* Security Note */}
          <View
            style={[
              styles.securityNote,
              { backgroundColor: theme.primary + '10' },
            ]}
          >
            <Icon name="info-circle" size={18} color={theme.primary} />
            <Text style={[styles.securityText, { color: theme.text }]}>
              We highly recommend enabling MFA for maximum security. Even if
              someone gains access to your master password, they won't be able
              to access your vault without the second factor.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Action Button */}
      <View
        style={[styles.buttonContainer, { backgroundColor: theme.background }]}
      >
        <Button
          mode="contained"
          onPress={handleToggleMFA}
          style={[
            styles.actionButton,
            {
              backgroundColor: mfaEnabled ? theme.error : theme.primary,
            },
          ]}
          loading={isLoading}
          disabled={isLoading}
        >
          {mfaEnabled ? 'Disable MFA' : 'Setup MFA'}
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
  statusCard: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  statusContent: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  statusSubtitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  descriptionCard: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  descriptionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  descriptionText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  benefitsList: {
    gap: 8,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  benefitText: {
    fontSize: 14,
    flex: 1,
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
    padding: 20,
  },
  actionButton: {
    paddingVertical: 8,
  },
});

export default MFASettingsScreen;
