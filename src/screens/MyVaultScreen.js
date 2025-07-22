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
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { useFocusEffect } from '@react-navigation/native';

import vaultService from '../services/vaultService';
import FABActionMenu from '../components/FABActionMenu';
import { usePasswords } from '../PasswordContext';
import { useTheme } from '../contexts/ThemeContext';

// Constants for activity tracking
const LAST_ACTIVE_TIME_KEY = 'vault_lastActiveTime';
const { height: screenHeight } = Dimensions.get('window');

const MyVaultScreen = ({ navigation, route }) => {
  // State management
  const { passwords, loading, error, loadPasswords, deletePassword } =
    usePasswords();
  const { theme } = useTheme();
  const [categories, setCategories] = useState([]);
  const [filteredPasswords, setFilteredPasswords] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('recently_used');
  const [recentSearches, setRecentSearches] = useState([]);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    initializeVault();
  }, []);

  useEffect(() => {
    applyFiltersAndSort();
  }, [passwords, searchQuery, selectedCategory, sortBy]);

  // Refresh data when screen gains focus (e.g., returning from AddPasswordScreen)
  useFocusEffect(
    useCallback(() => {
      // Always refresh categories when screen gains focus to ensure counts are up-to-date
      loadCategories();

      // Check if we should also refresh passwords (from navigation params)
      if (route?.params?.shouldRefresh) {
        console.log('MyVaultScreen: Refreshing data due to navigation params');
        loadPasswords();
        // Clear the parameter
        navigation.setParams({ shouldRefresh: undefined });
      }
    }, [route?.params?.shouldRefresh])
  );

  const initializeVault = async () => {
    try {
      // Skip redundant initialization if already authenticated (coming from login)
      if (!vaultService.isUserAuthenticated()) {
        console.log(
          'User not authenticated, attempting vault service initialization'
        );
        await vaultService.initialize();

        if (!vaultService.isUserAuthenticated()) {
          console.log(
            'Authentication failed after initialization, redirecting to login'
          );
          navigation.replace('Login');
          return;
        }
      } else {
        console.log(
          'User already authenticated, skipping vault initialization'
        );
      }

      console.log(
        'Vault service authenticated successfully, loading data in background...'
      );

      // Load data in background (non-blocking for instant navigation)
      setImmediate(() => {
        Promise.all([
          loadPasswords(() =>
            vaultService.getPasswordEntries({
              sortBy: 'last_accessed',
              sortOrder: 'DESC',
            })
          ),
          loadCategories(),
          loadRecentSearches(),
          updateActivity(),
        ]).catch(error => {
          console.error('Background data loading error:', error);
          // Handle errors in background loading gracefully
        });
      });
    } catch (error) {
      console.error('Error initializing vault:', error);

      // Handle authentication-specific errors
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
        Alert.alert('Error', 'Failed to load vault data. Please try again.');
        navigation.replace('Login');
      }
    } finally {
      // setIsLoading(false); // This line is removed as loading is now managed by context
    }
  };

  const loadCategories = async () => {
    try {
      const allCategories = await vaultService.getCategories();
      setCategories(allCategories);
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  const loadRecentSearches = async () => {
    try {
      const searches = await AsyncStorage.getItem('vault_recentSearches');
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
      let filtered = [...passwords];

      // Apply search filter first if there's a search query
      if (searchQuery.trim()) {
        await saveRecentSearch(searchQuery.trim());
        const query = searchQuery.toLowerCase().trim();
        // Client-side search filtering by title and username (case-insensitive)
        filtered = filtered.filter(
          entry =>
            (entry.title && entry.title.toLowerCase().includes(query)) ||
            (entry.username && entry.username.toLowerCase().includes(query))
        );
      } else {
        // Apply category filter when no search query
        if (selectedCategory !== 'all') {
          if (selectedCategory === 'favorites') {
            filtered = filtered.filter(entry => entry.isFavorite === true);
          } else {
            // Category ID filter - ensure proper type matching
            const categoryId = parseInt(selectedCategory);
            console.log(`=== CATEGORY FILTER DEBUG ===`);
            console.log('Selected category ID:', categoryId, typeof categoryId);
            console.log('Total passwords:', passwords.length);
            console.log(
              'Password categoryIds:',
              passwords.map(p => ({
                id: p.id,
                categoryId: p.categoryId,
                type: typeof p.categoryId,
              }))
            );

            filtered = filtered.filter(entry => {
              const entryCategory = entry.categoryId;
              const matches = entryCategory === categoryId;
              console.log(
                `Entry ${entry.id}: categoryId=${entryCategory} (${typeof entryCategory}) matches ${categoryId} (${typeof categoryId}) = ${matches}`
              );
              return matches;
            });
            console.log('Filtered results count:', filtered.length);
            console.log(`=== END CATEGORY FILTER DEBUG ===`);
          }
        }
      }

      // Apply sorting
      filtered = applySorting(filtered, sortBy);

      setFilteredPasswords(filtered);
    } catch (error) {
      console.error('Error applying filters:', error);
    }
  }, [passwords, searchQuery, selectedCategory, sortBy]);

  const applySorting = (passwordList, sortOption) => {
    const sorted = [...passwordList];

    switch (sortOption) {
      case 'recently_used':
        return sorted.sort((a, b) => {
          const aTime = new Date(a.last_accessed || a.updated_at);
          const bTime = new Date(b.last_accessed || b.updated_at);
          return bTime - aTime;
        });
      case 'recently_added':
        return sorted.sort(
          (a, b) => new Date(b.created_at) - new Date(a.created_at)
        );
      case 'alphabetical':
        return sorted.sort((a, b) => {
          // Would need decryption to sort by title
          return a.id - b.id; // Placeholder
        });
      case 'reverse_alphabetical':
        return sorted.sort((a, b) => {
          // Would need decryption to sort by title
          return b.id - a.id; // Placeholder
        });
      case 'by_category':
        return sorted.sort((a, b) => {
          if (a.category_name && b.category_name) {
            return a.category_name.localeCompare(b.category_name);
          }
          return 0;
        });
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
        'vault_recentSearches',
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

  const handlePasswordPress = item => {
    updateActivity();
    // Navigate to password details screen
    navigation.navigate('PasswordDetails', { id: item.id });
  };

  const handleDeletePassword = async id => {
    try {
      await vaultService.deletePasswordEntry(id);
      deletePassword(id);
      await loadCategories(); // Refresh categories with updated counts
    } catch (error) {
      console.error('Error deleting password:', error);
    }
  };

  const handleAddPassword = () => {
    setShowAddModal(false);
    updateActivity();
    navigation.navigate('AddPassword');
  };

  const handleAddCategory = () => {
    setShowAddModal(false);
    updateActivity();
    navigation.navigate('MainTabs', {
      screen: 'Categories',
      params: { createNew: true },
    });
  };

  const renderPasswordCard = ({ item }) => {
    // Handle invalid/malformed items
    if (!item || typeof item !== 'object') {
      console.error('MyVaultScreen: Invalid item in renderPasswordCard:', item);
      return null;
    }

    // Handle decryption errors
    if (item.decryptionError) {
      return (
        <TouchableOpacity
          style={[
            styles.passwordCard,
            styles.passwordCardError,
            {
              backgroundColor: theme.colors.surface,
              borderLeftColor: theme.colors.error,
            },
          ]}
          onPress={() => handlePasswordPress(item)}
        >
          <View style={styles.passwordCardContent}>
            <View style={styles.passwordCardLeft}>
              <View
                style={[
                  styles.categoryIcon,
                  { backgroundColor: theme.colors.error },
                ]}
              >
                <Icon name="exclamation-triangle" size={16} color="#fff" />
              </View>
              <View style={styles.passwordInfo}>
                <Text
                  style={[styles.passwordTitle, { color: theme.colors.error }]}
                  numberOfLines={1}
                >
                  {item.title || 'Decryption Error'}
                </Text>
                <Text
                  style={[
                    styles.passwordSubtitle,
                    { color: theme.colors.textSecondary },
                  ]}
                  numberOfLines={1}
                >
                  Unable to decrypt entry
                </Text>
              </View>
            </View>
            <View style={styles.passwordCardRight}>
              <Icon
                name="chevron-right"
                size={16}
                color={theme.colors.textSecondary}
              />
            </View>
          </View>
        </TouchableOpacity>
      );
    }

    // Display decrypted data according to user requirements:
    // First line: Title (bold)
    // Second line: Username (smaller font)
    const displayTitle = item.title || 'No Title';
    const displaySubtitle = item.username || 'No Username';

    return (
      <TouchableOpacity
        style={[styles.passwordCard, { backgroundColor: theme.colors.surface }]}
        onPress={() => handlePasswordPress(item)}
      >
        <View style={styles.passwordCardContent}>
          <View style={styles.passwordCardLeft}>
            <View
              style={[
                styles.categoryIcon,
                { backgroundColor: item.categoryColor || theme.colors.primary },
              ]}
            >
              <Icon
                name={item.categoryIcon || 'folder'}
                size={16}
                color="#fff"
              />
            </View>
            <View style={styles.passwordInfo}>
              <Text
                style={[styles.passwordTitle, { color: theme.colors.text }]}
                numberOfLines={1}
              >
                {displayTitle}
              </Text>
              <Text
                style={[
                  styles.passwordSubtitle,
                  { color: theme.colors.textSecondary },
                ]}
                numberOfLines={1}
              >
                {displaySubtitle}
              </Text>
            </View>
          </View>
          <View style={styles.passwordCardRight}>
            {item.isFavorite && (
              <Icon name="star" size={16} color="#FFD700" solid />
            )}
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
      <Icon name="shield-alt" size={64} color={theme.colors.textSecondary} />
      <Text style={[styles.emptyStateTitle, { color: theme.colors.text }]}>
        No passwords saved yet
      </Text>
      <Text
        style={[
          styles.emptyStateSubtitle,
          { color: theme.colors.textSecondary },
        ]}
      >
        Tap the + button to add your first password
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
              selectedCategory === 'all' && {
                backgroundColor: theme.colors.primary + '20',
              },
            ]}
            onPress={() => {
              setSelectedCategory('all');
              setShowFilterModal(false);
            }}
          >
            <Icon
              name="list"
              size={20}
              color={
                selectedCategory === 'all'
                  ? theme.colors.primary
                  : theme.colors.textSecondary
              }
            />
            <Text
              style={[
                styles.filterOptionText,
                {
                  color:
                    selectedCategory === 'all'
                      ? theme.colors.primary
                      : theme.colors.text,
                },
              ]}
            >
              All Records
            </Text>
            <Text
              style={[
                styles.filterCount,
                { color: theme.colors.textSecondary },
              ]}
            >
              {passwords.length}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterOption,
              selectedCategory === 'favorites' && {
                backgroundColor: theme.colors.primary + '20',
              },
            ]}
            onPress={() => {
              setSelectedCategory('favorites');
              setShowFilterModal(false);
            }}
          >
            <Icon
              name="star"
              size={20}
              color={
                selectedCategory === 'favorites'
                  ? theme.colors.primary
                  : '#FFD700'
              }
              solid
            />
            <Text
              style={[
                styles.filterOptionText,
                {
                  color:
                    selectedCategory === 'favorites'
                      ? theme.colors.primary
                      : theme.colors.text,
                },
              ]}
            >
              Favorites
            </Text>
            <Text
              style={[
                styles.filterCount,
                { color: theme.colors.textSecondary },
              ]}
            >
              {passwords.filter(p => p.isFavorite === true).length}
            </Text>
          </TouchableOpacity>

          {categories.map(category => (
            <TouchableOpacity
              key={category.id}
              style={[
                styles.filterOption,
                selectedCategory === category.id.toString() && {
                  backgroundColor: theme.colors.primary + '20',
                },
              ]}
              onPress={() => {
                setSelectedCategory(category.id.toString());
                setShowFilterModal(false);
              }}
            >
              <View
                style={[
                  styles.categoryIndicator,
                  { backgroundColor: category.color || theme.colors.primary },
                ]}
              >
                <Icon name={category.icon || 'folder'} size={12} color="#fff" />
              </View>
              <Text
                style={[
                  styles.filterOptionText,
                  {
                    color:
                      selectedCategory === category.id.toString()
                        ? theme.colors.primary
                        : theme.colors.text,
                  },
                ]}
              >
                {category.name}
              </Text>
              <Text
                style={[
                  styles.filterCount,
                  { color: theme.colors.textSecondary },
                ]}
              >
                {category.password_count || 0}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Modal>
  );

  const renderAddModal = () => (
    <FABActionMenu
      visible={showAddModal}
      onClose={() => setShowAddModal(false)}
      navigation={navigation}
    />
  );

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={[styles.loadingText, { color: theme.colors.text }]}>
            Loading vault...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {/* Header with Title and Password Count */}
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
            My Vault
          </Text>
          {/* Keep the badge right-aligned, visually similar to AddPasswordScreen's headerRight */}
          <View style={{ position: 'absolute', right: 0 }}>
            <Badge
              style={[
                styles.passwordCount,
                { backgroundColor: theme.colors.primary },
              ]}
            >
              {passwords.length}
            </Badge>
          </View>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search passwords..."
          onChangeText={handleSearchChange}
          value={searchQuery}
          style={[styles.searchBar, { backgroundColor: theme.colors.surface }]}
          inputStyle={{ color: theme.colors.text }}
          iconColor={theme.colors.textSecondary}
          placeholderTextColor={theme.colors.textSecondary}
        />

        {/* Recent searches */}
        {/* isSearchExpanded && recentSearches.length > 0 && (
          <View style={styles.recentSearches}>
            {recentSearches.map((search, index) => (
              <Chip
                key={index}
                onPress={() => setSearchQuery(search)}
                style={styles.recentSearchChip}
              >
                {search}
              </Chip>
            ))}
          </View>
        ) */}
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
            {selectedCategory === 'all'
              ? 'All Records'
              : selectedCategory === 'favorites'
                ? 'Favorites'
                : categories.find(c => c.id.toString() === selectedCategory)
                    ?.name || 'Filter'}
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
          <Menu.Item
            onPress={() => handleSort('recently_used')}
            title="Recently Used"
          />
          <Menu.Item
            onPress={() => handleSort('recently_added')}
            title="Recently Added"
          />
          <Menu.Item onPress={() => handleSort('alphabetical')} title="A-Z" />
          <Menu.Item
            onPress={() => handleSort('category')}
            title="By Category"
          />
        </Menu>
      </View>

      {/* Password List */}
      <FlatList
        data={filteredPasswords}
        renderItem={renderPasswordCard}
        keyExtractor={(item, index) =>
          item && item.id ? item.id.toString() : `password_${index}`
        }
        style={styles.passwordList}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmptyState}
      />

      {/* Floating Action Button */}
      <View style={styles.fabContainer}>
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setShowAddModal(true)}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={[theme.colors.primary, theme.colors.secondary]}
            style={styles.fabGradient}
          >
            <Icon name="plus" size={24} color="#fff" />
          </LinearGradient>
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
    paddingTop: 40, // Increased top padding
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  passwordCount: {
    fontSize: 12,
  },
  searchContainer: {
    paddingHorizontal: 0, // Reduced horizontal padding
    paddingVertical: 10,
  },
  searchBar: {
    elevation: 0,
    shadowOpacity: 0,
    borderRadius: 8,
    height: 50, // Reduced corner radius
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
  passwordList: {
    flex: 1,
    paddingHorizontal: 0,
  },
  passwordCard: {
    borderRadius: 12,
    marginVertical: 4,
    elevation: 2,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  passwordCardError: {
    borderLeftWidth: 4,
  },
  passwordCardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  passwordCardLeft: {
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
  passwordInfo: {
    flex: 1,
  },
  passwordTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  passwordSubtitle: {
    fontSize: 14,
  },
  passwordCardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
    bottom: 100, // Positioned above tab navigator
    right: 20,
  },
  fab: {
    borderRadius: 28,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  fabGradient: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
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
  categoryIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default MyVaultScreen;
