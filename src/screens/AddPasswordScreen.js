import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  TextInput,
  Snackbar,
  Menu,
  Divider,
  ActivityIndicator,
} from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import vaultService from '../services/vaultService';
import { usePasswords } from '../PasswordContext';
import { useTheme } from '../contexts/ThemeContext';

// Constants for activity tracking
const LAST_ACTIVE_TIME_KEY = 'vault_lastActiveTime';

const AddPasswordScreen = ({ navigation: navProp, route }) => {
  const navigation = navProp || useNavigation();
  const { addPassword } = usePasswords();
  const { theme } = useTheme();

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    username: '',
    password: '',
    url: '',
    notes: '',
    categoryId: null,
    isFavorite: false,
  });

  // UI state
  const [categories, setCategories] = useState([]);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    initializeScreen();
  }, []);

  const initializeScreen = async () => {
    try {
      setIsInitializing(true);
      updateActivity();

      // Initialize vault service and database
      await vaultService.initialize();

      // Check if user is authenticated
      if (!vaultService.isUserAuthenticated()) {
        console.log('User not authenticated, redirecting to login');
        navigation.replace('Login');
        return;
      }

      // Load categories after database is initialized
      await loadCategories();
    } catch (error) {
      console.error('Error initializing AddPasswordScreen:', error);
      showSnackbar('Error initializing screen. Please try again.');
      // Navigate back if initialization fails
      navigation.goBack();
    } finally {
      setIsInitializing(false);
    }
  };

  // Handle returned password from PasswordGeneratorScreen
  useEffect(() => {
    if (route?.params?.generatedPassword) {
      setFormData(prev => ({
        ...prev,
        password: route.params.generatedPassword,
      }));
      // Clear the parameter to prevent re-setting on subsequent renders
      navigation.setParams({ generatedPassword: undefined });
    }
  }, [route?.params?.generatedPassword]);

  // Handle restored form data after session upgrade
  useEffect(() => {
    if (route?.params?.restoredFormData && route?.params?.sessionUpgraded) {
      setFormData(route.params.restoredFormData);
      showSnackbar('Session restored! You can now save your password.');
      // Clear the parameters
      navigation.setParams({
        restoredFormData: undefined,
        sessionUpgraded: undefined,
      });
    }
  }, [route?.params?.restoredFormData, route?.params?.sessionUpgraded]);

  // Refresh categories when returning from AddCategoryScreen
  useFocusEffect(
    useCallback(() => {
      if (route?.params?.shouldRefreshCategories) {
        loadCategories();
        navigation.setParams({ shouldRefreshCategories: undefined });
      }
    }, [route?.params?.shouldRefreshCategories])
  );

  // Handle pre-selected category from navigation params
  useEffect(() => {
    if (route?.params?.categoryId && categories.length > 0) {
      setFormData(prev => ({
        ...prev,
        categoryId: route.params.categoryId,
      }));
      // Clear the parameter to prevent re-setting
      navigation.setParams({ categoryId: undefined });
    }
  }, [route?.params?.categoryId, categories]);

  const updateActivity = async () => {
    try {
      const timestamp = Date.now().toString();
      await AsyncStorage.setItem(LAST_ACTIVE_TIME_KEY, timestamp);
    } catch (error) {
      console.error('Error updating activity timestamp:', error);
    }
  };

  const loadCategories = async () => {
    try {
      setIsLoadingCategories(true);
      const categoriesData = await vaultService.getCategories();
      setCategories(categoriesData);
    } catch (error) {
      console.error('Error loading categories:', error);
      showSnackbar('Error loading categories');
    } finally {
      setIsLoadingCategories(false);
    }
  };

  const validateForm = () => {
    const errors = {};

    // Required fields validation
    if (!formData.title.trim()) {
      errors.title = 'Title is required';
    }

    if (!formData.password.trim()) {
      errors.password = 'Password is required';
    }

    // URL validation (if provided)
    if (formData.url.trim()) {
      const urlPattern = /^https?:\/\/.+/;
      if (!urlPattern.test(formData.url.trim())) {
        errors.url =
          'Please enter a valid URL (must start with http:// or https://)';
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));

    // Clear error when user starts typing
    if (formErrors[field]) {
      setFormErrors(prev => ({
        ...prev,
        [field]: '',
      }));
    }
    updateActivity();
  };

  const handleCategorySelect = category => {
    if (category.id === 'create_new') {
      setShowCategoryMenu(false);
      navigation.navigate('AddCategory');
    } else {
      setFormData(prev => ({
        ...prev,
        categoryId: category.id,
      }));
      setShowCategoryMenu(false);
    }
    updateActivity();
  };

  const handleFavoriteToggle = () => {
    setFormData(prev => ({
      ...prev,
      isFavorite: !prev.isFavorite,
    }));
    updateActivity();
  };

  const generateStrongPassword = () => {
    // Character sets for password generation (same as PasswordGeneratorScreen)
    const charSets = {
      uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      lowercase: 'abcdefghijklmnopqrstuvwxyz',
      numbers: '0123456789',
      symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?',
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

    try {
      const passwordLength = 16;
      let availableChars = '';
      const guaranteedChars = [];

      // Build character set and ensure at least one character from each type
      availableChars += charSets.uppercase;
      guaranteedChars.push(getRandomChar(charSets.uppercase));

      availableChars += charSets.lowercase;
      guaranteedChars.push(getRandomChar(charSets.lowercase));

      availableChars += charSets.numbers;
      guaranteedChars.push(getRandomChar(charSets.numbers));

      availableChars += charSets.symbols;
      guaranteedChars.push(getRandomChar(charSets.symbols));

      // Generate remaining characters
      const remainingLength = passwordLength - guaranteedChars.length;
      const randomChars = [];

      for (let i = 0; i < remainingLength; i++) {
        randomChars.push(getRandomChar(availableChars));
      }

      // Combine and shuffle all characters
      const allChars = [...guaranteedChars, ...randomChars];
      const shuffledPassword = shuffleArray(allChars).join('');

      return shuffledPassword;
    } catch (error) {
      console.error('Error generating password:', error);
      return null;
    }
  };

  const handleGeneratePassword = () => {
    updateActivity();
    const generatedPassword = generateStrongPassword();
    if (generatedPassword) {
      setFormData(prev => ({
        ...prev,
        password: generatedPassword,
      }));
      showSnackbar('Strong password generated!');
    } else {
      showSnackbar('Error generating password. Please try again.');
    }
  };

  const handleSavePassword = async () => {
    if (!validateForm()) {
      showSnackbar('Please fix the errors and try again');
      return;
    }

    setIsSaving(true);

    try {
      // Ensure vault service and database are initialized
      if (!vaultService.isUserAuthenticated()) {
        console.log('User not authenticated, re-initializing vault service');
        await vaultService.initialize();

        if (!vaultService.isUserAuthenticated()) {
          showSnackbar('Authentication error. Please log in again.');
          navigation.replace('Login');
          return;
        }
      }

      // Double-check database connection
      const dbStats = await vaultService.getVaultStats();
      if (!dbStats.isInitialized) {
        throw new Error('Database not properly initialized');
      }
    } catch (initError) {
      console.error('Error during save initialization:', initError);
      showSnackbar('Database connection error. Please try again.');
      setIsSaving(false);
      return;
    }

    try {
      // Prepare password entry for database
      const passwordEntry = {
        title: formData.title.trim(),
        username: formData.username.trim(),
        password: formData.password,
        url: formData.url.trim(),
        notes: formData.notes.trim(),
        categoryId: formData.categoryId,
        isFavorite: formData.isFavorite,
      };

      // Save to database using existing vaultService
      const newId = await vaultService.addPasswordEntry(passwordEntry);

      // Fetch the complete entry from database (includes category info like icon/color)
      const completeEntry = await vaultService.getPasswordEntry(newId);

      // Use context method for optimistic update and global sync
      await addPassword(completeEntry);
      showSnackbar('Password saved successfully!');

      // Navigate back - no need for refresh parameters since context handles sync
      setTimeout(() => {
        if (route?.params?.categoryId) {
          // Go back to CategoryDetails - context will auto-update the display
          navigation.navigate('CategoryDetails', {
            categoryId: route.params.categoryId,
            categoryName: route.params.categoryName,
            categoryColor: route.params.categoryColor,
            categoryIcon: route.params.categoryIcon,
          });
        } else {
          // Go back to MyVault - context will auto-update the display
          navigation.goBack();
        }
      }, 1000);
    } catch (error) {
      console.error('Error saving password:', error);

      // Handle the specific case where OS biometric session needs master password
      if (error.message?.includes('NEED_MASTER_PASSWORD')) {
        showSnackbar('Please enter your master password to save passwords.');
        // For now, navigate to login screen - in the future this could be a modal
        navigation.replace('Login', {
          upgradeSession: true,
          returnTo: 'AddPassword',
          formData: formData,
          reason: 'biometric_password_required',
        });
        return;
      }

      showSnackbar('Error saving password. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    updateActivity();
    navigation.goBack();
  };

  const showSnackbar = message => {
    setSnackbar({ visible: true, message });
  };

  const getSelectedCategoryName = () => {
    if (!formData.categoryId) return 'Select a category';
    const selectedCategory = categories.find(
      cat => cat.id === formData.categoryId
    );
    return selectedCategory ? selectedCategory.name : 'Select a category';
  };

  const isFormValid = () => {
    return formData.title.trim() && formData.password.trim();
  };

  const categoryMenuItems = [
    ...categories.map(category => ({
      id: category.id,
      name: category.name,
      icon: category.icon || 'folder',
      color: category.color || '#007AFF',
    })),
    {
      id: 'create_new',
      name: '+ Create New Category',
      icon: 'plus',
      color: theme.colors.primary,
      isCreateNew: true,
    },
  ];

  // Show loading screen while initializing
  if (isInitializing) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={[styles.loadingText, { color: theme.colors.text }]}>
            Initializing secure vault...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBack}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialIcons
            name="arrow-back"
            size={24}
            color={theme.colors.text}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
          Add Password
        </Text>
        <View style={styles.headerRight} />
      </View>

      {/* Content */}
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Category Selection */}
          <View style={styles.fieldContainer}>
            <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>
              Category
            </Text>
            <Menu
              visible={showCategoryMenu}
              onDismiss={() => setShowCategoryMenu(false)}
              anchor={
                <TouchableOpacity
                  style={[
                    styles.categoryButton,
                    { borderColor: theme.colors.border },
                  ]}
                  onPress={() => setShowCategoryMenu(true)}
                  disabled={isLoadingCategories}
                >
                  <Text
                    style={[
                      styles.categoryButtonText,
                      {
                        color: formData.categoryId
                          ? theme.colors.text
                          : theme.colors.textSecondary,
                      },
                    ]}
                  >
                    {isLoadingCategories
                      ? 'Loading...'
                      : getSelectedCategoryName()}
                  </Text>
                  <MaterialIcons
                    name="keyboard-arrow-down"
                    size={24}
                    color={theme.colors.textSecondary}
                  />
                </TouchableOpacity>
              }
              contentStyle={{ backgroundColor: theme.colors.background }}
            >
              {categoryMenuItems.map((item, index) => {
                const fontWeight = item.isCreateNew ? '600' : '400';
                return (
                  <View key={item.id}>
                    <Menu.Item
                      onPress={() => handleCategorySelect(item)}
                      title={
                        <View style={styles.categoryMenuItem}>
                          <View
                            style={[
                              styles.categoryIcon,
                              { backgroundColor: item.color },
                            ]}
                          >
                            <Icon name={item.icon} size={16} color="#fff" />
                          </View>
                          <Text
                            style={[
                              styles.categoryMenuText,
                              {
                                color: item.isCreateNew
                                  ? theme.colors.primary
                                  : theme.colors.text,
                                fontWeight,
                              },
                            ]}
                          >
                            {item.name}
                          </Text>
                        </View>
                      }
                    />
                    {index < categoryMenuItems.length - 1 &&
                      index === categories.length - 1 && <Divider />}
                  </View>
                );
              })}
            </Menu>
          </View>

          {/* Title Input */}
          <View style={styles.fieldContainer}>
            <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>
              Title
            </Text>
            <TextInput
              mode="outlined"
              placeholder="e.g., Facebook, Gmail"
              value={formData.title}
              onChangeText={text => handleInputChange('title', text)}
              style={[
                styles.textInput,
                {
                  backgroundColor: theme.colors.inputBackground,
                },
              ]}
              textColor={theme.colors.inputText}
              placeholderTextColor={theme.colors.inputPlaceholder}
              error={!!formErrors.title}
              theme={{
                colors: {
                  primary: theme.colors.primary,
                  error: theme.colors.error,
                  text: theme.colors.inputText,
                  onSurface: theme.colors.inputText,
                  placeholder: theme.colors.inputPlaceholder,
                  background: theme.colors.inputBackground,
                  outline: theme.colors.inputBorder,
                  onSurfaceVariant: theme.colors.inputPlaceholder,
                },
              }}
            />
            {formErrors.title && (
              <Text style={[styles.errorText, { color: theme.colors.error }]}>
                {formErrors.title}
              </Text>
            )}
          </View>

          {/* Username/Email Input */}
          <View style={styles.fieldContainer}>
            <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>
              Username or Email
            </Text>
            <TextInput
              mode="outlined"
              placeholder="Enter username or email"
              value={formData.username}
              onChangeText={text => handleInputChange('username', text)}
              style={[
                styles.textInput,
                {
                  backgroundColor: theme.colors.inputBackground,
                },
              ]}
              textColor={theme.colors.inputText}
              placeholderTextColor={theme.colors.inputPlaceholder}
              keyboardType="email-address"
              autoCapitalize="none"
              theme={{
                colors: {
                  primary: theme.colors.primary,
                  text: theme.colors.inputText,
                  onSurface: theme.colors.inputText,
                  placeholder: theme.colors.inputPlaceholder,
                  background: theme.colors.inputBackground,
                  outline: theme.colors.inputBorder,
                  onSurfaceVariant: theme.colors.inputPlaceholder,
                },
              }}
            />
          </View>

          {/* Password Input */}
          <View style={styles.fieldContainer}>
            <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>
              Password
            </Text>
            <TextInput
              mode="outlined"
              placeholder="Enter password"
              value={formData.password}
              onChangeText={text => handleInputChange('password', text)}
              secureTextEntry={!showPassword}
              style={[
                styles.textInput,
                {
                  backgroundColor: theme.colors.inputBackground,
                },
              ]}
              textColor={theme.colors.inputText}
              placeholderTextColor={theme.colors.inputPlaceholder}
              error={!!formErrors.password}
              autoCorrect={false}
              autoCapitalize="none"
              keyboardType="default"
              textContentType="password"
              right={
                <TextInput.Icon
                  icon={showPassword ? 'eye-off' : 'eye'}
                  onPress={() => setShowPassword(!showPassword)}
                  iconColor={theme.colors.textSecondary}
                />
              }
              theme={{
                colors: {
                  primary: theme.colors.primary,
                  error: theme.colors.error,
                  text: theme.colors.inputText,
                  onSurface: theme.colors.inputText,
                  placeholder: theme.colors.inputPlaceholder,
                  background: theme.colors.inputBackground,
                  outline: theme.colors.inputBorder,
                  onSurfaceVariant: theme.colors.inputPlaceholder,
                },
              }}
            />
            {formErrors.password && (
              <Text style={[styles.errorText, { color: theme.colors.error }]}>
                {formErrors.password}
              </Text>
            )}

            {/* Generate Strong Password Link */}
            <TouchableOpacity
              style={styles.generateLinkContainer}
              onPress={handleGeneratePassword}
            >
              <Text
                style={[styles.generateLink, { color: theme.colors.secondary }]}
              >
                Generate Strong Password
              </Text>
            </TouchableOpacity>
          </View>

          {/* URL Input */}
          <View style={styles.fieldContainer}>
            <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>
              Website URL (Optional)
            </Text>
            <TextInput
              mode="outlined"
              placeholder="https://example.com"
              value={formData.url}
              onChangeText={text => handleInputChange('url', text)}
              style={[
                styles.textInput,
                {
                  backgroundColor: theme.colors.inputBackground,
                },
              ]}
              textColor={theme.colors.inputText}
              placeholderTextColor={theme.colors.inputPlaceholder}
              error={!!formErrors.url}
              keyboardType="url"
              autoCapitalize="none"
              theme={{
                colors: {
                  primary: theme.colors.primary,
                  error: theme.colors.error,
                  text: theme.colors.inputText,
                  onSurface: theme.colors.inputText,
                  placeholder: theme.colors.inputPlaceholder,
                  background: theme.colors.inputBackground,
                  outline: theme.colors.inputBorder,
                  onSurfaceVariant: theme.colors.inputPlaceholder,
                },
              }}
            />
            {formErrors.url && (
              <Text style={[styles.errorText, { color: theme.colors.error }]}>
                {formErrors.url}
              </Text>
            )}
          </View>

          {/* Notes Input */}
          <View style={styles.fieldContainer}>
            <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>
              Notes (Optional)
            </Text>
            <TextInput
              mode="outlined"
              placeholder="Add notes about this password..."
              value={formData.notes}
              onChangeText={text => handleInputChange('notes', text)}
              style={[
                styles.textInput,
                styles.notesInput,
                {
                  backgroundColor: theme.colors.inputBackground,
                },
              ]}
              textColor={theme.colors.inputText}
              placeholderTextColor={theme.colors.inputPlaceholder}
              multiline
              numberOfLines={4}
              theme={{
                colors: {
                  primary: theme.colors.primary,
                  text: theme.colors.inputText,
                  onSurface: theme.colors.inputText,
                  placeholder: theme.colors.inputPlaceholder,
                  background: theme.colors.inputBackground,
                  outline: theme.colors.inputBorder,
                  onSurfaceVariant: theme.colors.inputPlaceholder,
                },
              }}
            />
          </View>

          {/* Favorite Toggle */}
          <View style={styles.fieldContainer}>
            <TouchableOpacity
              style={styles.favoriteContainer}
              onPress={handleFavoriteToggle}
            >
              <MaterialIcons
                name={formData.isFavorite ? 'star' : 'star-border'}
                size={24}
                color={
                  formData.isFavorite
                    ? theme.colors.primary
                    : theme.colors.textSecondary
                }
              />
              <Text
                style={[styles.favoriteLabel, { color: theme.colors.text }]}
              >
                Mark as Favorite
              </Text>
            </TouchableOpacity>
          </View>

          {/* Save Button */}
          <TouchableOpacity
            style={[styles.saveButton, !isFormValid() && styles.disabledButton]}
            onPress={handleSavePassword}
            disabled={!isFormValid() || isSaving}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['#9b59b6', '#3498db']}
              style={[
                styles.saveGradient,
                (!isFormValid() || isSaving) && styles.disabledGradient,
              ]}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveButtonText}>Save Password</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  headerRight: {
    width: 28, // Match back button width for centering
  },
  keyboardContainer: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  scrollContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  fieldContainer: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: 'transparent',
    fontSize: 16,
  },
  notesInput: {
    height: 100,
    textAlignVertical: 'top',
  },
  categoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 16,
    minHeight: 56,
  },
  categoryButtonText: {
    fontSize: 16,
    flex: 1,
  },
  categoryMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  categoryMenuText: {
    fontSize: 16,
  },
  errorText: {
    fontSize: 12,
    marginTop: 4,
  },
  generateLinkContainer: {
    marginTop: 8,
  },
  generateLink: {
    fontSize: 14,
    fontWeight: '500',
  },
  favoriteContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  favoriteLabel: {
    fontSize: 16,
    marginLeft: 12,
  },
  saveButton: {
    borderRadius: 6,
    overflow: 'hidden',
    marginTop: 20,
  },
  saveGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.6,
  },
  disabledGradient: {
    opacity: 0.6,
  },
  snackbar: {
    backgroundColor: '#333',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
  },
});

export default AddPasswordScreen;
