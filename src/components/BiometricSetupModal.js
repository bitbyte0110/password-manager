import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import FontAwesome5 from 'react-native-vector-icons/FontAwesome5';
import { useTheme } from '../contexts/ThemeContext';

const BiometricSetupModal = ({ visible, onComplete }) => {
  const [isLoading, setIsLoading] = useState(false);
  const { theme } = useTheme();

  const handleEnable = async () => {
    setIsLoading(true);
    try {
      // Save to both AsyncStorage and SecureStore for consistency
      const settings = await AsyncStorage.getItem('userSettings');
      const parsedSettings = settings ? JSON.parse(settings) : {};

      const updatedSettings = {
        ...parsedSettings,
        biometricEnabled: true,
      };

      await AsyncStorage.setItem(
        'userSettings',
        JSON.stringify(updatedSettings)
      );
      await SecureStore.setItemAsync('vault_biometricEnabled', 'true');

      console.log('Biometric enabled during initial setup');
      onComplete(true);
    } catch (error) {
      console.error('Error enabling biometric:', error);
      // Still proceed even if storage fails
      onComplete(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkip = async () => {
    setIsLoading(true);
    try {
      // Save to both AsyncStorage and SecureStore for consistency
      const settings = await AsyncStorage.getItem('userSettings');
      const parsedSettings = settings ? JSON.parse(settings) : {};

      const updatedSettings = {
        ...parsedSettings,
        biometricEnabled: false,
      };

      await AsyncStorage.setItem(
        'userSettings',
        JSON.stringify(updatedSettings)
      );
      await SecureStore.setItemAsync('vault_biometricEnabled', 'false');

      console.log('Biometric skipped during initial setup');
      onComplete(false);
    } catch (error) {
      console.error('Error skipping biometric:', error);
      // Still proceed even if storage fails
      onComplete(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {}}
    >
      <View style={styles.overlay}>
        <View style={[styles.modalContainer, { backgroundColor: theme.colors.card }]}>
          {/* Logo */}
          <View style={styles.logoContainer}>
            <LinearGradient colors={[theme.colors.primary, theme.colors.secondary]} style={styles.logo}>
              <FontAwesome5 name="shield-alt" size={40} color="#fff" />
            </LinearGradient>
          </View>

          {/* Content */}
          <Text style={[styles.title, { color: theme.colors.text }]}>Enable Biometric Login?</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
            Use your fingerprint for faster and secure access
          </Text>

          {/* Buttons */}
          <View style={styles.buttonContainer}>
            {/* Enable Button */}
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleEnable}
              disabled={isLoading}
            >
              <LinearGradient
                colors={[theme.colors.primary, theme.colors.secondary]}
                style={styles.primaryButtonGradient}
              >
                <Text style={styles.primaryButtonText}>
                  {isLoading ? 'Enabling...' : 'Enable'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* Skip Button */}
            <TouchableOpacity
              style={[styles.secondaryButton, { backgroundColor: '#3A3A3C', borderColor: '#3A3A3C' }]}
              onPress={handleSkip}
              disabled={isLoading}
            >
              <Text style={[styles.secondaryButtonText, { color: '#FFFFFF' }]}>
                {isLoading ? 'Skipping...' : 'Skip'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 350,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  buttonContainer: {
    width: '100%',
  },
  primaryButton: {
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 12,
  },
  primaryButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryButton: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
});

export default BiometricSetupModal;
