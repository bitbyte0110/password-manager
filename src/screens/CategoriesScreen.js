import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  useColorScheme,
  Alert,
  Modal,
  Dimensions,
  ScrollView,
} from 'react-native';
import {
  Searchbar,
  Menu,
  ActivityIndicator,
  Snackbar,
  TextInput,
  Button,
  Chip,
} from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/FontAwesome5';
// import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';

import vaultService from '../services/vaultService';
import databaseService from '../services/databaseService';

// Constants for activity tracking
const LAST_ACTIVE_TIME_KEY = 'vault_lastActiveTime';
const { height: screenHeight } = Dimensions.get('window');

// Category icons and colors mapping
const CATEGORY_ICONS = [
  'folder',
  'globe',
  'briefcase',
  'credit-card',
  'user',
  'shopping-bag',
  'envelope',
  'shield-alt',
  'key',
  'lock',
  'heart',
  'star',
  'bookmark',
  'home',
  'car',
  'plane',
  'gamepad',
  'music',
  'camera',
  'book',
];

const CATEGORY_COLORS = [
  '#8e44ad',
  '#3498db',
  '#e74c3c',
  '#2ecc71',
  '#f39c12',
  '#9b59b6',
  '#1abc9c',
  '#34495e',
  '#f1c40f',
  '#e67e22',
  '#95a5a6',
  '#16a085',
  '#27ae60',
  '#2980b9',
  '#e91e63',
  '#c0392b',
  '#d35400',
  '#7f8c8d',
];

