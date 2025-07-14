import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  useColorScheme,
  Dimensions,
  Alert,
} from 'react-native';
import {
  Searchbar,
  Chip,
  FAB,
  Badge,
  Menu,
  ActivityIndicator,
} from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/FontAwesome5';

import vaultService from '../services/vaultService';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Constants for activity tracking
const ACTIVITY_TIMEOUT = 2 * 60 * 1000; // 2 minutes
const LAST_ACTIVE_TIME_KEY = 'vault_lastActiveTime';

const MyVaultScreen = ({ navigation }) => {
  // State management
  const [passwords, setPasswords] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filteredPasswords, setFilteredPasswords] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('recently_used');
  const [isLoading, setIsLoading] = useState(true);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [recentSearches, setRecentSearches] = useState([]);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showFABMenu, setShowFABMenu] = useState(false);
  const [activeTab, setActiveTab] = useState('vault');
  const [showCategoryBottomSheet, setShowCategoryBottomSheet] = useState(false);
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
  };

  useEffect(() => {
    initializeVault();
  }, []);

  useEffect(() => {
    applyFiltersAndSort();
  }, [passwords, searchQuery, selectedCategory, sortBy]);

  const initializeVault = async () => {
    try {
      setIsLoading(true);

      // Initialize vault service
      await vaultService.initialize();

      // Check if user is authenticated
      if (!vaultService.isUserAuthenticated()) {
        // Redirect to login if not authenticated
        navigation.replace('LoginScreen');
        return;
      }

      // Load data
      await Promise.all([
        loadPasswords(),
        loadCategories(),
        loadRecentSearches(),
        updateActivity(),
      ]);
    } catch (error) {
      console.error('Error initializing vault:', error);
      Alert.alert('Error', 'Failed to load vault data. Please try again.');
      // Redirect to login on error
      navigation.replace('LoginScreen');
    } finally {
      setIsLoading(false);
    }
  };

  const loadPasswords = async () => {
    try {
      const decryptedPasswords = await vaultService.getPasswordEntries({
        sortBy: 'last_accessed',
        sortOrder: 'DESC',
      });
      setPasswords(decryptedPasswords);
    } catch (error) {
      console.error('Error loading passwords:', error);
      if (error.message.includes('not authenticated')) {
        navigation.replace('LoginScreen');
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

      // Apply category filter
      if (selectedCategory !== 'all') {
        if (selectedCategory === 'favorites') {
          filtered = filtered.filter(entry => entry.isFavorite === true);
        } else {
          // Category ID filter
          const categoryId = parseInt(selectedCategory);
          filtered = filtered.filter(entry => entry.categoryId === categoryId);
        }
      }

      // Apply search filter using vault service
      if (searchQuery.trim()) {
        await saveRecentSearch(searchQuery.trim());
        try {
          filtered = await vaultService.searchPasswords(searchQuery, {
            categoryId:
              selectedCategory !== 'all' && selectedCategory !== 'favorites'
                ? parseInt(selectedCategory)
                : null,
            isFavorite: selectedCategory === 'favorites' ? true : null,
          });
        } catch (searchError) {
          console.error('Search error:', searchError);
          // Fall back to title search if vault service fails
          filtered = filtered.filter(
            entry =>
              entry.title &&
              entry.title.toLowerCase().includes(searchQuery.toLowerCase())
          );
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

  const handleCategoryFilter = categoryValue => {
    setSelectedCategory(categoryValue);
    updateActivity();
  };

  const handleSort = sortOption => {
    setSortBy(sortOption);
    setShowSortMenu(false);
    updateActivity();
  };

  const handlePasswordPress = passwordEntry => {
    updateActivity();
    // Navigate to password details screen
    // navigation.navigate('PasswordDetails', { passwordId: passwordEntry.id });
  };

  const handleAddPassword = () => {
    setShowFABMenu(false);
    updateActivity();
    // navigation.navigate('AddPassword');
  };

  const handleAddCategory = () => {
    setShowFABMenu(false);
    updateActivity();
    // navigation.navigate('AddCategory');
  };

  const handleTabPress = tab => {
    setActiveTab(tab);
    updateActivity();

    switch (tab) {
      case 'generator':
        // navigation.navigate('PasswordGenerator');
        break;
      case 'categories':
        // navigation.navigate('Categories');
        break;
      case 'settings':
        // navigation.navigate('Settings');
        break;
      default:
        break;
    }
  };

  const renderPasswordItem = ({ item }) => (
    <TouchableOpacity
      style={[styles.passwordCard, { backgroundColor: theme.surface }]}
      onPress={() => handlePasswordPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.passwordCardContent}>
        <View style={styles.passwordCardLeft}>
          <View
            style={[
              styles.categoryIcon,
              { backgroundColor: item.category_color || theme.primary },
            ]}
          >
            <Icon
              name={item.category_icon || 'folder'}
              size={16}
              color="#fff"
            />
          </View>
          <View style={styles.passwordInfo}>
            <Text
              style={[styles.passwordTitle, { color: theme.text }]}
              numberOfLines={1}
            >
              {item.title_encrypted ? '••••••••' : 'Encrypted Entry'}
            </Text>
            <Text
              style={[styles.passwordSubtitle, { color: theme.textSecondary }]}
              numberOfLines={1}
            >
              {item.username_encrypted ? '••••••••' : 'No username'}
            </Text>
          </View>
        </View>
        <View style={styles.passwordCardRight}>
          {item.is_favorite === 1 && (
            <Icon name="star" size={16} color="#FFD700" solid />
          )}
          <Icon name="chevron-right" size={16} color={theme.textSecondary} />
        </View>
      </View>
    </TouchableOpacity>
  );

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
        {isSearchExpanded && recentSearches.length > 0 && (
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
        )}
      </View>

      {/* Filter Chips */}
      <View style={styles.filterContainer}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[
            { id: 'all', label: 'All', count: passwords.length },
            {
              id: 'favorites',
              label: '⭐ Favorites',
              count: passwords.filter(p => p.is_favorite === 1).length,
            },
            ...categories.slice(0, 4).map(cat => ({
              id: cat.id.toString(),
              label: cat.name,
              count: cat.password_count || 0,
              color: cat.color,
              icon: cat.icon,
            })),
            { id: 'more', label: 'More', count: 0 },
          ]}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => {
                if (item.id === 'more') {
                  setShowCategoryBottomSheet(true);
                } else {
                  handleCategoryFilter(item.id);
                }
              }}
            >
              <Chip
                selected={selectedCategory === item.id}
                style={[
                  styles.filterChip,
                  selectedCategory === item.id && {
                    backgroundColor: theme.primary,
                  },
                ]}
                textStyle={[
                  { color: selectedCategory === item.id ? '#fff' : theme.text },
                ]}
              >
                {item.label} {item.count > 0 && `(${item.count})`}
              </Chip>
            </TouchableOpacity>
          )}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.filterChipContainer}
        />
      </View>

      {/* Sort Menu */}
      <View style={styles.sortContainer}>
        <Menu
          visible={showSortMenu}
          onDismiss={() => setShowSortMenu(false)}
          anchor={
            <TouchableOpacity
              style={styles.sortButton}
              onPress={() => setShowSortMenu(true)}
            >
              <Icon name="sort" size={16} color={theme.textSecondary} />
              <Text
                style={[styles.sortButtonText, { color: theme.textSecondary }]}
              >
                Sort
              </Text>
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
            onPress={() => handleSort('reverse_alphabetical')}
            title="Z-A"
          />
          <Menu.Item
            onPress={() => handleSort('by_category')}
            title="By Category"
          />
        </Menu>
      </View>

      {/* Password List */}
      <FlatList
        data={filteredPasswords}
        renderItem={renderPasswordItem}
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={styles.passwordList}
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
      />

      {/* Floating Action Button */}
      <View style={styles.fabContainer}>
        <LinearGradient
          colors={['#7E57C2', '#26A69A']}
          style={styles.fabGradient}
        >
          <FAB
            style={styles.fab}
            icon="plus"
            onPress={() => setShowFABMenu(!showFABMenu)}
            color="#fff"
          />
        </LinearGradient>

        {/* FAB Menu */}
        {showFABMenu && (
          <View style={styles.fabMenu}>
            <TouchableOpacity
              style={[styles.fabMenuItem, { backgroundColor: theme.surface }]}
              onPress={handleAddPassword}
            >
              <Icon name="key" size={20} color={theme.primary} />
              <Text style={[styles.fabMenuText, { color: theme.text }]}>
                Add Password
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.fabMenuItem, { backgroundColor: theme.surface }]}
              onPress={handleAddCategory}
            >
              <Icon name="folder-plus" size={20} color={theme.primary} />
              <Text style={[styles.fabMenuText, { color: theme.text }]}>
                Add Category
              </Text>
            </TouchableOpacity>
          </View>
        )}
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
    paddingVertical: 16,
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
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  searchBar: {
    elevation: 0,
    shadowOpacity: 0,
  },
  recentSearches: {
    flexDirection: 'row',
    marginTop: 8,
  },
  recentSearchChip: {
    marginRight: 8,
  },
  filterContainer: {
    paddingVertical: 8,
  },
  filterChipContainer: {
    paddingHorizontal: 20,
  },
  filterChip: {
    marginRight: 8,
  },
  sortContainer: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  sortButtonText: {
    marginLeft: 4,
  },
  passwordList: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  passwordCard: {
    borderRadius: 12,
    marginVertical: 4,
    elevation: 2,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
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
    bottom: 100,
    right: 20,
  },
  fabGradient: {
    borderRadius: 28,
  },
  fab: {
    backgroundColor: 'transparent',
    margin: 0,
  },
  fabMenu: {
    position: 'absolute',
    bottom: 70,
    right: 0,
    gap: 8,
  },
  fabMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    elevation: 4,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  fabMenuText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '500',
  },
  bottomNav: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 8,
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
});

export default MyVaultScreen;
