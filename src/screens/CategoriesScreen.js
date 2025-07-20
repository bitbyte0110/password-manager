import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  Alert,
  Modal,
  Dimensions,
} from 'react-native';
import { Searchbar, Badge, Menu, ActivityIndicator } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { useFocusEffect } from '@react-navigation/native';

import vaultService from '../services/vaultService';
import databaseService from '../services/databaseService';
import FABActionMenu from '../components/FABActionMenu';
import { useTheme } from '../contexts/ThemeContext';

// Constants for activity tracking
const LAST_ACTIVE_TIME_KEY = 'vault_lastActiveTime';
const { height: screenHeight } = Dimensions.get('window');

const CategoriesScreen = ({ navigation, route }) => {
  // State management
  const { theme } = useTheme();
  const [categories, setCategories] = useState([]);
  const [filteredCategories, setFilteredCategories] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name_asc');
  const [recentSearches, setRecentSearches] = useState([]);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [menuVisible, setMenuVisible] = useState({});
  const [selectedCategory, setSelectedCategory] = useState(null);

  useEffect(() => {
    initializeCategories();
  }, []);

  useEffect(() => {
    applyFiltersAndSort();
  }, [categories, searchQuery, selectedFilter, sortBy]);

  // Refresh data when screen gains focus
  useFocusEffect(
    useCallback(() => {
      loadCategories();

      // Handle refresh from AddCategoryScreen or EditCategoryScreen
      if (route?.params?.refresh) {
        loadCategories();
        // Clear the parameter
        navigation.setParams({ refresh: undefined });
      }
    }, [route?.params?.refresh])
  );

  const initializeCategories = async () => {
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

      // Load data
      await Promise.all([
        loadCategories(),
        loadRecentSearches(),
        updateActivity(),
      ]);
    } catch (error) {
      console.error('Error initializing categories:', error);

      if (
        error.message.includes('not authenticated') ||
        error.message.includes('master password') ||
        error.message.includes('session')
      ) {
        console.log(
          'Authentication error during initialization, redirecting to login'
        );
        Alert.alert(
          'Session Expired',
          'Your session has expired. Please log in again.',
          [{ text: 'OK', onPress: () => navigation.replace('Login') }]
        );
      } else {
        Alert.alert(
          'Error',
          'Failed to load categories data. Please try again.'
        );
        navigation.goBack();
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      setIsRefreshing(true);
      const categoriesData = await vaultService.getCategories();
      setCategories(categoriesData);
    } catch (error) {
      console.error('Error loading categories:', error);
      Alert.alert('Error', 'Failed to load categories');
    } finally {
      setIsRefreshing(false);
    }
  };

  const loadRecentSearches = async () => {
    try {
      const searches = await AsyncStorage.getItem('categories_recentSearches');
      if (searches) {
        setRecentSearches(JSON.parse(searches));
      }
    } catch (error) {
      console.error('Error loading recent searches:', error);
    }
  };

  const updateActivity = async () => {
    try {
      const timestamp = Date.now().toString();
      await AsyncStorage.setItem(LAST_ACTIVE_TIME_KEY, timestamp);
    } catch (error) {
      console.error('Error updating activity:', error);
    }
  };

  const applyFiltersAndSort = useCallback(async () => {
    try {
      let filtered = [...categories];

      // Apply search filter first if there's a search query
      if (searchQuery.trim()) {
        await saveRecentSearch(searchQuery.trim());
        const query = searchQuery.toLowerCase().trim();
        filtered = filtered.filter(
          category =>
            category.name.toLowerCase().includes(query) ||
            (category.description &&
              category.description.toLowerCase().includes(query))
        );
      } else {
        // Apply category filter when no search query
        switch (selectedFilter) {
          case 'with_passwords':
            filtered = filtered.filter(category => category.password_count > 0);
            break;
          case 'empty':
            filtered = filtered.filter(
              category => category.password_count === 0
            );
            break;
          case 'all':
          default:
            // Show all categories
            break;
        }
      }

      // Apply sorting
      filtered = applySorting(filtered, sortBy);

      setFilteredCategories(filtered);
    } catch (error) {
      console.error('Error applying filters:', error);
    }
  }, [categories, searchQuery, selectedFilter, sortBy]);

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

  const saveRecentSearch = async query => {
    try {
      const updated = [query, ...recentSearches.filter(s => s !== query)].slice(
        0,
        3
      );
      setRecentSearches(updated);
      await AsyncStorage.setItem(
        'categories_recentSearches',
        JSON.stringify(updated)
      );
    } catch (error) {
      console.error('Error saving recent search:', error);
    }
  };

  const handleSearchChange = query => {
    setSearchQuery(query);
    updateActivity();
  };

  const handleSort = sortType => {
    setSortBy(sortType);
    setShowSortMenu(false);
    updateActivity();
  };

  const handleCategoryPress = category => {
    updateActivity();
    // Navigate to category details screen
    navigation.navigate('CategoryDetails', {
      categoryId: category.id,
      categoryName: category.name,
      categoryColor: category.color,
      categoryIcon: category.icon,
    });
  };

  const handleMoreOptions = (category, event) => {
    event.stopPropagation();
    setSelectedCategory(category);
    setMenuVisible({ [category.id]: true });
    updateActivity();
  };

  const handleEditCategory = () => {
    if (!selectedCategory) return;

    setMenuVisible({});
    updateActivity();

    // Navigate to EditCategoryScreen with category data
    navigation.navigate('EditCategory', {
      categoryId: selectedCategory.id,
      categoryData: selectedCategory,
    });
  };

  const handleDeleteCategory = () => {
    if (!selectedCategory) return;

    setMenuVisible({});

    if (selectedCategory.password_count > 0) {
      Alert.alert(
        'Cannot Delete Category',
        `Cannot delete "${selectedCategory.name}" because it contains ${selectedCategory.password_count} password${selectedCategory.password_count > 1 ? 's' : ''}. Please move or delete the passwords first.`,
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
      await loadCategories();
    } catch (error) {
      console.error('Error deleting category:', error);
      Alert.alert('Error', 'Failed to delete category. Please try again.');
    }
  };

  const handleAddCategory = () => {
    setShowAddModal(false);
    updateActivity();
    navigation.navigate('AddCategory');
  };

  const renderCategoryCard = ({ item }) => {
    const displayTitle = item.name || 'No Title';
    const displaySubtitle = `${item.password_count || 0} password${(item.password_count || 0) !== 1 ? 's' : ''}`;

    return (
      <TouchableOpacity
        style={[styles.categoryCard, { backgroundColor: theme.colors.surface }]}
        onPress={() => handleCategoryPress(item)}
      >
        <View style={styles.categoryCardContent}>
          <View style={styles.categoryCardLeft}>
            <View
              style={[
                styles.categoryIcon,
                { backgroundColor: item.color || theme.colors.primary },
              ]}
            >
              <Icon name={item.icon || 'folder'} size={16} color="#fff" />
            </View>
            <View style={styles.categoryInfo}>
              <Text
                style={[styles.categoryTitle, { color: theme.colors.text }]}
                numberOfLines={1}
              >
                {displayTitle}
              </Text>
              <Text
                style={[
                  styles.categorySubtitle,
                  { color: theme.colors.textSecondary },
                ]}
                numberOfLines={1}
              >
                {displaySubtitle}
              </Text>
            </View>
          </View>
          <View style={styles.categoryCardRight}>
            <Menu
              visible={menuVisible[item.id] || false}
              onDismiss={() => setMenuVisible({})}
              anchor={
                <TouchableOpacity
                  style={styles.moreButton}
                  onPress={event => handleMoreOptions(item, event)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Icon
                    name="ellipsis-v"
                    size={16}
                    color={theme.colors.textSecondary}
                  />
                </TouchableOpacity>
              }
              contentStyle={[
                styles.menuContent,
                { backgroundColor: theme.colors.surface },
              ]}
            >
              <Menu.Item
                onPress={handleEditCategory}
                title="Edit Category"
                leadingIcon="pencil"
                titleStyle={{ color: theme.colors.text }}
              />
              <Menu.Item
                onPress={handleDeleteCategory}
                title="Delete Category"
                leadingIcon="trash"
                titleStyle={{ color: theme.colors.error }}
              />
            </Menu>
            <Icon
              name="chevron-right"
              size={16}
              color={theme.colors.textSecondary}
            />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Icon name="folder-open" size={64} color={theme.colors.textSecondary} />
      <Text style={[styles.emptyStateTitle, { color: theme.colors.text }]}>
        No categories found
      </Text>
      <Text
        style={[
          styles.emptyStateSubtitle,
          { color: theme.colors.textSecondary },
        ]}
      >
        {searchQuery.trim()
          ? 'Try adjusting your search or filters'
          : 'Tap the + button to create your first category'}
      </Text>
    </View>
  );

  const renderFilterModal = () => (
    <Modal
      visible={showFilterModal}
      transparent={true}
      animationType="slide"
      onRequestClose={() => setShowFilterModal(false)}
    >
      <View style={styles.modalContainer}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowFilterModal(false)}
        />
        <View
          style={[
            styles.filterModalContent,
            { backgroundColor: theme.colors.background },
          ]}
        >
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
              Filter by
            </Text>
            <TouchableOpacity onPress={() => setShowFilterModal(false)}>
              <Icon name="times" size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[
              styles.filterOption,
              selectedFilter === 'all' && {
                backgroundColor: theme.colors.primary + '20',
              },
            ]}
            onPress={() => {
              setSelectedFilter('all');
              setShowFilterModal(false);
            }}
          >
            <Icon
              name="list"
              size={20}
              color={
                selectedFilter === 'all'
                  ? theme.colors.primary
                  : theme.colors.textSecondary
              }
            />
            <Text
              style={[
                styles.filterOptionText,
                {
                  color:
                    selectedFilter === 'all'
                      ? theme.colors.primary
                      : theme.colors.text,
                },
              ]}
            >
              All Categories
            </Text>
            <Text
              style={[
                styles.filterCount,
                { color: theme.colors.textSecondary },
              ]}
            >
              {categories.length}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterOption,
              selectedFilter === 'with_passwords' && {
                backgroundColor: theme.colors.primary + '20',
              },
            ]}
            onPress={() => {
              setSelectedFilter('with_passwords');
              setShowFilterModal(false);
            }}
          >
            <Icon
              name="folder"
              size={20}
              color={
                selectedFilter === 'with_passwords'
                  ? theme.colors.primary
                  : theme.colors.textSecondary
              }
            />
            <Text
              style={[
                styles.filterOptionText,
                {
                  color:
                    selectedFilter === 'with_passwords'
                      ? theme.colors.primary
                      : theme.colors.text,
                },
              ]}
            >
              With Passwords
            </Text>
            <Text
              style={[
                styles.filterCount,
                { color: theme.colors.textSecondary },
              ]}
            >
              {categories.filter(c => c.password_count > 0).length}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterOption,
              selectedFilter === 'empty' && {
                backgroundColor: theme.colors.primary + '20',
              },
            ]}
            onPress={() => {
              setSelectedFilter('empty');
              setShowFilterModal(false);
            }}
          >
            <Icon
              name="folder-open"
              size={20}
              color={
                selectedFilter === 'empty'
                  ? theme.colors.primary
                  : theme.colors.textSecondary
              }
            />
            <Text
              style={[
                styles.filterOptionText,
                {
                  color:
                    selectedFilter === 'empty'
                      ? theme.colors.primary
                      : theme.colors.text,
                },
              ]}
            >
              Empty Categories
            </Text>
            <Text
              style={[
                styles.filterCount,
                { color: theme.colors.textSecondary },
              ]}
            >
              {categories.filter(c => c.password_count === 0).length}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const renderAddModal = () => (
    <FABActionMenu
      visible={showAddModal}
      onClose={() => setShowAddModal(false)}
      navigation={navigation}
      onAddCategory={handleAddCategory}
    />
  );

  if (isLoading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={[styles.loadingText, { color: theme.colors.text }]}>
            Loading categories...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {/* Header with Title and Category Count */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.colors.background,
            borderBottomColor: theme.colors.border,
          },
        ]}
      >
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}
        >
          <Text
            style={[
              styles.headerTitle,
              { color: theme.colors.text, fontSize: 20, fontWeight: '600' },
            ]}
          >
            Categories
          </Text>
          {/* Keep the badge right-aligned, visually similar to MyVaultScreen */}
          <View style={{ position: 'absolute', right: 0 }}>
            <Badge
              style={[
                styles.categoryCount,
                { backgroundColor: theme.colors.primary },
              ]}
            >
              {categories.length}
            </Badge>
          </View>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search categories..."
          onChangeText={handleSearchChange}
          value={searchQuery}
          style={[styles.searchBar, { backgroundColor: theme.colors.surface }]}
          inputStyle={{ color: theme.colors.text }}
          iconColor={theme.colors.textSecondary}
        />
      </View>

      {/* Filter Button */}
      <View style={styles.filterButtonContainer}>
        <TouchableOpacity
          style={[
            styles.filterButton,
            { backgroundColor: theme.colors.surface },
          ]}
          onPress={() => setShowFilterModal(true)}
        >
          <Icon name="sliders-h" size={16} color={theme.colors.textSecondary} />
          <Text
            style={[
              styles.filterButtonText,
              { color: theme.colors.textSecondary },
            ]}
          >
            {selectedFilter === 'all'
              ? 'All Categories'
              : selectedFilter === 'with_passwords'
                ? 'With Passwords'
                : 'Empty Categories'}
          </Text>
          <Icon
            name="chevron-down"
            size={12}
            color={theme.colors.textSecondary}
          />
        </TouchableOpacity>

        {/* Sort Menu */}
        <Menu
          visible={showSortMenu}
          onDismiss={() => setShowSortMenu(false)}
          anchor={
            <TouchableOpacity
              style={[
                styles.sortButton,
                { backgroundColor: theme.colors.surface },
              ]}
              onPress={() => setShowSortMenu(true)}
            >
              <Icon name="sort" size={16} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          }
        >
          <Menu.Item onPress={() => handleSort('name_asc')} title="A-Z" />
          <Menu.Item onPress={() => handleSort('name_desc')} title="Z-A" />
          <Menu.Item
            onPress={() => handleSort('most_passwords')}
            title="Most Passwords"
          />
          <Menu.Item
            onPress={() => handleSort('least_passwords')}
            title="Least Passwords"
          />
        </Menu>
      </View>

      {/* Categories List */}
      <FlatList
        data={filteredCategories}
        renderItem={renderCategoryCard}
        keyExtractor={item => item.id.toString()}
        style={styles.categoryList}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmptyState}
        refreshing={isRefreshing}
        onRefresh={loadCategories}
      />

      {/* Floating Action Button */}
      <View style={styles.fabContainer}>
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: theme.colors.primary }]}
          onPress={() => setShowAddModal(true)}
        >
          <Icon name="plus" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Modals */}
      {renderFilterModal()}
      {renderAddModal()}
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
    paddingTop: 40,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  categoryCount: {
    fontSize: 12,
  },
  searchContainer: {
    paddingHorizontal: 0,
    paddingVertical: 10,
  },
  searchBar: {
    elevation: 0,
    shadowOpacity: 0,
    borderRadius: 8,
    height: 50,
  },
  filterButtonContainer: {
    flexDirection: 'row',
    paddingHorizontal: 0,
    paddingVertical: 8,
    gap: 8,
  },
  filterButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  filterButtonText: {
    flex: 1,
    fontSize: 14,
  },
  sortButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  categoryList: {
    flex: 1,
    paddingHorizontal: 0,
  },
  categoryCard: {
    borderRadius: 12,
    marginVertical: 4,
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
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  categoryInfo: {
    flex: 1,
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  categorySubtitle: {
    fontSize: 14,
  },
  categoryCardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  moreButton: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 24,
    minHeight: 24,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
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
  },
  fabContainer: {
    position: 'absolute',
    bottom: 100,
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
  menuContent: {
    borderRadius: 8,
    elevation: 4,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
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
  filterModalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: screenHeight * 0.6,
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
  filterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
  },
  filterOptionText: {
    flex: 1,
    fontSize: 16,
  },
  filterCount: {
    fontSize: 14,
  },
});

export default CategoriesScreen;