const CategoriesScreen = ({ navigation, route }) => {
  // State management
  const [categories, setCategories] = useState([]);
  const [filteredCategories, setFilteredCategories] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name_asc');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [activeTab, setActiveTab] = useState('categories');
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });

  // Edit form state
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    icon: 'folder',
    color: '#8e44ad',
  });

  // Create form state
  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    icon: 'folder',
    color: '#8e44ad',
  });

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
    success: '#2ecc71',
    warning: '#f39c12',
  };

  // Initialize screen and load data
  useEffect(() => {
    initializeScreen();
  }, []);

  // Refresh data when screen gains focus
  useFocusEffect(
    useCallback(() => {
      loadCategories();

      // Check if we should show create modal (from navigation params)
      if (route?.params?.createNew) {
        setShowCreateModal(true);
        // Clear the parameter
        navigation.setParams({ createNew: undefined });
      }
    }, [route?.params?.createNew])
  );

  // Apply filters and sorting when data changes
  useEffect(() => {
    applyFiltersAndSort();
  }, [categories, searchQuery, activeFilter, sortBy]);

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

      // Load categories
      await loadCategories();
    } catch (error) {
      console.error('Error initializing CategoriesScreen:', error);
      showSnackbar('Error loading categories. Please try again.');
      // Navigate back if initialization fails
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

  const loadCategories = async () => {
    try {
      setIsRefreshing(true);
      const categoriesData = await vaultService.getCategories();
      setCategories(categoriesData);
    } catch (error) {
      console.error('Error loading categories:', error);
      showSnackbar('Error loading categories');
    } finally {
      setIsRefreshing(false);
    }
  };

  const applyFiltersAndSort = useCallback(() => {
    try {
      let filtered = [...categories];

      // Apply search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        filtered = filtered.filter(
          category =>
            category.name.toLowerCase().includes(query) ||
            (category.description &&
              category.description.toLowerCase().includes(query))
        );
      }

      // Apply category filter
      switch (activeFilter) {
        case 'with_passwords':
          filtered = filtered.filter(category => category.password_count > 0);
          break;
        case 'empty':
          filtered = filtered.filter(category => category.password_count === 0);
          break;
        case 'all':
        default:
          // Show all categories
          break;
      }

      // Apply sorting
      filtered = applySorting(filtered, sortBy);

      setFilteredCategories(filtered);
    } catch (error) {
      console.error('Error applying filters:', error);
    }
  }, [categories, searchQuery, activeFilter, sortBy]);

  const applySorting = (categoryList, sortOption) => {
    const sorted = [...categoryList];

    switch (sortOption) {
      case 'name_asc':
        return sorted.sort((a, b) => a.name.localeCompare(b.name));
      case 'name_desc':
        return sorted.sort((a, b) => b.name.localeCompare(a.name));
      case 'most_passwords':
        return sorted.sort((a, b) => b.password_count - a.password_count);
      case 'least_passwords':
        return sorted.sort((a, b) => a.password_count - b.password_count);
      default:
        return sorted;
    }
  };

  const handleSearchChange = query => {
    setSearchQuery(query);
    updateActivity();
  };

  const handleFilterChange = filter => {
    setActiveFilter(filter);
    updateActivity();
  };

  const handleSortChange = sort => {
    setSortBy(sort);
    setShowSortMenu(false);
    updateActivity();
  };

  const handleCategoryPress = category => {
    updateActivity();
    // Navigate to category password list or details
    // navigation.navigate('CategoryPasswords', { categoryId: category.id });
  };

  const handleMoreOptions = (category, event) => {
    event.stopPropagation();
    setSelectedCategory(category);
    setShowMoreMenu(true);
    updateActivity();
  };

  const handleEditCategory = () => {
    if (!selectedCategory) return;

    setEditForm({
      name: selectedCategory.name,
      description: selectedCategory.description || '',
      icon: selectedCategory.icon || 'folder',
      color: selectedCategory.color || '#8e44ad',
    });
    setFormErrors({});
    setShowMoreMenu(false);
    setShowEditModal(true);
    updateActivity();
  };

  const handleDeleteCategory = () => {
    if (!selectedCategory) return;

    setShowMoreMenu(false);

    if (selectedCategory.password_count > 0) {
      Alert.alert(
        'Cannot Delete Category',
        `Cannot delete "${selectedCategory.name}" because it contains ${selectedCategory.password_count} password${selectedCategory.password_count > 1 ? 's' : ''}. Please move or delete the passwords first.`,
        [{ text: 'OK' }]
      );
      return;
    }

    if (selectedCategory.is_default) {
      Alert.alert(
        'Cannot Delete Category',
        'Default categories cannot be deleted.',
        [{ text: 'OK' }]
      );
      return;
    }

    Alert.alert(
      'Delete Category',
      `Are you sure you want to delete "${selectedCategory.name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: confirmDeleteCategory,
        },
      ]
    );
  };

  const confirmDeleteCategory = async () => {
    if (!selectedCategory) return;

    try {
      await databaseService.deleteCategoryEntry(selectedCategory.id);
      showSnackbar('Category deleted successfully');
      await loadCategories();
    } catch (error) {
      console.error('Error deleting category:', error);
      showSnackbar('Error deleting category. Please try again.');
    }
  };

  const validateEditForm = () => {
    const errors = {};

    if (!editForm.name.trim()) {
      errors.name = 'Category name is required';
    } else if (editForm.name.trim().length < 2) {
      errors.name = 'Category name must be at least 2 characters';
    } else {
      // Check for duplicate names (excluding current category)
      const duplicate = categories.find(
        cat =>
          cat.id !== selectedCategory?.id &&
          cat.name.toLowerCase() === editForm.name.trim().toLowerCase()
      );
      if (duplicate) {
        errors.name = 'A category with this name already exists';
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveEdit = async () => {
    if (!validateEditForm() || !selectedCategory) return;

    try {
      const updatedCategory = {
        name: editForm.name.trim(),
        description: editForm.description.trim(),
        icon: editForm.icon,
        color: editForm.color,
      };

      await databaseService.updateCategoryEntry(
        selectedCategory.id,
        updatedCategory
      );
      showSnackbar('Category updated successfully');
      setShowEditModal(false);
      await loadCategories();
    } catch (error) {
      console.error('Error updating category:', error);
      showSnackbar('Error updating category. Please try again.');
    }
  };

  const handleCreateCategory = () => {
    setCreateForm({
      name: '',
      description: '',
      icon: 'folder',
      color: '#8e44ad',
    });
    setFormErrors({});
    setShowCreateModal(true);
    updateActivity();
  };

  const validateCreateForm = () => {
    const errors = {};

    if (!createForm.name.trim()) {
      errors.name = 'Category name is required';
    } else if (createForm.name.trim().length < 2) {
      errors.name = 'Category name must be at least 2 characters';
    } else {
      // Check for duplicate names
      const duplicate = categories.find(
        cat => cat.name.toLowerCase() === createForm.name.trim().toLowerCase()
      );
      if (duplicate) {
        errors.name = 'A category with this name already exists';
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveCreate = async () => {
    if (!validateCreateForm()) return;

    try {
      const newCategory = {
        name: createForm.name.trim(),
        description: createForm.description.trim(),
        icon: createForm.icon,
        color: createForm.color,
      };

      await databaseService.createCategory(newCategory);
      showSnackbar('Category created successfully');
      setShowCreateModal(false);
      await loadCategories();

      // If coming from AddPasswordScreen, navigate back
      if (route?.params?.returnScreen) {
        navigation.navigate(route.params.returnScreen, {
          shouldRefreshCategories: true,
        });
      }
    } catch (error) {
      console.error('Error creating category:', error);
      if (error.message.includes('UNIQUE constraint failed')) {
        setFormErrors({ name: 'A category with this name already exists' });
      } else {
        showSnackbar('Error creating category. Please try again.');
      }
    }
  };

  const handleTabPress = tab => {
    setActiveTab(tab);
    updateActivity();

    switch (tab) {
      case 'vault':
        navigation.navigate('MyVault');
        break;
      case 'generator':
        navigation.navigate('PasswordGenerator');
        break;
      case 'categories':
        // Already on categories screen
        break;
      case 'settings':
        // navigation.navigate('Settings');
        break;
      default:
        break;
    }
  };

  const showSnackbar = message => {
    setSnackbar({ visible: true, message });
  };

  const renderCategoryCard = ({ item }) => (
    <TouchableOpacity
      style={[styles.categoryCard, { backgroundColor: theme.surface }]}
      onPress={() => handleCategoryPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.categoryCardContent}>
        <View style={styles.categoryCardLeft}>
          <View
            style={[
              styles.categoryIcon,
              { backgroundColor: item.color || theme.primary },
            ]}
          >
            <Icon name={item.icon || 'folder'} size={20} color="#fff" />
          </View>
          <View style={styles.categoryInfo}>
            <Text
              style={[styles.categoryName, { color: theme.text }]}
              numberOfLines={1}
            >
              {item.name}
            </Text>
            <Text
              style={[styles.passwordCount, { color: theme.textSecondary }]}
              numberOfLines={1}
            >
              {item.password_count || 0} password
              {(item.password_count || 0) !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.moreButton}
          onPress={event => handleMoreOptions(item, event)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Icon name="ellipsis-v" size={16} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Icon name="folder-open" size={64} color={theme.textSecondary} />
      <Text style={[styles.emptyStateTitle, { color: theme.text }]}>
        No categories found
      </Text>
      <Text style={[styles.emptyStateSubtitle, { color: theme.textSecondary }]}>
        {searchQuery.trim()
          ? 'Try adjusting your search or filters'
          : 'Tap + to create your first category'}
      </Text>
    </View>
  );

  const renderFilterChips = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.filterChipsContainer}
      contentContainerStyle={styles.filterChipsContent}
    >
      {[
        { key: 'all', label: 'All Categories', count: categories.length },
        {
          key: 'with_passwords',
          label: 'With Passwords',
          count: categories.filter(c => c.password_count > 0).length,
        },
        {
          key: 'empty',
          label: 'Empty',
          count: categories.filter(c => c.password_count === 0).length,
        },
      ].map(filter => (
        <Chip
          key={filter.key}
          mode={activeFilter === filter.key ? 'flat' : 'outlined'}
          selected={activeFilter === filter.key}
          onPress={() => handleFilterChange(filter.key)}
          style={[
            styles.filterChip,
            activeFilter === filter.key && {
              backgroundColor: theme.primary + '20',
            },
          ]}
          textStyle={{
            color:
              activeFilter === filter.key ? theme.primary : theme.textSecondary,
            fontSize: 14,
          }}
        >
          {filter.label} ({filter.count})
        </Chip>
      ))}
    </ScrollView>
  );

  const renderEditModal = () => (
    <Modal
      visible={showEditModal}
      transparent={true}
      animationType="slide"
      onRequestClose={() => setShowEditModal(false)}
    >
      <View style={styles.modalContainer}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowEditModal(false)}
        />
        <View
          style={[
            styles.editModalContent,
            { backgroundColor: theme.background },
          ]}
        >
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              Edit Category
            </Text>
            <TouchableOpacity onPress={() => setShowEditModal(false)}>
              <Icon name="times" size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.editForm}
            showsVerticalScrollIndicator={false}
          >
            <TextInput
              label="Category Name"
              value={editForm.name}
              onChangeText={text =>
                setEditForm(prev => ({ ...prev, name: text }))
              }
              style={styles.formInput}
              error={!!formErrors.name}
              mode="outlined"
              theme={{ colors: { primary: theme.primary } }}
            />
            {formErrors.name && (
              <Text style={[styles.errorText, { color: theme.error }]}>
                {formErrors.name}
              </Text>
            )}

            <TextInput
              label="Description (Optional)"
              value={editForm.description}
              onChangeText={text =>
                setEditForm(prev => ({ ...prev, description: text }))
              }
              style={styles.formInput}
              mode="outlined"
              multiline
              numberOfLines={3}
              theme={{ colors: { primary: theme.primary } }}
            />

            <View style={styles.iconColorSection}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
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
                            editForm.icon === iconName
                              ? theme.primary + '20'
                              : theme.surface,
                        },
                      ]}
                      onPress={() =>
                        setEditForm(prev => ({ ...prev, icon: iconName }))
                      }
                    >
                      <Icon
                        name={iconName}
                        size={20}
                        color={
                          editForm.icon === iconName
                            ? theme.primary
                            : theme.textSecondary
                        }
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            <View style={styles.iconColorSection}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
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
                        editForm.color === color && styles.selectedColor,
                      ]}
                      onPress={() => setEditForm(prev => ({ ...prev, color }))}
                    >
                      {editForm.color === color && (
                        <Icon name="check" size={16} color="#fff" />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            <View style={styles.previewSection}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                Preview
              </Text>
              <View
                style={[
                  styles.categoryCard,
                  { backgroundColor: theme.surface },
                ]}
              >
                <View style={styles.categoryCardContent}>
                  <View style={styles.categoryCardLeft}>
                    <View
                      style={[
                        styles.categoryIcon,
                        { backgroundColor: editForm.color },
                      ]}
                    >
                      <Icon name={editForm.icon} size={20} color="#fff" />
                    </View>
                    <View style={styles.categoryInfo}>
                      <Text
                        style={[styles.categoryName, { color: theme.text }]}
                        numberOfLines={1}
                      >
                        {editForm.name || 'Category Name'}
                      </Text>
                      <Text
                        style={[
                          styles.passwordCount,
                          { color: theme.textSecondary },
                        ]}
                        numberOfLines={1}
                      >
                        {selectedCategory?.password_count || 0} password
                        {(selectedCategory?.password_count || 0) !== 1
                          ? 's'
                          : ''}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </ScrollView>

          <View style={styles.modalButtons}>
            <Button
              mode="outlined"
              onPress={() => setShowEditModal(false)}
              style={[styles.modalButton, { borderColor: theme.border }]}
              textColor={theme.textSecondary}
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={handleSaveEdit}
              style={[styles.modalButton, { backgroundColor: theme.primary }]}
            >
              Save Changes
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderCreateModal = () => (
    <Modal
      visible={showCreateModal}
      transparent={true}
      animationType="slide"
      onRequestClose={() => setShowCreateModal(false)}
    >
      <View style={styles.modalContainer}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowCreateModal(false)}
        />
        <View
          style={[
            styles.editModalContent,
            { backgroundColor: theme.background },
          ]}
        >
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              Create Category
            </Text>
            <TouchableOpacity onPress={() => setShowCreateModal(false)}>
              <Icon name="times" size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.editForm}
            showsVerticalScrollIndicator={false}
          >
            <TextInput
              label="Category Name"
              value={createForm.name}
              onChangeText={text =>
                setCreateForm(prev => ({ ...prev, name: text }))
              }
              style={styles.formInput}
              error={!!formErrors.name}
              mode="outlined"
              theme={{ colors: { primary: theme.primary } }}
            />
            {formErrors.name && (
              <Text style={[styles.errorText, { color: theme.error }]}>
                {formErrors.name}
              </Text>
            )}

            <TextInput
              label="Description (Optional)"
              value={createForm.description}
              onChangeText={text =>
                setCreateForm(prev => ({ ...prev, description: text }))
              }
              style={styles.formInput}
              mode="outlined"
              multiline
              numberOfLines={3}
              theme={{ colors: { primary: theme.primary } }}
            />

            <View style={styles.iconColorSection}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
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
                            createForm.icon === iconName
                              ? theme.primary + '20'
                              : theme.surface,
                        },
                      ]}
                      onPress={() =>
                        setCreateForm(prev => ({ ...prev, icon: iconName }))
                      }
                    >
                      <Icon
                        name={iconName}
                        size={20}
                        color={
                          createForm.icon === iconName
                            ? theme.primary
                            : theme.textSecondary
                        }
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            <View style={styles.iconColorSection}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
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
                        createForm.color === color && styles.selectedColor,
                      ]}
                      onPress={() =>
                        setCreateForm(prev => ({ ...prev, color }))
                      }
                    >
                      {createForm.color === color && (
                        <Icon name="check" size={16} color="#fff" />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            <View style={styles.previewSection}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                Preview
              </Text>
              <View
                style={[
                  styles.categoryCard,
                  { backgroundColor: theme.surface },
                ]}
              >
                <View style={styles.categoryCardContent}>
                  <View style={styles.categoryCardLeft}>
                    <View
                      style={[
                        styles.categoryIcon,
                        { backgroundColor: createForm.color },
                      ]}
                    >
                      <Icon name={createForm.icon} size={20} color="#fff" />
                    </View>
                    <View style={styles.categoryInfo}>
                      <Text
                        style={[styles.categoryName, { color: theme.text }]}
                        numberOfLines={1}
                      >
                        {createForm.name || 'Category Name'}
                      </Text>
                      <Text
                        style={[
                          styles.passwordCount,
                          { color: theme.textSecondary },
                        ]}
                        numberOfLines={1}
                      >
                        0 passwords
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </ScrollView>

          <View style={styles.modalButtons}>
            <Button
              mode="outlined"
              onPress={() => setShowCreateModal(false)}
              style={[styles.modalButton, { borderColor: theme.border }]}
              textColor={theme.textSecondary}
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={handleSaveCreate}
              style={[styles.modalButton, { backgroundColor: theme.primary }]}
            >
              Create Category
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );

  if (isLoading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.background }]}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.text }]}>
            Loading categories...
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
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          Categories
        </Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search categories..."
          onChangeText={handleSearchChange}
          value={searchQuery}
          style={[styles.searchBar, { backgroundColor: theme.surface }]}
          inputStyle={{ color: theme.text }}
          iconColor={theme.textSecondary}
        />
      </View>

      {/* Filter Chips */}
      {renderFilterChips()}

      {/* Sort Controls */}
      <View style={styles.sortContainer}>
        <Menu
          visible={showSortMenu}
          onDismiss={() => setShowSortMenu(false)}
          anchor={
            <TouchableOpacity
              style={[styles.sortButton, { backgroundColor: theme.surface }]}
              onPress={() => setShowSortMenu(true)}
            >
              <Icon name="sort" size={16} color={theme.textSecondary} />
              <Text
                style={[styles.sortButtonText, { color: theme.textSecondary }]}
              >
                {sortBy === 'name_asc'
                  ? 'A–Z'
                  : sortBy === 'name_desc'
                    ? 'Z–A'
                    : sortBy === 'most_passwords'
                      ? 'Most Passwords'
                      : 'Least Passwords'}
              </Text>
              <Icon name="chevron-down" size={12} color={theme.textSecondary} />
            </TouchableOpacity>
          }
        >
          <Menu.Item onPress={() => handleSortChange('name_asc')} title="A–Z" />
          <Menu.Item
            onPress={() => handleSortChange('name_desc')}
            title="Z–A"
          />
          <Menu.Item
            onPress={() => handleSortChange('most_passwords')}
            title="Most Passwords"
          />
          <Menu.Item
            onPress={() => handleSortChange('least_passwords')}
            title="Least Passwords"
          />
        </Menu>
      </View>

      {/* Categories List */}
      <FlatList
        data={filteredCategories}
        renderItem={renderCategoryCard}
        keyExtractor={item => item.id.toString()}
        style={styles.categoriesList}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmptyState}
        refreshing={isRefreshing}
        onRefresh={loadCategories}
        contentContainerStyle={
          filteredCategories.length === 0
            ? styles.emptyListContainer
            : { paddingTop: 4 }
        }
      />

      {/* Floating Action Button */}
      <View style={styles.fabContainer}>
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: theme.primary }]}
          onPress={handleCreateCategory}
        >
          <Icon name="plus" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Bottom Navigation */}
      <View
        style={[
          styles.bottomNav,
          { backgroundColor: theme.background, borderTopColor: theme.border },
        ]}
      >
        {[
          { key: 'vault', icon: 'shield-alt', label: 'My Vault' },
          { key: 'generator', icon: 'key', label: 'Generator' },
          { key: 'categories', icon: 'folder', label: 'Categories' },
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

      {/* More Options Menu */}
      <Menu
        visible={showMoreMenu}
        onDismiss={() => setShowMoreMenu(false)}
        anchor={<View />}
        style={styles.moreMenu}
      >
        <Menu.Item
          onPress={handleEditCategory}
          title="Edit Category"
          leadingIcon="pencil"
        />
        <Menu.Item
          onPress={handleDeleteCategory}
          title="Delete Category"
          leadingIcon="trash"
          titleStyle={{ color: theme.error }}
        />
      </Menu>

      {/* Edit Modal */}
      {renderEditModal()}

      {/* Create Modal */}
      {renderCreateModal()}

      {/* Snackbar */}
      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ visible: false, message: '' })}
        duration={3000}
        style={{ backgroundColor: theme.surface }}
      >
        <Text style={{ color: theme.text }}>{snackbar.message}</Text>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  searchBar: {
    elevation: 0,
    shadowOpacity: 0,
    borderRadius: 8,
    height: 50,
  },
  filterChipsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 2,
  },
  filterChipsContent: {
    paddingRight: 16,
  },
  filterChip: {
    marginRight: 8,
    height: 32,
  },
  sortContainer: {
    paddingHorizontal: 16,
    paddingVertical: 2,
    paddingBottom: 8,
    alignItems: 'flex-end',
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  sortButtonText: {
    fontSize: 14,
  },
  categoriesList: {
    flex: 1,
    paddingHorizontal: 0,
  },
  emptyListContainer: {
    paddingTop: 20,
  },
  categoryCard: {
    borderRadius: 12,
    marginVertical: 4,
    marginHorizontal: 16,
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
  moreButton: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 44,
    minHeight: 44,
  },
  emptyState: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateSubtitle: {
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  fabContainer: {
    position: 'absolute',
    bottom: 150,
    right: 20,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
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
  moreMenu: {
    marginTop: 50,
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  editModalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: screenHeight * 0.8,
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  editForm: {
    paddingHorizontal: 20,
    paddingVertical: 16,
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
  modalButtons: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 12,
  },
  modalButton: {
    flex: 1,
  },
});

export default CategoriesScreen;
