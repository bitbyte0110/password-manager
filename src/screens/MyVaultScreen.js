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
} from 'react-native';
import { Searchbar, Badge, Menu, ActivityIndicator } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { useFocusEffect } from '@react-navigation/native';

import vaultService from '../services/vaultService';

// Constants for activity tracking
const LAST_ACTIVE_TIME_KEY = 'vault_lastActiveTime';
const { height: screenHeight } = Dimensions.get('window');

const MyVaultScreen = ({ navigation, route }) => {
  // State management
  const [passwords, setPasswords] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filteredPasswords, setFilteredPasswords] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('recently_used');
  const [isLoading, setIsLoading] = useState(true);
  const [recentSearches, setRecentSearches] = useState([]);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeTab, setActiveTab] = useState('vault');
  const [authError, setAuthError] = useState(null); // New state for authentication errors
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
    modalBackground: 'rgba(0,0,0,0.5)',
    error: '#e74c3c',
  };

  useEffect(() => {
    initializeVault();
  }, []);

  useEffect(() => {
    applyFiltersAndSort();
  }, [passwords, searchQuery, selectedCategory, sortBy]);

  // Refresh data when screen gains focus (e.g., returning from AddPasswordScreen)
  useFocusEffect(
    useCallback(() => {
      // Check if we should refresh (from navigation params)
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
      setIsLoading(true);

      // Initialize vault service (now includes authentication restoration)
      await vaultService.initialize();

      // Check if user is authenticated after initialization and potential restoration
      if (!vaultService.isUserAuthenticated()) {
        console.log(
          'User not authenticated after initialization, redirecting to login'
        );
        // Redirect to login if not authenticated
        navigation.replace('Login');
        return;
      }

      console.log('Vault service authenticated successfully, loading data...');

      // Load data
      await Promise.all([
        loadPasswords(),
        loadCategories(),
        loadRecentSearches(),
        updateActivity(),
      ]);
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
      setIsLoading(false);
    }
  };

  const loadPasswords = async () => {
    try {
      setAuthError(null);
      console.log(
        'MyVaultScreen: Loading passwords with enhanced error handling...'
      );

      // Ensure vault service is authenticated before loading passwords
      if (!vaultService.isUserAuthenticated()) {
        console.log('Vault service not authenticated, redirecting to login');
        navigation.replace('Login');
        return;
      }

      console.log(
        'Loading passwords with comprehensive decryption error handling...'
      );
      const decryptedPasswords = await vaultService.getPasswordEntries({
        sortBy: 'last_accessed',
        sortOrder: 'DESC',
      });

      console.log(
        `Successfully loaded ${decryptedPasswords.length} password entries`
      );

      // Filter out entries that had critical decryption failures vs those with partial failures
      const validEntries = decryptedPasswords.filter(entry => {
        // Allow entries with optional field decryption failures (URL, notes)
        // but exclude entries where core fields (title, username, password) failed
        if (entry.decryptionError) {
          console.log(
            `Entry ${entry.id} has decryption error, excluding from display`
          );
          return false;
        }
        return true;
      });

      const failedEntries = decryptedPasswords.length - validEntries.length;
      if (failedEntries > 0) {
        console.log(
          `${failedEntries} entries had critical decryption failures and were excluded`
        );
      }

      console.log(
        'Password entries sample:',
        validEntries.slice(0, 2).map(p => ({
          id: p.id,
          title: p.title,
          username: p.username,
          url: p.url ? 'has URL' : 'no URL',
          notes: p.notes ? 'has notes' : 'no notes',
          categoryId: p.categoryId,
          categoryName: p.categoryName,
          decryptionError: p.decryptionError,
        }))
      );

      setPasswords(validEntries);
    } catch (error) {
      console.error('Error loading passwords:', error);

      // Handle specific error types with better user guidance
      if (
        error.message.includes('not authenticated') ||
        error.message.includes('master password') ||
        error.message.includes('authentication required')
      ) {
        console.log(
          'Authentication error detected, providing user recovery options'
        );
        setAuthError('Authentication required. Your session may have expired.');

        Alert.alert(
          'Authentication Required',
          'Your session has expired or there was an authentication issue. Please log in again to access your vault.',
          [
            {
              text: 'Login Again',
              onPress: () => {
                // Clear any corrupted vault service state
                vaultService.clearSession();
                navigation.replace('Login');
              },
            },
          ]
        );
      } else if (error.message.includes('Decryption failed')) {
        console.log('Decryption error detected, offering recovery options');
        setAuthError(
          'Some passwords could not be decrypted. This might be due to data corruption or session issues.'
        );

        Alert.alert(
          'Decryption Error',
          'Some of your password entries could not be decrypted. This might be due to session issues or data corruption.',
          [
            {
              text: 'Try Again',
              onPress: () => loadPasswords(),
            },
            {
              text: 'Re-authenticate',
              onPress: () => {
                vaultService.clearSession();
                navigation.replace('Login');
              },
            },
          ]
        );
      } else {
        // For other errors, show error but offer retry option
        console.log('General error loading passwords, offering retry options');
        setAuthError(
          'Failed to load passwords. This might be a temporary issue.'
        );
        Alert.alert(
          'Error Loading Passwords',
          'There was an error loading your passwords. This might be a temporary network or storage issue.',
          [
            {
              text: 'Retry',
              onPress: () => loadPasswords(),
            },
            {
              text: 'Re-authenticate',
              onPress: () => {
                vaultService.clearSession();
                navigation.replace('Login');
              },
            },
          ]
        );
      }
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
        try {
          // Use vault service search with category filter
          filtered = await vaultService.searchPasswords(searchQuery, {
            categoryId:
              selectedCategory !== 'all' && selectedCategory !== 'favorites'
                ? parseInt(selectedCategory)
                : null,
            isFavorite: selectedCategory === 'favorites' ? true : null,
          });
        } catch (searchError) {
          console.error('Search error:', searchError);
          // Fall back to client-side search
          filtered = filtered.filter(
            entry =>
              entry.title &&
              entry.title.toLowerCase().includes(searchQuery.toLowerCase())
          );
        }
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

  const handlePasswordPress = () => {
    updateActivity();
    // Navigate to password details screen
    // navigation.navigate('PasswordDetails', { passwordId: item.id });
  };

  const handleAddPassword = () => {
    setShowAddModal(false);
    updateActivity();
    navigation.navigate('AddPassword');
  };

  const handleAddCategory = () => {
    setShowAddModal(false);
    updateActivity();
    // navigation.navigate('AddCategory');
  };

  const handleTabPress = tab => {
    setActiveTab(tab);
    updateActivity();

    switch (tab) {
      case 'generator':
        navigation.navigate('PasswordGenerator');
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

  const renderPasswordCard = ({ item }) => {
    // Handle decryption errors
    if (item.decryptionError) {
      return (
        <TouchableOpacity
          style={[
            styles.passwordCard,
            styles.passwordCardError,
            { backgroundColor: theme.surface, borderLeftColor: theme.error },
          ]}
          onPress={() => handlePasswordPress(item)}
        >
          <View style={styles.passwordCardContent}>
            <View style={styles.passwordCardLeft}>
              <View
                style={[styles.categoryIcon, { backgroundColor: theme.error }]}
              >
                <Icon name="exclamation-triangle" size={16} color="#fff" />
              </View>
              <View style={styles.passwordInfo}>
                <Text
                  style={[styles.passwordTitle, { color: theme.error }]}
                  numberOfLines={1}
                >
                  {item.title || 'Decryption Error'}
                </Text>
                <Text
                  style={[
                    styles.passwordSubtitle,
                    { color: theme.textSecondary },
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
                color={theme.textSecondary}
              />
            </View>
          </View>
        </TouchableOpacity>
      );
    }

    // Display decrypted data according to user requirements:
    // First line: Category name (from categories table)
    // Second line: Password title or username/email
    const displayTitle = item.categoryName || 'No Category';
    const displaySubtitle = item.title || item.username || 'No title';

    return (
      <TouchableOpacity
        style={[styles.passwordCard, { backgroundColor: theme.surface }]}
        onPress={() => handlePasswordPress(item)}
      >
        <View style={styles.passwordCardContent}>
          <View style={styles.passwordCardLeft}>
            <View
              style={[
                styles.categoryIcon,
                { backgroundColor: item.categoryColor || theme.primary },
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
                style={[styles.passwordTitle, { color: theme.text }]}
                numberOfLines={1}
              >
                {displayTitle}
              </Text>
              <Text
                style={[
                  styles.passwordSubtitle,
                  { color: theme.textSecondary },
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
            <Icon name="chevron-right" size={16} color={theme.textSecondary} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Icon name="shield-alt" size={64} color={theme.textSecondary} />
      <Text style={[styles.emptyStateTitle, { color: theme.text }]}>
        No passwords saved yet
      </Text>
      <Text style={[styles.emptyStateSubtitle, { color: theme.textSecondary }]}>
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
            { backgroundColor: theme.background },
          ]}
        >
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              Filter by
            </Text>
            <TouchableOpacity onPress={() => setShowFilterModal(false)}>
              <Icon name="times" size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[
              styles.filterOption,
              selectedCategory === 'all' && {
                backgroundColor: theme.primary + '20',
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
                selectedCategory === 'all' ? theme.primary : theme.textSecondary
              }
            />
            <Text
              style={[
                styles.filterOptionText,
                {
                  color:
                    selectedCategory === 'all' ? theme.primary : theme.text,
                },
              ]}
            >
              All Records
            </Text>
            <Text style={[styles.filterCount, { color: theme.textSecondary }]}>
              {passwords.length}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterOption,
              selectedCategory === 'favorites' && {
                backgroundColor: theme.primary + '20',
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
                selectedCategory === 'favorites' ? theme.primary : '#FFD700'
              }
              solid
            />
            <Text
              style={[
                styles.filterOptionText,
                {
                  color:
                    selectedCategory === 'favorites'
                      ? theme.primary
                      : theme.text,
                },
              ]}
            >
              Favorites
            </Text>
            <Text style={[styles.filterCount, { color: theme.textSecondary }]}>
              {passwords.filter(p => p.isFavorite === true).length}
            </Text>
          </TouchableOpacity>

          {categories.map(category => (
            <TouchableOpacity
              key={category.id}
              style={[
                styles.filterOption,
                selectedCategory === category.id.toString() && {
                  backgroundColor: theme.primary + '20',
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
                  { backgroundColor: category.color || theme.primary },
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
                        ? theme.primary
                        : theme.text,
                  },
                ]}
              >
                {category.name}
              </Text>
              <Text
                style={[styles.filterCount, { color: theme.textSecondary }]}
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
    <Modal
      visible={showAddModal}
      transparent={true}
      animationType="slide"
      onRequestClose={() => setShowAddModal(false)}
    >
      <View style={styles.modalContainer}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowAddModal(false)}
        />
        <View
          style={[
            styles.addModalContent,
            { backgroundColor: theme.background },
          ]}
        >
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              Add New
            </Text>
            <TouchableOpacity onPress={() => setShowAddModal(false)}>
              <Icon name="times" size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.addOption}
            onPress={() => {
              setShowAddModal(false);
              handleAddPassword();
            }}
          >
            <View
              style={[styles.addOptionIcon, { backgroundColor: theme.primary }]}
            >
              <Icon name="key" size={20} color="#fff" />
            </View>
            <View style={styles.addOptionContent}>
              <Text style={[styles.addOptionTitle, { color: theme.text }]}>
                Add Password
              </Text>
              <Text
                style={[
                  styles.addOptionSubtitle,
                  { color: theme.textSecondary },
                ]}
              >
                Store a new login credential
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.addOption}
            onPress={() => {
              setShowAddModal(false);
              handleAddCategory();
            }}
          >
            <View
              style={[
                styles.addOptionIcon,
                { backgroundColor: theme.secondary },
              ]}
            >
              <Icon name="folder-plus" size={20} color="#fff" />
            </View>
            <View style={styles.addOptionContent}>
              <Text style={[styles.addOptionTitle, { color: theme.text }]}>
                Add Category
              </Text>
              <Text
                style={[
                  styles.addOptionSubtitle,
                  { color: theme.textSecondary },
                ]}
              >
                Create a new category
              </Text>
            </View>
          </TouchableOpacity>
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
            Loading vault...
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
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.background,
            borderBottomColor: theme.border,
          },
        ]}
      >
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          My Vault
        </Text>
        <Badge
          style={[styles.passwordCount, { backgroundColor: theme.primary }]}
        >
          {passwords.length}
        </Badge>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search passwords..."
          onChangeText={handleSearchChange}
          value={searchQuery}
          style={[styles.searchBar, { backgroundColor: theme.surface }]}
          inputStyle={{ color: theme.text }}
          iconColor={theme.textSecondary}
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
          style={[styles.filterButton, { backgroundColor: theme.surface }]}
          onPress={() => setShowFilterModal(true)}
        >
          <Icon name="sliders-h" size={16} color={theme.textSecondary} />
          <Text
            style={[styles.filterButtonText, { color: theme.textSecondary }]}
          >
            {selectedCategory === 'all'
              ? 'All Records'
              : selectedCategory === 'favorites'
                ? 'Favorites'
                : categories.find(c => c.id.toString() === selectedCategory)
                    ?.name || 'Filter'}
          </Text>
          <Icon name="chevron-down" size={12} color={theme.textSecondary} />
        </TouchableOpacity>

        {/* Sort Menu */}
        <Menu
          visible={showSortMenu}
          onDismiss={() => setShowSortMenu(false)}
          anchor={
            <TouchableOpacity
              style={[styles.sortButton, { backgroundColor: theme.surface }]}
              onPress={() => setShowSortMenu(true)}
            >
              <Icon name="sort" size={16} color={theme.textSecondary} />
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
        keyExtractor={item => item.id.toString()}
        style={styles.passwordList}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmptyState}
      />

      {/* Floating Action Button */}
      <View style={styles.fabContainer}>
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: theme.primary }]}
          onPress={() => setShowAddModal(true)}
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
    bottom: 150, // Positioned above bottom nav
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
    backgroundColor: '#fff',
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
  addModalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
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
  addOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
  },
  addOptionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addOptionContent: {
    flex: 1,
  },
  addOptionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  addOptionSubtitle: {
    fontSize: 14,
  },
});

export default MyVaultScreen;
