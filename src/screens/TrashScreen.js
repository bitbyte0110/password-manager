import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from 'react-native';
import { ActivityIndicator, Searchbar, Button } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import vaultService from '../services/vaultService';
import encryptionService from '../services/encryptionService';
import { useTheme } from '../contexts/ThemeContext';
import { usePasswords } from '../PasswordContext';

const TrashScreen = () => {
  const { theme } = useTheme();
  const { addPassword } = usePasswords();
  const navigation = useNavigation();
  const [deletedPasswords, setDeletedPasswords] = useState([]);
  const [filteredPasswords, setFilteredPasswords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState(null);
  const [hasRestoredPassword, setHasRestoredPassword] = useState(false);

  // Load deleted passwords
  const loadDeletedPasswords = useCallback(async () => {
    try {
      setError(null);
      console.log('TrashScreen: Loading deleted passwords...');

      const deletedData = await vaultService.getAllDeletedPasswords();
      console.log('TrashScreen: Raw deleted data count:', deletedData.length);

      // Decrypt and process the data
      const decryptedPasswords = await Promise.all(
        deletedData.map(async (item, index) => {
          try {
            console.log(
              `TrashScreen: Processing item ${index + 1}/${deletedData.length}:`
            );
            console.log(`  - Raw item ID: ${item.id}`);
            console.log(
              `  - Original password ID: ${item.original_password_id}`
            );
            console.log(
              `  - Has encrypted_payload: ${!!item.encrypted_payload}`
            );
            console.log(`  - Full item keys:`, Object.keys(item));

            if (!item.id) {
              console.error(
                'TrashScreen: Item completely missing ID field!',
                item
              );
              return {
                ...item,
                id: `corrupted_${index}`, // Fallback ID
                title: 'Missing ID - Corrupted Entry',
                username: '',
                password: '',
                url: '',
                notes: '',
                decryptionError: true,
                daysRemaining: 0,
                isExpired: true,
              };
            }

            if (!item.encrypted_payload) {
              console.warn(
                'TrashScreen: Item missing encrypted_payload:',
                item.id
              );
              return {
                ...item,
                title: 'Corrupted Entry',
                username: '',
                password: '',
                url: '',
                notes: '',
                decryptionError: true,
                daysRemaining: 0,
                isExpired: true,
              };
            }

            const decryptedPayload =
              encryptionService.decryptPasswordEntryOptimized(
                {
                  ...item,
                  encrypted_payload: JSON.parse(item.encrypted_payload),
                },
                vaultService.masterPassword
              );

            // Calculate days remaining
            const expiresAt = item.expires_at
              ? new Date(item.expires_at)
              : new Date();
            const now = new Date();
            const daysRemaining = Math.max(
              0,
              Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24))
            );

            const result = {
              ...item, // Keep original database fields (including id)
              ...decryptedPayload, // Add decrypted fields
              id: item.id, // Explicitly preserve the deleted_passwords.id
              daysRemaining,
              isExpired: daysRemaining === 0,
              decryptionError: false,
            };

            console.log(`TrashScreen: Successfully decrypted item:`);
            console.log(`  - Original item ID: ${item.id}`);
            console.log(`  - Decrypted payload ID: ${decryptedPayload.id}`);
            console.log(`  - Final result ID: ${result.id}`);
            console.log(`  - Title: "${result.title}"`);

            return result;
          } catch (decryptError) {
            console.error(
              `TrashScreen: Error decrypting deleted password ${item.id}:`,
              decryptError
            );

            // Return item with error flag instead of null, preserving the original id
            return {
              ...item,
              id: item.id, // Explicitly preserve the deleted_passwords.id
              title: 'Decryption Failed',
              username: '',
              password: '',
              url: '',
              notes: '',
              decryptionError: true,
              daysRemaining: 0,
              isExpired: true,
            };
          }
        })
      );

      // Validate all items have proper IDs before setting state
      const validatedPasswords = decryptedPasswords.filter(item => {
        if (!item || !item.id) {
          console.error(
            'TrashScreen: Filtering out item without valid ID:',
            item
          );
          return false;
        }
        return true;
      });

      // Include all valid items, even those with decryption errors
      setDeletedPasswords(validatedPasswords);
      setFilteredPasswords(validatedPasswords);

      const successCount = validatedPasswords.filter(
        p => !p.decryptionError
      ).length;
      const errorCount = validatedPasswords.filter(
        p => p.decryptionError
      ).length;
      const filteredCount =
        decryptedPasswords.length - validatedPasswords.length;

      console.log(
        `TrashScreen: Loaded ${successCount} passwords successfully, ${errorCount} with errors`
      );
      if (filteredCount > 0) {
        console.warn(
          `TrashScreen: Filtered out ${filteredCount} items without valid IDs`
        );
      }
    } catch (err) {
      console.error('TrashScreen: Error loading deleted passwords:', err);
      setError('Failed to load deleted passwords');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Filter passwords based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredPasswords(deletedPasswords);
    } else {
      const filtered = deletedPasswords.filter(
        item =>
          item.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.url?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.category_name?.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredPasswords(filtered);
    }
  }, [searchQuery, deletedPasswords]);

  // Refresh data when screen is focused
  useFocusEffect(
    useCallback(() => {
      loadDeletedPasswords();
    }, [loadDeletedPasswords])
  );

  // Add navigation cleanup effect to trigger vault refresh when leaving TrashScreen
  useEffect(() => {
    const unsubscribe = navigation.addListener('blur', () => {
      // If we've restored any passwords during this session, trigger a vault refresh
      if (hasRestoredPassword) {
        console.log(
          'TrashScreen: Screen lost focus, setting refresh flag for MyVaultScreen due to restored passwords'
        );

        // Use a small delay to ensure this happens after navigation
        setTimeout(() => {
          try {
            // Navigate to MyVault with refresh parameters
            navigation.navigate('MainTabs', {
              screen: 'MyVault',
              params: { shouldRefresh: true, fromTrash: true },
            });
          } catch (error) {
            console.warn('TrashScreen: Navigation error:', error);
          }
        }, 150);
      }
    });

    return unsubscribe;
  }, [navigation, hasRestoredPassword]);

  // Handle refresh
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadDeletedPasswords();
  }, [loadDeletedPasswords]);

  // Restore password
  const handleRestore = item => {
    console.log('TrashScreen: handleRestore called with item:', {
      hasItem: !!item,
      hasId: !!(item && item.id),
      id: item?.id,
      title: item?.title,
      decryptionError: item?.decryptionError,
    });

    if (!item) {
      console.error('TrashScreen: No item provided to handleRestore');
      Alert.alert('Error', 'No item selected');
      return;
    }

    if (!item.id) {
      console.error('TrashScreen: Item missing ID:', item);
      Alert.alert(
        'Error',
        'Item missing valid ID. This may be due to data corruption.'
      );
      return;
    }

    if (item.decryptionError) {
      Alert.alert(
        'Error',
        'Cannot restore item with decryption errors. The item may be corrupted.'
      );
      return;
    }

    Alert.alert(
      'Restore Password',
      `Are you sure you want to restore "${item.title || 'this password'}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: async () => {
            try {
              console.log(
                'TrashScreen: Attempting to restore password with ID:',
                item.id
              );

              // Restore password and get the new password ID
              const restoredPasswordId =
                await vaultService.restorePasswordFromTrash(item.id);
              console.log(
                'TrashScreen: Password restoration successful, new ID:',
                restoredPasswordId
              );

              // Add restored password to main context using the data we already have
              try {
                console.log(
                  'TrashScreen: Creating restored password object from existing data'
                );

                // Create the restored password object using the data we already have from the trash item
                // This avoids the race condition of trying to fetch immediately after restoration
                const restoredPassword = {
                  id: restoredPasswordId, // Use the new password ID returned from restoration
                  title: item.title,
                  username: item.username,
                  password: item.password,
                  url: item.url,
                  notes: item.notes,
                  categoryId: item.category_id,
                  categoryName: item.category_name,
                  categoryColor: item.category_color,
                  categoryIcon: item.category_icon,
                  isFavorite: item.is_favorite === 1,
                  createdAt: item.original_created_at || item.created_at,
                  updatedAt: item.original_updated_at || item.updated_at,
                  lastAccessed:
                    item.original_last_accessed || item.last_accessed,
                };

                console.log(
                  'TrashScreen: Restored password object created:',
                  restoredPassword.title
                );

                // Add to main password context for immediate UI update
                if (addPassword) {
                  addPassword(restoredPassword);
                  console.log(
                    'TrashScreen: Added restored password to main context'
                  );
                } else {
                  console.warn(
                    'TrashScreen: addPassword function not available from context'
                  );
                }
              } catch (contextError) {
                console.warn(
                  'TrashScreen: Could not add restored password to context:',
                  contextError
                );

                // Fallback: try to fetch after a short delay
                setTimeout(async () => {
                  try {
                    console.log(
                      'TrashScreen: Attempting delayed fetch as fallback'
                    );
                    const restoredPassword =
                      await vaultService.getPasswordEntry(restoredPasswordId);
                    if (addPassword) {
                      addPassword(restoredPassword);
                      console.log(
                        'TrashScreen: Successfully added via delayed fallback'
                      );
                    }
                  } catch (delayedError) {
                    console.error(
                      'TrashScreen: Delayed fallback also failed:',
                      delayedError
                    );
                  }
                }, 500); // 500ms delay to ensure database transaction is committed
              }

              // Update trash list to remove the restored item
              await loadDeletedPasswords();

              // Set flag to trigger vault refresh when leaving TrashScreen
              setHasRestoredPassword(true);

              Alert.alert('Success', 'Password restored successfully');
            } catch (err) {
              console.error('TrashScreen: Error restoring password:', err);
              console.error(
                'TrashScreen: Full error object:',
                JSON.stringify(err, Object.getOwnPropertyNames(err))
              );
              Alert.alert(
                'Error',
                `Failed to restore password: ${err.message || 'Unknown error'}`
              );
            }
          },
        },
      ]
    );
  };

  // Permanently delete password
  const handlePermanentDelete = item => {
    if (!item || !item.id) {
      Alert.alert('Error', 'Invalid item selected');
      return;
    }

    Alert.alert(
      'Permanently Delete',
      `Are you sure you want to permanently delete "${item.title || 'this password'}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Permanently',
          style: 'destructive',
          onPress: async () => {
            try {
              await vaultService.permanentlyDeletePassword(item.id);
              await loadDeletedPasswords();
              Alert.alert('Success', 'Password permanently deleted');
            } catch (err) {
              console.error('Error permanently deleting password:', err);
              Alert.alert('Error', 'Failed to permanently delete password');
            }
          },
        },
      ]
    );
  };

  // Empty trash
  const handleEmptyTrash = () => {
    Alert.alert(
      'Empty Trash',
      'Are you sure you want to permanently delete all items in trash? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Empty Trash',
          style: 'destructive',
          onPress: async () => {
            try {
              const deletedCount = await vaultService.emptyTrash(true);
              await loadDeletedPasswords();
              Alert.alert(
                'Success',
                `${deletedCount} items permanently deleted`
              );
            } catch (err) {
              console.error('Error emptying trash:', err);
              Alert.alert('Error', 'Failed to empty trash');
            }
          },
        },
      ]
    );
  };

  // Render deleted password item
  const renderDeletedPasswordItem = ({ item }) => (
    <View
      style={[styles.passwordItem, { backgroundColor: theme.colors.surface }]}
    >
      <View style={styles.passwordHeader}>
        <View style={styles.passwordInfo}>
          <Text
            style={[
              styles.passwordTitle,
              {
                color: item.decryptionError
                  ? theme.colors.error
                  : theme.colors.text,
              },
            ]}
          >
            {item.title || 'Untitled'}
            {item.decryptionError && ' ⚠️'}
          </Text>
          <Text
            style={[
              styles.passwordDetails,
              { color: theme.colors.textSecondary },
            ]}
          >
            {item.username && `${item.username} • `}
            {item.category_name || 'No Category'}
            {item.decryptionError && ' • Decryption Error'}
          </Text>
          <Text
            style={[styles.deletionInfo, { color: theme.colors.textSecondary }]}
          >
            Deleted{' '}
            {item.deleted_at
              ? new Date(item.deleted_at).toLocaleDateString()
              : 'Unknown date'}
            {item.isExpired ? (
              <Text style={{ color: theme.colors.error }}> • Expired</Text>
            ) : (
              <Text style={{ color: theme.colors.textSecondary }}>
                {' '}
                • {item.daysRemaining || 0} days left
              </Text>
            )}
          </Text>
        </View>
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[
              styles.actionButton,
              {
                backgroundColor: item.decryptionError
                  ? theme.colors.disabled
                  : theme.colors.primary,
              },
              item.decryptionError && styles.actionButtonDisabled,
            ]}
            onPress={() => handleRestore(item)}
            disabled={item.decryptionError}
          >
            <Icon
              name="undo"
              size={16}
              color={
                item.decryptionError
                  ? theme.colors.textSecondary
                  : theme.colors.onPrimary
              }
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.actionButton,
              { backgroundColor: theme.colors.error },
            ]}
            onPress={() => handlePermanentDelete(item)}
          >
            <Icon name="trash" size={16} color={theme.colors.onError} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  // Render empty state
  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Icon
        name="trash"
        size={64}
        color={theme.colors.textSecondary}
        style={styles.emptyIcon}
      />
      <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
        Trash is Empty
      </Text>
      <Text
        style={[styles.emptyDescription, { color: theme.colors.textSecondary }]}
      >
        Deleted passwords will appear here and can be restored within the
        retention period.
      </Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={[styles.loadingText, { color: theme.colors.text }]}>
            Loading deleted passwords...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <View style={styles.errorContainer}>
          <Icon
            name="exclamation-triangle"
            size={64}
            color={theme.colors.error}
          />
          <Text style={[styles.errorText, { color: theme.colors.error }]}>
            {error}
          </Text>
          <Button
            mode="contained"
            onPress={loadDeletedPasswords}
            style={styles.retryButton}
          >
            <Text>Retry</Text>
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {filteredPasswords.length > 0 && (
        <View style={styles.actionHeader}>
          <TouchableOpacity
            style={[
              styles.emptyTrashButton,
              { backgroundColor: theme.colors.errorContainer },
            ]}
            onPress={handleEmptyTrash}
          >
            <Text
              style={[
                styles.emptyTrashText,
                { color: theme.colors.onErrorContainer },
              ]}
            >
              Empty Trash
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {filteredPasswords.length > 0 && (
        <Searchbar
          placeholder="Search deleted passwords..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={[styles.searchBar, { backgroundColor: theme.colors.surface }]}
          inputStyle={{ color: theme.colors.text }}
          iconColor={theme.colors.textSecondary}
          placeholderTextColor={theme.colors.textSecondary}
        />
      )}

      <FlatList
        data={filteredPasswords}
        renderItem={renderDeletedPasswordItem}
        keyExtractor={(item, index) => {
          // Ensure we always have a valid key for FlatList
          return item && item.id
            ? item.id.toString()
            : `deleted_fallback_${index}`;
        }}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
        contentContainerStyle={
          filteredPasswords.length === 0
            ? styles.emptyContainer
            : styles.listContainer
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  actionHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  emptyTrashButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  emptyTrashText: {
    fontSize: 14,
    fontWeight: '600',
  },
  searchBar: {
    margin: 16,
    elevation: 2,
    borderRadius: 8,
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  passwordItem: {
    marginVertical: 4,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.22,
    shadowRadius: 2.22,
  },
  passwordHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  passwordInfo: {
    flex: 1,
  },
  passwordTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  passwordDetails: {
    fontSize: 14,
    marginBottom: 4,
  },
  deletionInfo: {
    fontSize: 12,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    marginVertical: 16,
  },
  retryButton: {
    marginTop: 16,
  },
});

export default TrashScreen;
