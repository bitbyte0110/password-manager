import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  FlatList,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { Snackbar, IconButton } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import clipboardService from '../services/clipboardService';
import vaultService from '../services/vaultService';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import { useDatabase } from '../contexts/DatabaseContext';
import { usePasswords } from '../PasswordContext';

const CategoryDetailsScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { theme } = useTheme();
  const { executeWithDatabase } = useDatabase();
  const { subscribeToCategoryRefresh } = usePasswords();
  const {
    categoryId,
    categoryName,
    categoryColor,
    categoryIcon,
    categoryDescription,
  } = route.params;

  const [passwords, setPasswords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });

  // Subscribe to category refresh notifications
  useEffect(() => {
    const unsubscribe = subscribeToCategoryRefresh(categoryId, () => {
      console.log(
        `CategoryDetailsScreen: Received refresh notification for category ${categoryId}`
      );
      fetchPasswords(false); // Don't show loading spinner for notification refresh
    });

    return unsubscribe;
  }, [categoryId, subscribeToCategoryRefresh]);

  // Refresh data whenever screen comes into focus
  useFocusEffect(
    useCallback(() => {
      console.log(
        `CategoryDetailsScreen: Screen focused, refreshing data for category ${categoryId}`
      );
      fetchPasswords(false); // Don't show loading spinner for focus refresh
    }, [categoryId])
  );

  // Handle navigation params for refresh
  useEffect(() => {
    if (route?.params?.shouldRefresh) {
      console.log(
        'CategoryDetailsScreen: Refresh requested via navigation params'
      );
      fetchPasswords(false); // Don't show loading spinner for param refresh
      // Clear the parameter to prevent re-fetching on subsequent renders
      navigation.setParams({ shouldRefresh: undefined });
    }
  }, [route?.params?.shouldRefresh, navigation]);

  useEffect(() => {
    fetchPasswords();
  }, [categoryId]);

  const fetchPasswords = async (showLoadingSpinner = true) => {
    try {
      if (showLoadingSpinner) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      const data = await executeWithDatabase(
        () => vaultService.getPasswordsByCategory(categoryId),
        `Load passwords for category ${categoryId}`
      );

      setPasswords(data);
      console.log(
        `CategoryDetailsScreen: Loaded ${data.length} passwords for category ${categoryId}`
      );
    } catch (error) {
      console.error('Error fetching category passwords:', error);
      setSnackbar({ visible: true, message: 'Error loading passwords' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handlePasswordPress = password => {
    navigation.navigate('PasswordDetails', { id: password.id });
  };

  const handleCopyUsername = async username => {
    try {
      const success = await clipboardService.copyToClipboard(
        username || '',
        false
      );
      if (success) {
        setSnackbar({ visible: true, message: 'Username copied' });
      } else {
        setSnackbar({ visible: true, message: 'Copy failed' });
      }
    } catch (error) {
      setSnackbar({ visible: true, message: 'Copy failed' });
    }
  };

  const handleAddPassword = () => {
    navigation.navigate('AddPassword', {
      categoryId,
      categoryName,
      // Request refresh when returning from AddPassword
      onReturn: () => {
        console.log(
          'CategoryDetailsScreen: Returning from AddPassword, refreshing data'
        );
        fetchPasswords(false);
      },
    });
  };

  const renderPasswordCard = ({ item }) => {
    if (item.decryptionError) {
      return (
        <TouchableOpacity
          style={[
            styles.passwordCard,
            styles.errorCard,
            { backgroundColor: theme.colors.card },
          ]}
          onPress={() => handlePasswordPress(item)}
        >
          <View style={styles.cardContent}>
            <View style={styles.cardLeft}>
              <View
                style={[
                  styles.errorIcon,
                  { backgroundColor: theme.colors.error },
                ]}
              >
                <Icon name="exclamation-triangle" size={16} color="#fff" />
              </View>
              <View style={styles.passwordInfo}>
                <Text style={[styles.errorText, { color: theme.colors.error }]}>
                  Unable to decrypt
                </Text>
                <Text
                  style={[
                    styles.errorSubtext,
                    { color: theme.colors.textSecondary },
                  ]}
                >
                  Tap to view details
                </Text>
              </View>
            </View>
            <Icon
              name="chevron-right"
              size={16}
              color={theme.colors.textSecondary}
            />
          </View>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        style={[styles.passwordCard, { backgroundColor: theme.colors.card }]}
        onPress={() => handlePasswordPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.cardContent}>
          <View style={styles.cardLeft}>
            <View style={styles.passwordInfo}>
              <Text
                style={[styles.passwordTitle, { color: theme.colors.text }]}
                numberOfLines={1}
              >
                {item.title || 'Untitled'}
              </Text>
              <Text
                style={[
                  styles.passwordUsername,
                  { color: theme.colors.textSecondary },
                ]}
                numberOfLines={1}
              >
                {item.username || 'No username'}
              </Text>
            </View>
          </View>
          <View style={styles.cardRight}>
            {item.isFavorite && (
              <Icon name="star" size={16} color="#FFD700" solid />
            )}
            <IconButton
              icon="clipboard"
              size={20}
              iconColor={theme.colors.textSecondary}
              onPress={() => handleCopyUsername(item.username)}
              style={styles.copyButton}
            />
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
      <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
        No passwords in this category
      </Text>
      <Text
        style={[styles.emptySubtitle, { color: theme.colors.textSecondary }]}
      >
        Tap the + button to add your first password
      </Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <View style={styles.loadingContainer}>
          <Text
            style={[styles.loadingText, { color: theme.colors.textSecondary }]}
          >
            Loading passwords...
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
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.colors.card,
            borderBottomColor: theme.colors.border,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Icon name="arrow-left" size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <Text
          style={[styles.headerTitle, { color: theme.colors.text }]}
          numberOfLines={1}
        >
          {categoryName || 'Category'}
        </Text>
        <View style={styles.headerRight} />
      </View>

      {/* Category Info */}
      <View
        style={[
          styles.categoryInfo,
          {
            backgroundColor: theme.colors.card,
            borderBottomColor: theme.colors.border,
          },
        ]}
      >
        <View
          style={[
            styles.categoryIcon,
            { backgroundColor: categoryColor || theme.colors.primary },
          ]}
        >
          <Icon name={categoryIcon || 'folder'} size={24} color="#fff" />
        </View>
        <Text style={[styles.categoryTitle, { color: theme.colors.text }]}>
          {categoryName}
        </Text>
        <Text
          style={[styles.passwordCount, { color: theme.colors.textSecondary }]}
        >
          {passwords.length} {passwords.length === 1 ? 'password' : 'passwords'}
        </Text>
        {categoryDescription && (
          <Text
            style={[
              styles.categoryDescription,
              { color: theme.colors.textSecondary },
            ]}
          >
            {categoryDescription}
          </Text>
        )}
      </View>

      {/* Password List */}
      <FlatList
        data={passwords}
        renderItem={renderPasswordCard}
        keyExtractor={item => item.id.toString()}
        style={styles.passwordList}
        contentContainerStyle={
          passwords.length === 0
            ? styles.emptyListContainer
            : styles.listContainer
        }
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmptyState}
        refreshing={refreshing}
        onRefresh={() => fetchPasswords(false)}
        ListHeaderComponent={
          refreshing ? (
            <View style={styles.refreshContainer}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text
                style={[
                  styles.refreshText,
                  { color: theme.colors.textSecondary },
                ]}
              >
                Refreshing passwords...
              </Text>
            </View>
          ) : null
        }
      />

      {/* Floating Action Button */}
      <View style={styles.fabContainer}>
        <TouchableOpacity
          style={styles.fab}
          onPress={handleAddPassword}
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

      {/* Snackbar */}
      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ visible: false, message: '' })}
        duration={2000}
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
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 20,
    borderBottomWidth: 1,
  },
  backButton: {
    position: 'absolute',
    left: 20,
    top: 48,
    zIndex: 2,
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    flex: 1,
    marginHorizontal: 40,
  },
  headerRight: {
    width: 28,
  },
  categoryInfo: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  categoryIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  categoryTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  passwordCount: {
    fontSize: 14,
    marginBottom: 8,
  },
  categoryDescription: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 0,
  },
  listContainer: {
    paddingBottom: 100,
  },
  passwordList: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  passwordCard: {
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  errorCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#e74c3c',
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  passwordInfo: {
    flex: 1,
  },
  passwordTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  passwordUsername: {
    fontSize: 14,
  },
  cardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  copyButton: {
    margin: 0,
  },
  errorIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  errorText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  errorSubtext: {
    fontSize: 14,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 40,
    marginTop: -60,
    minHeight: 300,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  emptyListContainer: {
    flex: 1,
  },
  fabContainer: {
    position: 'absolute',
    bottom: 100,
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
  },
  snackbar: {
    backgroundColor: '#333',
  },
  refreshContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  refreshText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
});

export default CategoryDetailsScreen;
