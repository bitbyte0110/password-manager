import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  useColorScheme,
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
import Icon from 'react-native-vector-icons/FontAwesome5';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import vaultService from '../services/vaultService';
import { usePasswords } from '../PasswordContext';

// Constants for activity tracking
const LAST_ACTIVE_TIME_KEY = 'vault_lastActiveTime';

const AddPasswordScreen = ({ navigation: navProp, route }) => {
  const navigation = navProp || useNavigation();
  const { addPassword } = usePasswords();

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

  // Get color scheme for theme support
  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === 'dark';

  // Theme colors
  const theme = {
    background: isDarkMode ? '#121212' : '#ffffff',
    surface: isDarkMode ? '#1e1e1e' : '#f5f5f5',
    primary: '#8e44ad',
    secondary: '#3498db',
    text: isDarkMode ? '#ffffff' : '#333333',
    textSecondary: isDarkMode ? '#b0b0b0' : '#666666',
    border: isDarkMode ? '#333333' : '#e0e0e0',
    error: '#e74c3c',
    generateLink: '#3366FF',
  };

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

  // Refresh categories when returning from AddCategoryScreen
  useFocusEffect(
    useCallback(() => {
      if (route?.params?.shouldRefreshCategories) {
        loadCategories();
        navigation.setParams({ shouldRefreshCategories: undefined });
      }
    }, [route?.params?.shouldRefreshCategories])
  );

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

  const handleGeneratePassword = () => {
    updateActivity();
    navigation.navigate('PasswordGenerator', {
      returnScreen: 'AddPassword',
      returnPassword: true,
    });
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
      // Get the full decrypted entry (assume vaultService returns it or fetch it)
      const decryptedEntry = { ...passwordEntry, id: newId };
      addPassword(decryptedEntry);
      showSnackbar('Password saved successfully!');

      // Navigate back to HomeScreen with refresh
      setTimeout(() => {
        navigation.navigate('MainTabs', {
          screen: 'MyVault',
          params: {
            shouldRefresh: true,
          },
        });
      }, 1000);
    } catch (error) {
      console.error('Error saving password:', error);
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
      color: theme.primary,
      isCreateNew: true,
    },
  ];

  // Show loading screen while initializing
  if (isInitializing) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.background }]}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.text }]}>
            Initializing secure vault...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBack}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Icon name="arrow-left" size={20} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
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
            <Text style={[styles.fieldLabel, { color: theme.text }]}>
              Category
            </Text>
            <Menu
              visible={showCategoryMenu}
              onDismiss={() => setShowCategoryMenu(false)}
              anchor={
                <TouchableOpacity
                  style={[styles.categoryButton, { borderColor: theme.border }]}
                  onPress={() => setShowCategoryMenu(true)}
                  disabled={isLoadingCategories}
                >
                  <Text
                    style={[
                      styles.categoryButtonText,
                      {
                        color: formData.categoryId
                          ? theme.text
                          : theme.textSecondary,
                      },
                    ]}
                  >
                    {isLoadingCategories
                      ? 'Loading...'
                      : getSelectedCategoryName()}
                  </Text>
                  <Icon
                    name="chevron-down"
                    size={16}
                    color={theme.textSecondary}
                  />
                </TouchableOpacity>
              }
              contentStyle={{ backgroundColor: theme.background }}
            >
              {categoryMenuItems.map((item, index) => (
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
                          <Icon name={item.icon} size={12} color="#fff" />
                        </View>
                        <Text
                          style={[
                            styles.categoryMenuText,
                            {
                              color: item.isCreateNew
                                ? theme.primary
                                : theme.text,
                              fontWeight: item.isCreateNew ? '600' : 'normal',
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
              ))}
            </Menu>
          </View>

          {/* Title Input */}
          <View style={styles.fieldContainer}>
            <Text style={[styles.fieldLabel, { color: theme.text }]}>
              Title
            </Text>
            <TextInput
              mode="outlined"
              placeholder="e.g., Facebook, Gmail"
              value={formData.title}
              onChangeText={text => handleInputChange('title', text)}
              style={[styles.textInput, { backgroundColor: theme.background }]}
              error={!!formErrors.title}
              theme={{
                colors: {
                  primary: theme.primary,
                  error: theme.error,
                  text: theme.text,
                  placeholder: theme.textSecondary,
                  background: theme.background,
                  outline: theme.border,
                },
              }}
            />
            {formErrors.title && (
              <Text style={[styles.errorText, { color: theme.error }]}>
                {formErrors.title}
              </Text>
            )}
          </View>

          {/* Username/Email Input */}
          <View style={styles.fieldContainer}>
            <Text style={[styles.fieldLabel, { color: theme.text }]}>
              Username or Email
            </Text>
            <TextInput
              mode="outlined"
              placeholder="Enter username or email"
              value={formData.username}
              onChangeText={text => handleInputChange('username', text)}
              style={[styles.textInput, { backgroundColor: theme.background }]}
              keyboardType="email-address"
              autoCapitalize="none"
              theme={{
                colors: {
                  primary: theme.primary,
                  text: theme.text,
                  placeholder: theme.textSecondary,
                  background: theme.background,
                  outline: theme.border,
                },
              }}
            />
          </View>

          {/* Password Input */}
          <View style={styles.fieldContainer}>
            <Text style={[styles.fieldLabel, { color: theme.text }]}>
              Password
            </Text>
            <TextInput
              mode="outlined"
              placeholder="Enter password"
              value={formData.password}
              onChangeText={text => handleInputChange('password', text)}
              secureTextEntry={!showPassword}
              style={[styles.textInput, { backgroundColor: theme.background }]}
              error={!!formErrors.password}
              right={
                <TextInput.Icon
                  icon={showPassword ? 'eye-off' : 'eye'}
                  onPress={() => setShowPassword(!showPassword)}
                  iconColor={theme.textSecondary}
                />
              }
              theme={{
                colors: {
                  primary: theme.primary,
                  error: theme.error,
                  text: theme.text,
                  placeholder: theme.textSecondary,
                  background: theme.background,
                  outline: theme.border,
                },
              }}
            />
            {formErrors.password && (
              <Text style={[styles.errorText, { color: theme.error }]}>
                {formErrors.password}
              </Text>
            )}

            {/* Generate Strong Password Link */}
            <TouchableOpacity
              style={styles.generateLinkContainer}
              onPress={handleGeneratePassword}
            >
              <Text
                style={[styles.generateLink, { color: theme.generateLink }]}
              >
                Generate Strong Password
              </Text>
            </TouchableOpacity>
          </View>

          {/* URL Input */}
          <View style={styles.fieldContainer}>
            <Text style={[styles.fieldLabel, { color: theme.text }]}>
              Website URL (Optional)
            </Text>
            <TextInput
              mode="outlined"
              placeholder="https://example.com"
              value={formData.url}
              onChangeText={text => handleInputChange('url', text)}
              style={[styles.textInput, { backgroundColor: theme.background }]}
              error={!!formErrors.url}
              keyboardType="url"
              autoCapitalize="none"
              theme={{
                colors: {
                  primary: theme.primary,
                  error: theme.error,
                  text: theme.text,
                  placeholder: theme.textSecondary,
                  background: theme.background,
                  outline: theme.border,
                },
              }}
            />
            {formErrors.url && (
              <Text style={[styles.errorText, { color: theme.error }]}>
                {formErrors.url}
              </Text>
            )}
          </View>

          {/* Notes Input */}
          <View style={styles.fieldContainer}>
            <Text style={[styles.fieldLabel, { color: theme.text }]}>
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
                { backgroundColor: theme.background },
              ]}
              multiline
              numberOfLines={4}
              theme={{
                colors: {
                  primary: theme.primary,
                  text: theme.text,
                  placeholder: theme.textSecondary,
                  background: theme.background,
                  outline: theme.border,
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
              <Icon
                name={formData.isFavorite ? 'star' : 'star-o'}
                size={20}
                color={
                  formData.isFavorite ? theme.primary : theme.textSecondary
                }
                solid={formData.isFavorite}
              />
              <Text style={[styles.favoriteLabel, { color: theme.text }]}>
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
