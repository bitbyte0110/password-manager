import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as SecureStore from 'expo-secure-store';
import FontAwesome5 from 'react-native-vector-icons/FontAwesome5';

const MFASetupModal = ({ visible, onComplete }) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleEnable = async () => {
    setIsLoading(true);
    try {
      await SecureStore.setItemAsync('vault_mfaEnabled', 'true');
      onComplete(true);
    } catch (error) {
      console.error('Error enabling MFA:', error);
      // Still proceed even if storage fails
      onComplete(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkip = async () => {
    setIsLoading(true);
    try {
      await SecureStore.setItemAsync('vault_mfaEnabled', 'false');
      onComplete(false);
    } catch (error) {
      console.error('Error skipping MFA:', error);
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
        <View style={styles.modalContainer}>
          {/* Logo */}
          <View style={styles.logoContainer}>
            <LinearGradient colors={['#7E57C2', '#26A69A']} style={styles.logo}>
              <FontAwesome5 name="shield-alt" size={40} color="#fff" />
            </LinearGradient>
          </View>

          {/* Content */}
          <Text style={styles.title}>Enable Multi-Factor Authentication?</Text>
          <Text style={styles.subtitle}>
            Require both biometric and password for extra security
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
                colors={['#9b59b6', '#3498db']}
                style={styles.primaryButtonGradient}
              >
                <Text style={styles.primaryButtonText}>
                  {isLoading ? 'Enabling...' : 'Enable MFA'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* Skip Button */}
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleSkip}
              disabled={isLoading}
            >
              <Text style={styles.secondaryButtonText}>Skip</Text>
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
    backgroundColor: '#fff',
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
    color: '#333',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
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
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  secondaryButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '500',
  },
});

export default MFASetupModal;
