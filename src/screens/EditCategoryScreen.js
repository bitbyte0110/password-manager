import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Alert,
  ScrollView,
  BackHandler,
} from 'react-native';
import {
  TextInput,
  Button,
  ActivityIndicator,
  Snackbar,
} from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { useFocusEffect } from '@react-navigation/native';

import vaultService from '../services/vaultService';
import databaseService from '../services/databaseService';
import { useTheme } from '../contexts/ThemeContext';

// Constants for activity tracking
const LAST_ACTIVE_TIME_KEY = 'vault_lastActiveTime';

// Category icons and colors mapping (matching Create Category design)
const CATEGORY_ICONS = [
  'folder',
  'globe',
  'briefcase',
  'credit-card',
  'user',
  'lock',
];

const CATEGORY_COLORS = [
  '#8e44ad', // Purple
  '#3498db', // Blue
  '#e74c3c', // Red
  '#2ecc71', // Green
  '#f39c12', // Orange
  '#9b59b6', // Purple-2
  '#1abc9c', // Teal
  '#34495e', // Black
];

const EditCategoryScreen = ({ navigation, route }) => {
  // Get category data from navigation params
  const { categoryId, categoryData } = route.params;
  const { theme } = useTheme();

  // State management
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [category, setCategory] = useState(null);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    icon: 'folder',
    color: '#8e44ad',
  });

  const [formErrors, setFormErrors] = useState({});
  const [isFormValid, setIsFormValid] = useState(false);

  // Initialize screen and load category data
  useEffect(() => {
    initializeScreen();
  }, []);

  // Handle Android back button
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        handleClose();
        return true;
      };

      const subscription = BackHandler.addEventListener(
        'hardwareBackPress',
        onBackPress
      );
      return () => subscription.remove();
    }, [])
  );

  // Validate form when data changes
  useEffect(() => {
    validateForm();
  }, [formData]);

  const initializeScreen = async () => {
    try {
      setIsLoading(true);
      updateActivity();

      // Initialize vault service
      await vaultService.initialize();

      // Check if user is authenticated
      if (!vaultService.isUserAuthenticated()) {
        console.log('User not authenticated, redirecting to login');
        navigation.replace('Login');
        return;
      }

      // Load category data
      await loadCategoryData();
    } catch (error) {
      console.error('Error initializing EditCategoryScreen:', error);
      showSnackbar('Error loading category. Please try again.');
      navigation.goBack();
    } finally {
      setIsLoading(false);
    }
  };

  const updateActivity = async () => {
    try {
      const timestamp = Date.now().toString();
      await AsyncStorage.setItem(LAST_ACTIVE_TIME_KEY, timestamp);
    } catch (error) {
      console.error('Error updating activity timestamp:', error);
    }
  };

  const loadCategoryData = async () => {
    try {
      // If category data passed via params, use it
      if (categoryData) {
        setCategory(categoryData);
        setFormData({
          name: categoryData.name || '',
          description: categoryData.description || '',
          icon: categoryData.icon || 'folder',
          color: categoryData.color || '#8e44ad',
        });
      } else if (categoryId) {
        // Load from database using ID
        const categories = await vaultService.getCategories();
        const foundCategory = categories.find(cat => cat.id === categoryId);

        if (!foundCategory) {
          throw new Error('Category not found');
        }

        setCategory(foundCategory);
        setFormData({
          name: foundCategory.name || '',
          description: foundCategory.description || '',
          icon: foundCategory.icon || 'folder',
          color: foundCategory.color || '#8e44ad',
        });
      } else {
        throw new Error('No category ID or data provided');
      }
    } catch (error) {
      console.error('Error loading category data:', error);
      throw error;
    }
  };

  const validateForm = useCallback(() => {
    const errors = {};
    let isValid = true;

    // Validate category name
    if (!formData.name.trim()) {
      errors.name = 'Category name is required';
      isValid = false;
    } else if (formData.name.trim().length < 2) {
      errors.name = 'Category name must be at least 2 characters';
      isValid = false;
    } else if (formData.name.trim().length > 30) {
      errors.name = 'Category name must be less than 30 characters';
      isValid = false;
    }

    // Validate icon selection
    if (!formData.icon) {
      errors.icon = 'Icon selection is required';
      isValid = false;
    }

    // Validate color selection
    if (!formData.color) {
      errors.color = 'Color selection is required';
      isValid = false;
    }

    setFormErrors(errors);
    setIsFormValid(isValid);
  }, [formData]);

  const checkDuplicateName = async name => {
    try {
      const categories = await vaultService.getCategories();
      const duplicate = categories.find(
        cat =>
          cat.id !== category?.id &&
          cat.name.toLowerCase() === name.toLowerCase()
      );
      return !!duplicate;
    } catch (error) {
      console.error('Error checking duplicate name:', error);
      return false;
    }
  };

  const handleSave = async () => {
    if (!isFormValid || !category) return;

    try {
      setIsSaving(true);
      updateActivity();

      // Check for duplicate names
      const isDuplicate = await checkDuplicateName(formData.name.trim());
      if (isDuplicate) {
        setFormErrors(prev => ({
          ...prev,
          name: 'A category with this name already exists',
        }));
        return;
      }

      // Prepare updated category data
      const updatedCategory = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        icon: formData.icon,
        color: formData.color,
      };

      // Update category in database
      await databaseService.updateCategoryEntry(category.id, updatedCategory);

      showSnackbar('Category updated successfully');

      // Navigate back and refresh categories list
      setTimeout(() => {
        navigation.navigate('MainTabs', {
          screen: 'Categories',
          params: {
            refresh: true,
            updatedCategoryId: category.id,
          },
        });
      }, 1000);
    } catch (error) {
      console.error('Error updating category:', error);
      if (error.message.includes('already exists')) {
        setFormErrors(prev => ({
          ...prev,
          name: 'A category with this name already exists',
        }));
      } else {
        showSnackbar('Error updating category. Please try again.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!category) return;

    try {
      updateActivity();

      // Check if category has passwords
      if (category.password_count > 0) {
        Alert.alert(
          'Cannot Delete Category',
          `Cannot delete "${category.name}" because it contains ${category.password_count} password${category.password_count > 1 ? 's' : ''}. Please move or delete the passwords first.`,
          [{ text: 'OK' }]
        );
        return;
      }

      // All categories can be deleted - removed default category restriction

      // Show confirmation dialog
      Alert.alert(
        'Delete Category',
        `Are you sure you want to delete "${category.name}"? This action cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: confirmDelete,
          },
        ]
      );
    } catch (error) {
      console.error('Error in delete handler:', error);
      showSnackbar('Error processing delete request.');
    }
  };

  const confirmDelete = async () => {
    try {
      setIsSaving(true);

      // Delete category from database
      await databaseService.deleteCategoryEntry(category.id);

      showSnackbar('Category deleted successfully');

      // Navigate back and refresh categories list
      setTimeout(() => {
        navigation.navigate('MainTabs', {
          screen: 'Categories',
          params: {
            refresh: true,
            deletedCategoryId: category.id,
          },
        });
      }, 1000);
    } catch (error) {
      console.error('Error deleting category:', error);
      showSnackbar('Error deleting category. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    updateActivity();
    navigation.goBack();
  };

  const showSnackbar = message => {
    setSnackbar({ visible: true, message });
  };

  const renderIconSelection = () => (
    <View style={styles.iconColorSection}>
      <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
        Icon
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.iconGrid}>
          {CATEGORY_ICONS.map(iconName => (
            <TouchableOpacity
              key={iconName}
              style={[
                styles.iconOption,
                {
                  backgroundColor:
                    formData.icon === iconName
                      ? theme.colors.primary + '20'
                      : theme.colors.card,
                },
              ]}
              onPress={() => setFormData(prev => ({ ...prev, icon: iconName }))}
            >
              <Icon
                name={iconName}
                size={20}
                color={
                  formData.icon === iconName
                    ? theme.colors.primary
                    : theme.colors.textSecondary
                }
              />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );

  const renderColorSelection = () => (
    <View style={styles.iconColorSection}>
      <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
        Color
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.colorGrid}>
          {CATEGORY_COLORS.map(color => (
            <TouchableOpacity
              key={color}
              style={[
                styles.colorOption,
                { backgroundColor: color },
                formData.color === color && styles.selectedColor,
              ]}
              onPress={() => setFormData(prev => ({ ...prev, color }))}
            >
              {formData.color === color && (
                <Icon name="check" size={16} color="#fff" />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );

  const renderPreview = () => (
    <View style={styles.previewSection}>
      <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
        Preview
      </Text>
      <View
        style={[styles.categoryCard, { backgroundColor: theme.colors.card }]}
      >
        <View style={styles.categoryCardContent}>
          <View style={styles.categoryCardLeft}>
            <View
              style={[styles.categoryIcon, { backgroundColor: formData.color }]}
            >
              <Icon name={formData.icon} size={20} color="#fff" />
            </View>
            <View style={styles.categoryInfo}>
              <Text
                style={[styles.categoryName, { color: theme.colors.text }]}
                numberOfLines={1}
              >
                {formData.name || 'Category Name'}
              </Text>
              <Text
                style={[
                  styles.passwordCount,
                  { color: theme.colors.textSecondary },
                ]}
                numberOfLines={1}
              >
                {category?.password_count || 0} password
                {(category?.password_count || 0) !== 1 ? 's' : ''}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={[styles.loadingText, { color: theme.colors.text }]}>
            Loading category...
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
          onPress={handleClose}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Icon name="arrow-left" size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
          Edit Category
        </Text>
        <View style={styles.headerRight} />
      </View>

      {/* Form Content */}
      <ScrollView
        style={styles.formContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Category Name Input */}
        <TextInput
          label="Category Name"
          value={formData.name}
          onChangeText={text => setFormData(prev => ({ ...prev, name: text }))}
          style={[
            styles.formInput,
            { backgroundColor: theme.colors.inputBackground },
          ]}
          error={!!formErrors.name}
          mode="outlined"
          maxLength={30}
          theme={{
            colors: {
              primary: theme.colors.inputBorderFocused,
              accent: theme.colors.inputBorderFocused,
              text: theme.colors.inputText,
              background: theme.colors.inputBackground,
              outline: formErrors.name
                ? theme.colors.error
                : theme.colors.inputBorder,
              placeholder: theme.colors.inputPlaceholder,
              onSurfaceVariant: theme.colors.inputPlaceholder,
            },
          }}
          textColor={theme.colors.inputText}
          placeholderTextColor={theme.colors.inputPlaceholder}
        />
        {formErrors.name && (
          <Text style={[styles.errorText, { color: theme.colors.error }]}>
            {formErrors.name}
          </Text>
        )}

        {/* Description Input */}
        <TextInput
          label="Description (Optional)"
          value={formData.description}
          onChangeText={text =>
            setFormData(prev => ({ ...prev, description: text }))
          }
          style={[
            styles.formInput,
            { backgroundColor: theme.colors.inputBackground },
          ]}
          mode="outlined"
          multiline
          numberOfLines={3}
          theme={{
            colors: {
              primary: theme.colors.inputBorderFocused,
              accent: theme.colors.inputBorderFocused,
              text: theme.colors.inputText,
              background: theme.colors.inputBackground,
              outline: theme.colors.inputBorder,
              placeholder: theme.colors.inputPlaceholder,
              onSurfaceVariant: theme.colors.inputPlaceholder,
            },
          }}
          textColor={theme.colors.inputText}
          placeholderTextColor={theme.colors.inputPlaceholder}
        />

        {/* Icon Selection */}
        {renderIconSelection()}

        {/* Color Selection */}
        {renderColorSelection()}

        {/* Preview */}
        {renderPreview()}
      </ScrollView>

      {/* Action Buttons */}
      <View
        style={[
          styles.buttonContainer,
          { borderTopColor: theme.colors.border },
        ]}
      >
        <Button
          mode="outlined"
          onPress={handleDelete}
          style={[styles.deleteButton, { borderColor: theme.colors.error }]}
          textColor={theme.colors.error}
          disabled={isSaving}
        >
          Delete
        </Button>
        <Button
          mode="contained"
          onPress={handleSave}
          style={[styles.saveButton, { backgroundColor: theme.colors.primary }]}
          disabled={!isFormValid || isSaving}
          loading={isSaving}
        >
          Save Changes
        </Button>
      </View>

      {/* Snackbar */}
      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ visible: false, message: '' })}
        duration={3000}
        style={{ backgroundColor: theme.colors.card }}
      >
        <Text style={{ color: theme.colors.text }}>{snackbar.message}</Text>
      </Snackbar>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  // Header Styles
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    flex: 1,
  },
  headerRight: {
    width: 36,
  },
  formContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  formInput: {
    marginBottom: 16,
  },
  errorText: {
    fontSize: 12,
    marginTop: -12,
    marginBottom: 8,
    marginLeft: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  iconColorSection: {
    marginBottom: 24,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  iconOption: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  colorOption: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  selectedColor: {
    borderWidth: 3,
    borderColor: '#fff',
  },
  previewSection: {
    marginBottom: 20,
  },
  // Category Card Preview Styles (matching CategoriesScreen)
  categoryCard: {
    borderRadius: 12,
    elevation: 2,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  categoryCardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  categoryCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  categoryInfo: {
    flex: 1,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  passwordCount: {
    fontSize: 14,
  },
  // Button Styles
  buttonContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    gap: 12,
  },
  deleteButton: {
    flex: 1,
  },
  saveButton: {
    flex: 1,
  },
});

export default EditCategoryScreen;
