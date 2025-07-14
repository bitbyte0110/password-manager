import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Provider as PaperProvider, DefaultTheme } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import SetMasterPasswordScreen from './src/screens/SetMasterPasswordScreen';
import ShowRecoveryPhraseScreen from './src/screens/ShowRecoveryPhraseScreen';
import LoginScreen from './src/screens/LoginScreen';

const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#8e44ad',
    accent: '#3498db',
  },
};

// Mock MainApp component - replace with your actual main app
const MainApp = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.welcomeText}>Welcome to SecureVault!</Text>
      <Text style={styles.subText}>Your password manager is now set up.</Text>
      <StatusBar style="auto" />
    </View>
  );
};

export default function App() {
  const [currentScreen, setCurrentScreen] = useState('loading');
  const [screenParams, setScreenParams] = useState({});

  useEffect(() => {
    checkVaultStatus();
  }, []);

      const checkVaultStatus = async () => {
      try {
        // Use the valid SecureStore key format (alphanumeric, ".", "-", "_" only)
        const existingHash = await SecureStore.getItemAsync('vault_masterHash');
        if (existingHash) {
          // If master password exists, show LoginScreen for authentication
          setCurrentScreen('LoginScreen');
        } else {
          // If no master password, show SetMasterPasswordScreen
          setCurrentScreen('SetMasterPassword');
        }
      } catch (error) {
        console.error('Error checking vault status:', error);
        setCurrentScreen('SetMasterPassword');
      }
    };

  // Mock navigation object
  const navigation = {
    replace: (screenName, params = {}) => {
      setCurrentScreen(screenName);
      setScreenParams(params);
    },
    navigate: (screenName, params = {}) => {
      setCurrentScreen(screenName);
      setScreenParams(params);
    },
  };

  if (currentScreen === 'loading') {
    return (
      <PaperProvider theme={theme}>
        <View style={styles.container}>
          <Text>Loading...</Text>
        </View>
      </PaperProvider>
    );
  }

  const renderScreen = () => {
    switch (currentScreen) {
      case 'SetMasterPassword':
        return <SetMasterPasswordScreen navigation={navigation} />;
      case 'ShowRecoveryPhraseScreen':
        return (
          <ShowRecoveryPhraseScreen
            navigation={navigation}
            route={{ params: screenParams }}
          />
        );
      case 'LoginScreen':
        return <LoginScreen navigation={navigation} />;
      case 'MainApp':
        return <MainApp />;
      case 'RecoveryScreen':
        // TODO: Add RecoveryScreen component when implemented
        return (
          <View style={styles.container}>
            <Text>Recovery Screen - Coming Soon</Text>
          </View>
        );
      case 'ResetVaultScreen':
        // TODO: Add ResetVaultScreen component when implemented
        return (
          <View style={styles.container}>
            <Text>Reset Vault Screen - Coming Soon</Text>
          </View>
        );
      default:
        return <SetMasterPasswordScreen navigation={navigation} />;
    }
  };

  return <PaperProvider theme={theme}>{renderScreen()}</PaperProvider>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#8e44ad',
    marginBottom: 16,
  },
  subText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
});
