import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  useColorScheme,
} from 'react-native';
import {
  Card,
  TextInput,
  Checkbox,
  Snackbar,
  ProgressBar,
} from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Slider from '@react-native-community/slider';
import Icon from 'react-native-vector-icons/FontAwesome5';
import zxcvbn from 'zxcvbn';
import { useNavigation } from '@react-navigation/native';

// Constants for activity tracking
const LAST_ACTIVE_TIME_KEY = 'vault_lastActiveTime';

// const { width: screenWidth } = Dimensions.get('window'); // Unused

const PasswordGeneratorScreen = ({ navigation: navProp, route }) => {
  const navigation = navProp || useNavigation();

  // State for password generation options
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [includeUppercase, setIncludeUppercase] = useState(true);
  const [includeLowercase, setIncludeLowercase] = useState(true);
  const [includeNumbers, setIncludeNumbers] = useState(true);
  const [includeSymbols, setIncludeSymbols] = useState(true);
  const [passwordLength, setPasswordLength] = useState(16);
  const [passwordStrength, setPasswordStrength] = useState(null);

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });
  const [activeTab, setActiveTab] = useState('generator');

  // Get color scheme for theme support
  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === 'dark';

  // Theme colors
  const theme = {
    background: isDarkMode ? '#121212' : '#ffffff',
    surface: isDarkMode ? '#1e1e1e' : '#f5f5f5',
    primary: '#8e44ad',
    secondary: '#3498db',
    text: isDarkMode ? '#ffffff' : '#000000',
    textSecondary: isDarkMode ? '#b0b0b0' : '#666666',
    border: isDarkMode ? '#333333' : '#e0e0e0',
    cardBackground: isDarkMode ? '#1e1e1e' : '#ffffff',
  };

  // Character sets for password generation
  const charSets = {
    uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    lowercase: 'abcdefghijklmnopqrstuvwxyz',
    numbers: '0123456789',
    symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?',
  };

  useEffect(() => {
    updateActivity();
    loadUserPreferences();
  }, []);

  // Update password strength when password changes
  useEffect(() => {
    if (generatedPassword) {
      const result = zxcvbn(generatedPassword);
      setPasswordStrength(result);
    } else {
      setPasswordStrength(null);
    }
  }, [generatedPassword]);

  const updateActivity = async () => {
    try {
      const timestamp = Date.now().toString();
      await AsyncStorage.setItem(LAST_ACTIVE_TIME_KEY, timestamp);
    } catch (error) {
      console.error('Error updating activity timestamp:', error);
    }
  };

  const loadUserPreferences = async () => {
    try {
      const savedLength = await AsyncStorage.getItem(
        'generator_passwordLength'
      );
      if (savedLength) {
        setPasswordLength(parseInt(savedLength, 10));
      }
    } catch (error) {
      console.error('Error loading user preferences:', error);
    }
  };

  const saveUserPreferences = async () => {
    try {
      await AsyncStorage.setItem(
        'generator_passwordLength',
        passwordLength.toString()
      );
    } catch (error) {
      console.error('Error saving user preferences:', error);
    }
  };

  const generateSecurePassword = () => {
    updateActivity();

    // Validate that at least one character type is selected
    if (
      !includeUppercase &&
      !includeLowercase &&
      !includeNumbers &&
      !includeSymbols
    ) {
      showSnackbar('Please select at least one character type');
      return;
    }

    setIsLoading(true);

    try {
      let availableChars = '';
      const guaranteedChars = [];

      // Build character set and ensure at least one character from each selected type
      if (includeUppercase) {
        availableChars += charSets.uppercase;
        guaranteedChars.push(getRandomChar(charSets.uppercase));
      }
      if (includeLowercase) {
        availableChars += charSets.lowercase;
        guaranteedChars.push(getRandomChar(charSets.lowercase));
      }
      if (includeNumbers) {
        availableChars += charSets.numbers;
        guaranteedChars.push(getRandomChar(charSets.numbers));
      }
      if (includeSymbols) {
        availableChars += charSets.symbols;
        guaranteedChars.push(getRandomChar(charSets.symbols));
      }

      // Generate remaining characters
      const remainingLength = passwordLength - guaranteedChars.length;
      const randomChars = [];

      for (let i = 0; i < remainingLength; i++) {
        randomChars.push(getRandomChar(availableChars));
      }

      // Combine and shuffle all characters
      const allChars = [...guaranteedChars, ...randomChars];
      const shuffledPassword = shuffleArray(allChars).join('');

      setGeneratedPassword(shuffledPassword);
      showSnackbar('Password generated successfully!');
      saveUserPreferences();
    } catch (error) {
      console.error('Error generating password:', error);
      showSnackbar('Error generating password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const getRandomChar = charset => {
    const randomIndex = Math.floor(Math.random() * charset.length);
    return charset[randomIndex];
  };

  const shuffleArray = array => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  const copyToClipboard = async () => {
    if (!generatedPassword) {
      showSnackbar('No password to copy');
      return;
    }

    try {
      await Clipboard.setStringAsync(generatedPassword);
      showSnackbar('Password copied to clipboard!');
      updateActivity();
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      showSnackbar('Error copying password');
    }
  };

  const handleTabPress = tab => {
    setActiveTab(tab);
    updateActivity();

    switch (tab) {
      case 'vault':
        navigation.navigate('MyVault');
        break;
      case 'categories':
        navigation.navigate('Categories');
        break;
      case 'settings':
        // navigation.navigate('Settings');
        break;
      default:
        break;
    }
  };

  const handleReturnWithPassword = () => {
    if (
      route?.params?.returnScreen &&
      route?.params?.returnPassword &&
      generatedPassword
    ) {
      updateActivity();
      navigation.navigate(route.params.returnScreen, {
        generatedPassword: generatedPassword,
      });
    }
  };

  const handleLengthChange = value => {
    setPasswordLength(Math.round(value));
    updateActivity();
  };

  const handleOptionChange = (option, value) => {
    updateActivity();

    // Count currently selected options
    const currentlySelected = [
      includeUppercase,
      includeLowercase,
      includeNumbers,
      includeSymbols,
    ].filter(Boolean).length;

    // Prevent unchecking if it's the last selected option
    if (!value && currentlySelected === 1) {
      showSnackbar('At least one character type must be selected');
      return;
    }

    switch (option) {
      case 'uppercase':
        setIncludeUppercase(value);
        break;
      case 'lowercase':
        setIncludeLowercase(value);
        break;
      case 'numbers':
        setIncludeNumbers(value);
        break;
      case 'symbols':
        setIncludeSymbols(value);
        break;
    }

    // Regenerate password if one exists
    if (generatedPassword) {
      setTimeout(() => {
        generateSecurePassword();
      }, 100);
    }
  };

  const showSnackbar = message => {
    setSnackbar({ visible: true, message });
  };

  const getStrengthColor = score => {
    const colors = ['#e74c3c', '#e67e22', '#f39c12', '#2ecc71', '#27ae60'];
    return colors[score] || '#e74c3c';
  };

  const getStrengthText = score => {
    const labels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'];
    return labels[score] || 'Very Weak';
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          Password Generator
        </Text>
      </View>
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
        Create strong, secure passwords
      </Text>

      {/* Content */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        <Card style={[styles.card, { backgroundColor: theme.cardBackground }]}>
          {/* Generated Password Display */}
          <View style={styles.passwordSection}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Generated Password
            </Text>
            <View
              style={[
                styles.passwordDisplay,
                { backgroundColor: theme.surface },
              ]}
            >
              <TextInput
                style={styles.passwordInput}
                value={generatedPassword}
                placeholder="Click Generate"
                placeholderTextColor={theme.textSecondary}
                editable={false}
                multiline
                right={
                  generatedPassword ? (
                    <TextInput.Icon
                      icon="content-copy"
                      onPress={copyToClipboard}
                      iconColor={theme.primary}
                    />
                  ) : null
                }
                theme={{
                  colors: {
                    primary: theme.primary,
                    text: theme.text,
                    background: 'transparent',
                  },
                }}
              />
            </View>
          </View>

          {/* Password Options */}
          <View style={styles.optionsSection}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Password Options
            </Text>

            {/* Checkboxes */}
            <View style={styles.checkboxContainer}>
              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() =>
                  handleOptionChange('uppercase', !includeUppercase)
                }
              >
                <Checkbox
                  status={includeUppercase ? 'checked' : 'unchecked'}
                  color={theme.primary}
                />
                <Text style={[styles.checkboxLabel, { color: theme.text }]}>
                  Include Uppercase (A-Z)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() =>
                  handleOptionChange('lowercase', !includeLowercase)
                }
              >
                <Checkbox
                  status={includeLowercase ? 'checked' : 'unchecked'}
                  color={theme.primary}
                />
                <Text style={[styles.checkboxLabel, { color: theme.text }]}>
                  Include Lowercase (a-z)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => handleOptionChange('numbers', !includeNumbers)}
              >
                <Checkbox
                  status={includeNumbers ? 'checked' : 'unchecked'}
                  color={theme.primary}
                />
                <Text style={[styles.checkboxLabel, { color: theme.text }]}>
                  Include Numbers (0-9)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => handleOptionChange('symbols', !includeSymbols)}
              >
                <Checkbox
                  status={includeSymbols ? 'checked' : 'unchecked'}
                  color={theme.primary}
                />
                <Text style={[styles.checkboxLabel, { color: theme.text }]}>
                  Include Symbols (!@#$%^&*)
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Password Length */}
          <View style={styles.lengthSection}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Password Length
            </Text>
            <Text style={[styles.lengthValue, { color: theme.primary }]}>
              {passwordLength}
            </Text>
            <Slider
              style={styles.slider}
              minimumValue={8}
              maximumValue={32}
              value={passwordLength}
              onValueChange={handleLengthChange}
              minimumTrackTintColor={theme.primary}
              maximumTrackTintColor={theme.border}
              thumbTintColor={theme.primary}
              step={1}
            />
            <View style={styles.sliderLabels}>
              <Text
                style={[styles.sliderLabel, { color: theme.textSecondary }]}
              >
                8
              </Text>
              <Text
                style={[styles.sliderLabel, { color: theme.textSecondary }]}
              >
                32
              </Text>
            </View>
          </View>

          {/* Password Strength */}
          {passwordStrength && (
            <View style={styles.strengthSection}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                Password Strength
              </Text>
              <View style={styles.strengthIndicator}>
                <ProgressBar
                  progress={passwordStrength.score / 4}
                  color={getStrengthColor(passwordStrength.score)}
                  style={styles.strengthBar}
                />
                <Text
                  style={[
                    styles.strengthText,
                    { color: getStrengthColor(passwordStrength.score) },
                  ]}
                >
                  {getStrengthText(passwordStrength.score)}
                </Text>
              </View>
            </View>
          )}

          {/* Generate Button */}
          <TouchableOpacity
            style={styles.generateButton}
            onPress={generateSecurePassword}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['#9b59b6', '#3498db']}
              style={[
                styles.generateGradient,
                isLoading && styles.disabledButton,
              ]}
            >
              {isLoading ? (
                <Text style={styles.generateButtonText}>Generating...</Text>
              ) : (
                <>
                  <Icon
                    name="key"
                    size={16}
                    color="#fff"
                    style={styles.generateIcon}
                  />
                  <Text style={styles.generateButtonText}>
                    Generate Password
                  </Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {/* Use Password Button (when in return mode) */}
          {route?.params?.returnPassword && generatedPassword && (
            <TouchableOpacity
              style={[styles.generateButton, styles.usePasswordButton]}
              onPress={handleReturnWithPassword}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#27ae60', '#2ecc71']}
                style={styles.generateGradient}
              >
                <Icon
                  name="check"
                  size={16}
                  color="#fff"
                  style={styles.generateIcon}
                />
                <Text style={styles.generateButtonText}>Use This Password</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
        </Card>
      </ScrollView>

      {/* Bottom Navigation */}
      <View
        style={[
          styles.bottomNav,
          { backgroundColor: theme.background, borderTopColor: theme.border },
        ]}
      >
        {[
          { key: 'vault', icon: 'shield-alt', label: 'My Vault' },
          { key: 'categories', icon: 'folder', label: 'Categories' },
          { key: 'generator', icon: 'key', label: 'Generator' },
          { key: 'settings', icon: 'cog', label: 'Settings' },
        ].map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={styles.bottomNavTab}
            onPress={() => handleTabPress(tab.key)}
          >
            <Icon
              name={tab.icon}
              size={20}
              color={
                activeTab === tab.key ? theme.primary : theme.textSecondary
              }
            />
            <Text
              style={[
                styles.bottomNavLabel,
                {
                  color:
                    activeTab === tab.key ? theme.primary : theme.textSecondary,
                },
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Snackbar */}
      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ visible: false, message: '' })}
        duration={3000}
        style={styles.snackbar}
      >
        {snackbar.message}
      </Snackbar>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  content: {
    flex: 1,
  },
  scrollContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  card: {
    borderRadius: 12,
    padding: 20,
    elevation: 2,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  passwordSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  passwordDisplay: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  passwordInput: {
    backgroundColor: 'transparent',
    fontFamily: 'monospace',
    fontSize: 14,
    minHeight: 56,
  },
  optionsSection: {
    marginBottom: 24,
  },
  checkboxContainer: {
    gap: 8,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  checkboxLabel: {
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },
  lengthSection: {
    marginBottom: 24,
  },
  lengthValue: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  sliderLabel: {
    fontSize: 12,
  },
  strengthSection: {
    marginBottom: 24,
  },
  strengthIndicator: {
    alignItems: 'center',
  },
  strengthBar: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    marginBottom: 8,
  },
  strengthText: {
    fontSize: 14,
    fontWeight: '600',
  },
  generateButton: {
    borderRadius: 25,
    overflow: 'hidden',
  },
  usePasswordButton: {
    marginTop: 12,
  },
  generateGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    minHeight: 50,
  },
  generateIcon: {
    marginRight: 8,
  },
  generateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.6,
  },
  bottomNav: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 0,
    paddingBottom: 15,
    borderTopWidth: 1,
  },
  bottomNavTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  bottomNavLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  snackbar: {
    backgroundColor: '#333',
  },
});

export default PasswordGeneratorScreen;
