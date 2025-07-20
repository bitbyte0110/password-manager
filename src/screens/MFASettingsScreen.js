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
import { Button, Switch } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { useTheme } from '../contexts/ThemeContext';
import vaultService from '../services/vaultService';

const MFASettingsScreen = () => {
  const navigation = useNavigation();
  const { theme } = useTheme();
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  useEffect(() => {
    loadCurrentSetting();
    checkBiometricStatus();
  }, []);

  // Reload settings when screen comes into focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadCurrentSetting();
      checkBiometricStatus();
    });

    return unsubscribe;
  }, [navigation]);

  const loadCurrentSetting = async () => {
    try {
      const settings = await AsyncStorage.getItem('userSettings');
      const defaults = {
        mfaEnabled: false,
        biometricEnabled: false,
      };

      if (settings) {
        const parsedSettings = JSON.parse(settings);
        // Merge with defaults to ensure no undefined values
        const merged = { ...defaults, ...parsedSettings };
        setMfaEnabled(merged.mfaEnabled);
        setBiometricEnabled(merged.biometricEnabled);
      } else {
        // No settings found, use defaults
        setMfaEnabled(defaults.mfaEnabled);
        setBiometricEnabled(defaults.biometricEnabled);
      }
    } catch (error) {
      console.error('Error loading MFA settings:', error);
      // On error, use defaults
      setMfaEnabled(false);
      setBiometricEnabled(false);
    }
  };

  const checkBiometricStatus = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      setBiometricAvailable(hasHardware && isEnrolled);
    } catch (error) {
      console.error('Error checking biometric status:', error);
      setBiometricAvailable(false);
    }
  };

  const handleToggleMFA = () => {
    // Check if biometric is available and enabled before allowing MFA
    if (!mfaEnabled) {
      if (!biometricAvailable) {
        Alert.alert(
          'Biometric Not Available',
          'Multi-factor authentication requires biometric authentication to be available on your device. Please set up fingerprint or face recognition in your device settings.',
          [{ text: 'OK' }]
        );
        return;
      }

      if (!biometricEnabled) {
        Alert.alert(
          'Biometric Login Required',
          'Multi-factor authentication requires biometric login to be enabled first. Please enable biometric login in the settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Enable Biometric Login',
              onPress: () => navigation.navigate('BiometricSettings'),
            },
          ]
        );
        return;
      }

      // All requirements met, enable MFA
      handleSetupMFA();
    } else {
      // Show confirmation dialog for disabling
      Alert.alert(
        'Disable Multi-Factor Authentication',
        'Are you sure you want to disable MFA? This will reduce the security of your vault and only require your master password for access.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Disable MFA',
            style: 'destructive',
            onPress: () => handleDisableMFA(),
          },
        ]
      );
    }
  };

  const handleSetupMFA = () => {
    // In a real app, this would navigate to biometric setup or MFA configuration
    Alert.alert(
      'Enable Multi-Factor Authentication',
      'This will require both biometric authentication and your master password to access your vault. This provides enhanced security for your stored data.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Enable MFA',
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

      // Save to both AsyncStorage and SecureStore for consistency
      await AsyncStorage.setItem(
        'userSettings',
        JSON.stringify(updatedSettings)
      );
      await SecureStore.setItemAsync('vault_mfaEnabled', enabled.toString());

      setMfaEnabled(enabled);

      // If enabling MFA, clear any stored biometric passwords for security
      if (enabled) {
        try {
          await vaultService.clearBiometricAccess();
          console.log('Cleared biometric access when enabling MFA');
        } catch (error) {
          console.warn('Could not clear biometric access:', error);
        }
      }

      Alert.alert(
        'Settings Saved',
        `Multi-Factor Authentication has been ${enabled ? 'enabled' : 'disabled'}.${enabled ? ' You will now need both biometric and password authentication to access your vault.' : ' You can now use biometric authentication alone when available.'}`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      console.error('Error saving MFA settings:', error);
      Alert.alert('Error', 'Failed to save MFA settings');
    } finally {
      setIsLoading(false);
    }
  };

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
          <View style={[styles.statusCard, { backgroundColor: theme.colors.card }]}>
            <View style={styles.statusHeader}>
              <View
                style={[
                  styles.statusIcon,
                  {
                    backgroundColor: mfaEnabled
                      ? theme.colors.success + '20'
                      : theme.colors.warning + '20',
                  },
                ]}
              >
                <Icon
                  name={mfaEnabled ? 'shield-alt' : 'exclamation-triangle'}
                  size={24}
                  color={mfaEnabled ? theme.colors.success : theme.colors.warning}
                />
              </View>
              <View style={styles.statusContent}>
                <Text style={[styles.statusTitle, { color: theme.colors.text }]}>
                  MFA Status
                </Text>
                <Text
                  style={[
                    styles.statusSubtitle,
                    {
                      color: mfaEnabled ? theme.colors.success : theme.colors.warning,
                    },
                  ]}
                >
                  {mfaEnabled ? 'Enabled' : 'Disabled'}
                </Text>
              </View>
              <Switch
                value={mfaEnabled}
                onValueChange={handleToggleMFA}
                color={theme.colors.primary}
                disabled={isLoading}
              />
            </View>
          </View>

          {/* Description Section */}
          <View
            style={[styles.descriptionCard, { backgroundColor: theme.colors.card }]}
          >
            <Text style={[styles.descriptionTitle, { color: theme.colors.text }]}>
              About Multi-Factor Authentication
            </Text>
            <Text
              style={[styles.descriptionText, { color: theme.colors.textSecondary }]}
            >
              Multi-Factor Authentication adds an extra layer of security to
              your vault by requiring both your master password and a second
              factor (like biometric authentication) to access your passwords.
            </Text>

            <View style={styles.benefitsList}>
              <View style={styles.benefitItem}>
                <Icon name="check-circle" size={16} color={theme.colors.success} />
                <Text
                  style={[styles.benefitText, { color: theme.colors.textSecondary }]}
                >
                  Protection against password theft
                </Text>
              </View>
              <View style={styles.benefitItem}>
                <Icon name="check-circle" size={16} color={theme.colors.success} />
                <Text
                  style={[styles.benefitText, { color: theme.colors.textSecondary }]}
                >
                  Enhanced security for sensitive data
                </Text>
              </View>
              <View style={styles.benefitItem}>
                <Icon name="check-circle" size={16} color={theme.colors.success} />
                <Text
                  style={[styles.benefitText, { color: theme.colors.textSecondary }]}
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
              { backgroundColor: theme.colors.primary + '10' },
            ]}
          >
            <Icon name="info-circle" size={18} color={theme.colors.primary} />
            <Text style={[styles.securityText, { color: theme.colors.text }]}>
              We highly recommend enabling MFA for maximum security. Even if
              someone gains access to your master password, they won't be able
              to access your vault without the second factor.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Action Button */}
      <View
        style={[styles.buttonContainer, { backgroundColor: theme.colors.background }]}
      >
        <Button
          mode="contained"
          onPress={handleToggleMFA}
          style={[
            styles.actionButton,
            {
              backgroundColor: mfaEnabled ? theme.colors.error : theme.colors.primary,
            },
          ]}
          loading={isLoading}
          disabled={isLoading}
        >
          {isLoading 
            ? (mfaEnabled ? 'Disabling MFA...' : 'Enabling MFA...')
            : (mfaEnabled ? 'Disable MFA' : 'Enable MFA')
          }
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
