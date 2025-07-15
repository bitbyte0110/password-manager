import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Card, Button, Snackbar } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import FontAwesome5 from 'react-native-vector-icons/FontAwesome5';
import BiometricSetupModal from '../components/BiometricSetupModal';
import MFASetupModal from '../components/MFASetupModal';

// Constants for session management (matching App.js)
const LAST_ACTIVE_TIME_KEY = 'vault_lastActiveTime';

const ShowRecoveryPhraseScreen = ({ navigation, route }) => {
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });
  const [showSuccessScreen, setShowSuccessScreen] = useState(false);
  const [showBiometricModal, setShowBiometricModal] = useState(false);
  const [showMFAModal, setShowMFAModal] = useState(false);
  const { recoveryPhrase, showSetupModals } = route?.params || {};

  const copyRecoveryPhrase = async () => {
    try {
      await Clipboard.setStringAsync(recoveryPhrase);
      showSnackbar('Recovery phrase copied to clipboard');
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      showSnackbar('Failed to copy recovery phrase');
    }
  };

  const handleDone = () => {
    Alert.alert(
      'Confirm Setup Complete',
      'Have you safely stored your recovery phrase? This is your only chance to view it.',
      [
        { text: 'Let me save it', style: 'cancel' },
        {
          text: 'Yes, I saved it',
          style: 'default',
          onPress: () => {
            if (showSetupModals) {
              // Start the modal flow: show BiometricSetupModal first
              setShowBiometricModal(true);
            } else {
              // Original flow for backward compatibility
              setShowSuccessScreen(true);
              setTimeout(() => {
                if (navigation) {
                  navigation.replace('LoginScreen');
                }
              }, 2500);
            }
          },
        },
      ]
    );
  };

  const showSnackbar = message => {
    setSnackbar({ visible: true, message });
  };

  const handleBiometricSetupComplete = () => {
    setShowBiometricModal(false);
    // Show MFA modal next
    setShowMFAModal(true);
  };

  const handleMFASetupComplete = async () => {
    setShowMFAModal(false);

    // Set activity timestamp to establish authenticated session
    try {
      const timestamp = Date.now().toString();
      await AsyncStorage.setItem(LAST_ACTIVE_TIME_KEY, timestamp);
      console.log('Activity timestamp set during setup completion');
    } catch (error) {
      console.error('Error setting activity timestamp:', error);
    }

    // Show success screen and then navigate to MainApp
    setShowSuccessScreen(true);
    setTimeout(() => {
      if (navigation) {
        navigation.replace('MainApp');
      }
    }, 2500);
  };

  if (!recoveryPhrase) {
    return (
      <SafeAreaView style={styles.container}>
        <LinearGradient colors={['#9b59b6', '#3498db']} style={styles.gradient}>
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>
              Error: No recovery phrase provided
            </Text>
            <Button
              mode="contained"
              onPress={() => navigation?.replace('SetMasterPasswordScreen')}
              style={styles.errorButton}
            >
              <Text>Go Back</Text>
            </Button>
          </View>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  // Show success screen after user confirms they saved the recovery phrase
  if (showSuccessScreen) {
    return (
      <SafeAreaView style={styles.container}>
        <LinearGradient colors={['#9b59b6', '#3498db']} style={styles.gradient}>
          <View style={styles.successContainer}>
            <View style={styles.logoContainer}>
              <LinearGradient
                colors={['#7E57C2', '#26A69A']}
                style={styles.logo}
              >
                <FontAwesome5 name="check-circle" size={40} color="#fff" />
              </LinearGradient>
            </View>
            <Text style={styles.successTitle}>Welcome to SecureVault!</Text>
            <Text style={styles.successSubtitle}>
              Your password manager is now set up.
            </Text>
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>Redirecting to login...</Text>
            </View>
          </View>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={['#9b59b6', '#3498db']} style={styles.gradient}>
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
        >
          <Card style={styles.card}>
            {/* Logo */}
            <View style={styles.logoContainer}>
              <LinearGradient
                colors={['#7E57C2', '#26A69A']}
                style={styles.logo}
              >
                <FontAwesome5 name="key" size={40} color="#fff" />
              </LinearGradient>
            </View>

            {/* Title */}
            <Text style={styles.title}>Recovery Phrase</Text>
            <Text style={styles.subtitle}>Your Vault Recovery Key</Text>

            {/* Warning Notice */}
            <Card style={styles.warningCard}>
              <View style={styles.warningHeader}>
                <FontAwesome5
                  name="exclamation-triangle"
                  size={20}
                  color="#e74c3c"
                />
                <Text style={styles.warningTitle}>Important Warning</Text>
              </View>
              <Text style={styles.warningText}>
                This is your only chance to view your recovery phrase. Store it
                in a secure place.
              </Text>
              <Text style={styles.warningText}>
                If you lose this phrase, you won&apos;t be able to recover your
                vault if you forget your master password.
              </Text>
            </Card>

            {/* Recovery Phrase Display */}
            <Card style={styles.phraseCard}>
              <Text style={styles.phraseTitle}>
                Your 12-Word Recovery Phrase
              </Text>
              <ScrollView style={styles.phraseScrollView}>
                <Text style={styles.recoveryPhrase}>{recoveryPhrase}</Text>
              </ScrollView>

              <Button
                mode="outlined"
                onPress={copyRecoveryPhrase}
                style={styles.copyButton}
                icon="content-copy"
              >
                <Text>Copy Phrase</Text>
              </Button>
            </Card>

            {/* Storage Recommendations */}
            <Card style={styles.tipsCard}>
              <Text style={styles.tipsTitle}>Storage Recommendations</Text>
              <Text style={styles.tipItem}>
                • Write it down on paper and store in a safe place
              </Text>
              <Text style={styles.tipItem}>
                • Use a secure password manager
              </Text>
              <Text style={styles.tipItem}>
                • Never store it digitally unencrypted
              </Text>
              <Text style={styles.tipItem}>
                • Don&apos;t share it with anyone
              </Text>
              <Text style={styles.tipItem}>
                • Keep multiple copies in different secure locations
              </Text>
            </Card>

            {/* Done Button */}
            <TouchableOpacity style={styles.doneButton} onPress={handleDone}>
              <LinearGradient
                colors={['#27ae60', '#2ecc71']}
                style={styles.doneGradient}
              >
                <Text style={styles.doneButtonText}>
                  I&apos;ve Saved My Recovery Phrase
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </Card>
        </ScrollView>

        {/* Snackbar */}
        <Snackbar
          visible={snackbar.visible}
          onDismiss={() => setSnackbar({ visible: false, message: '' })}
          duration={3000}
        >
          {snackbar.message}
        </Snackbar>

        {/* Setup Modals */}
        <BiometricSetupModal
          visible={showBiometricModal}
          onComplete={handleBiometricSetupComplete}
        />

        <MFASetupModal
          visible={showMFAModal}
          onComplete={handleMFASetupComplete}
        />
      </LinearGradient>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: '#fff',
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
  },
  errorButton: {
    backgroundColor: '#e74c3c',
  },
  card: {
    borderRadius: 20,
    padding: 24,
    backgroundColor: '#fff',
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
    fontSize: 24,
    fontWeight: 'bold',
    color: '#8e44ad',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  warningCard: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: '#fff5f5',
    borderLeftWidth: 4,
    borderLeftColor: '#e74c3c',
  },
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#e74c3c',
    marginLeft: 8,
  },
  warningText: {
    fontSize: 14,
    color: '#c0392b',
    marginBottom: 8,
    lineHeight: 20,
  },
  phraseCard: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: '#f8f9fa',
  },
  phraseTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 16,
    textAlign: 'center',
  },
  phraseScrollView: {
    maxHeight: 120,
    marginBottom: 16,
  },
  recoveryPhrase: {
    fontSize: 16,
    color: '#2c3e50',
    lineHeight: 24,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    fontFamily: 'monospace',
    textAlign: 'center',
  },
  copyButton: {
    borderColor: '#3498db',
  },
  tipsCard: {
    marginBottom: 24,
    padding: 16,
    backgroundColor: '#f0f8ff',
    borderLeftWidth: 4,
    borderLeftColor: '#3498db',
  },
  tipsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 12,
  },
  tipItem: {
    fontSize: 14,
    color: '#34495e',
    marginBottom: 6,
    lineHeight: 18,
  },
  doneButton: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  doneGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    marginBottom: 40,
  },
  loadingContainer: {
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
  },
});

export default ShowRecoveryPhraseScreen;
