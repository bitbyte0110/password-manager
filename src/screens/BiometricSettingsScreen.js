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
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';

const BiometricSettingsScreen = () => {
  const navigation = useNavigation();
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [biometricType, setBiometricType] = useState('fingerprint'); // fingerprint, face, or none

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
    checkBiometricSupport();
  }, []);

  // Reload settings when screen comes into focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadCurrentSetting();
    });

    return unsubscribe;
  }, [navigation]);

  const loadCurrentSetting = async () => {
    try {
      const settings = await AsyncStorage.getItem('userSettings');
      const defaults = {
        biometricEnabled: false,
      };
      
      if (settings) {
        const parsedSettings = JSON.parse(settings);
        // Merge with defaults to ensure no undefined values
        const merged = { ...defaults, ...parsedSettings };
        setBiometricEnabled(merged.biometricEnabled);
      } else {
        // No settings found, use defaults
        setBiometricEnabled(defaults.biometricEnabled);
      }
    } catch (error) {
      console.error('Error loading biometric settings:', error);
      // On error, use defaults
      setBiometricEnabled(false);
    }
  };

  const checkBiometricSupport = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
      
      if (!hasHardware || !isEnrolled) {
        setBiometricType('none');
        return;
      }

      // Determine the type based on supported authentication types
      if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        setBiometricType('face');
      } else if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        setBiometricType('fingerprint');
      } else {
        setBiometricType('none');
      }
    } catch (error) {
      console.error('Error checking biometric support:', error);
      setBiometricType('none');
    }
  };

  const handleToggleBiometric = () => {
    if (biometricType === 'none') {
      Alert.alert(
        'Biometric Not Available',
        'Your device does not support biometric authentication or it is not set up.',
        [{ text: 'OK' }]
      );
      return;
    }

    if (biometricEnabled) {
      // Show confirmation dialog for disabling
      Alert.alert(
        'Disable Biometric Login',
        'Are you sure you want to disable biometric login? You will need to use your master password each time.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Disable',
            style: 'destructive',
            onPress: () => saveBiometricSetting(false),
          },
        ]
      );
    } else {
      // Enable biometric
      saveBiometricSetting(true);
    }
  };

  const saveBiometricSetting = async enabled => {
    setIsLoading(true);
    try {
      const settings = await AsyncStorage.getItem('userSettings');
      const parsedSettings = settings ? JSON.parse(settings) : {};

      const updatedSettings = {
        ...parsedSettings,
        biometricEnabled: enabled,
      };

      // If disabling biometric, also disable MFA since MFA requires biometric
      if (!enabled && parsedSettings.mfaEnabled) {
        updatedSettings.mfaEnabled = false;
        await SecureStore.setItemAsync('vault_mfaEnabled', 'false');
      }

      // Save to both AsyncStorage and SecureStore for consistency
      await AsyncStorage.setItem('userSettings', JSON.stringify(updatedSettings));
      await SecureStore.setItemAsync('vault_biometricEnabled', enabled.toString());

      setBiometricEnabled(enabled);

      const message = enabled 
        ? 'Biometric login has been enabled'
        : parsedSettings.mfaEnabled 
          ? 'Biometric login has been disabled. Multi-factor authentication has also been disabled since it requires biometric authentication.'
          : 'Biometric login has been disabled';

      Alert.alert(
        'Settings Saved',
        message,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      console.error('Error saving biometric settings:', error);
      Alert.alert('Error', 'Failed to save biometric settings');
    } finally {
      setIsLoading(false);
    }
  };

  const getBiometricIcon = () => {
    switch (biometricType) {
      case 'face':
        return 'face-recognition';
      case 'fingerprint':
        return 'fingerprint';
      default:
        return 'times-circle';
    }
  };

  const getBiometricLabel = () => {
    switch (biometricType) {
      case 'face':
        return 'Biometric Login';
      case 'fingerprint':
        return 'Biometric Login';
      default:
        return 'Not Available';
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
          Biometric Login
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
                    backgroundColor: biometricEnabled
                      ? theme.success + '20'
                      : biometricType === 'none'
                        ? theme.error + '20'
                        : theme.warning + '20',
                  },
                ]}
              >
                <Icon
                  name={getBiometricIcon()}
                  size={24}
                  color={
                    biometricEnabled
                      ? theme.success
                      : biometricType === 'none'
                        ? theme.error
                        : theme.warning
                  }
                />
              </View>
              <View style={styles.statusContent}>
                <Text style={[styles.statusTitle, { color: theme.text }]}>
                  {getBiometricLabel()}
                </Text>
                <Text
                  style={[
                    styles.statusSubtitle,
                    {
                      color: biometricEnabled
                        ? theme.success
                        : biometricType === 'none'
                          ? theme.error
                          : theme.warning,
                    },
                  ]}
                >
                  {biometricEnabled
                    ? 'Enabled'
                    : biometricType === 'none'
                      ? 'Not Available'
                      : 'Disabled'}
                </Text>
              </View>
              <Switch
                value={biometricEnabled}
                onValueChange={handleToggleBiometric}
                color={theme.primary}
                disabled={isLoading || biometricType === 'none'}
              />
            </View>
          </View>

          {/* Device Compatibility */}
          <View
            style={[styles.compatibilityCard, { backgroundColor: theme.card }]}
          >
            <Text style={[styles.cardTitle, { color: theme.text }]}>
              Device Compatibility
            </Text>

            <View style={styles.compatibilityList}>
              <View style={styles.compatibilityItem}>
                <Icon name="info-circle" size={16} color={theme.primary} />
                <Text
                  style={[
                    styles.compatibilityText,
                    { color: theme.textSecondary },
                  ]}
                >
                  Not all devices support biometric authentication
                </Text>
              </View>

              <View style={styles.compatibilityItem}>
                <Icon
                  name="exclamation-triangle"
                  size={16}
                  color={theme.warning}
                />
                <Text
                  style={[
                    styles.compatibilityText,
                    { color: theme.textSecondary },
                  ]}
                >
                  Ensure biometrics are set up in device settings first
                </Text>
              </View>
            </View>
          </View>

          {/* Security Notice */}
          <View style={[styles.securityCard, { backgroundColor: theme.card }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>
              Security Notice
            </Text>

            <Text style={[styles.securityText, { color: theme.textSecondary }]}>
              Biometric authentication provides convenience but may be less
              secure than a strong master password in certain scenarios:
            </Text>

            <View style={styles.securityList}>
              <Text
                style={[styles.securityPoint, { color: theme.textSecondary }]}
              >
                • Biometrics can potentially be compromised
              </Text>
              <Text
                style={[styles.securityPoint, { color: theme.textSecondary }]}
              >
                • Master password remains required for account recovery
              </Text>
              <Text
                style={[styles.securityPoint, { color: theme.textSecondary }]}
              >
                • Use alongside other security measures for best protection
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Action Button */}
      {biometricType !== 'none' && (
        <View
          style={[
            styles.buttonContainer,
            { backgroundColor: theme.background },
          ]}
        >
          <Button
            mode="contained"
            onPress={handleToggleBiometric}
            style={[
              styles.actionButton,
              {
                backgroundColor: biometricEnabled ? theme.error : theme.primary,
              },
            ]}
            loading={isLoading}
            disabled={isLoading}
          >
            {biometricEnabled
              ? 'Disable Biometric Login'
              : 'Enable Biometric Login'}
          </Button>
        </View>
      )}
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
  compatibilityCard: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  securityCard: {
    borderRadius: 12,
    padding: 20,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  compatibilityList: {
    gap: 8,
  },
  compatibilityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  compatibilityText: {
    fontSize: 14,
    flex: 1,
  },
  securityText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  securityList: {
    gap: 4,
  },
  securityPoint: {
    fontSize: 14,
    lineHeight: 18,
  },
  buttonContainer: {
    padding: 20,
  },
  actionButton: {
    paddingVertical: 8,
  },
});

export default BiometricSettingsScreen;
