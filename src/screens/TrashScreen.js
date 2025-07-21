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
import { useFocusEffect } from '@react-navigation/native';

import vaultService from '../services/vaultService';
import encryptionService from '../services/encryptionService';
import { useTheme } from '../contexts/ThemeContext';

const TrashScreen = ({ navigation }) => {
  const { theme } = useTheme();
  const [deletedPasswords, setDeletedPasswords] = useState([]);
  const [filteredPasswords, setFilteredPasswords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState(null);

  // Load deleted passwords
  const loadDeletedPasswords = useCallback(async () => {
    try {
      setError(null);
      const deletedData = await vaultService.getAllDeletedPasswords();
      
      // Decrypt and process the data
      const decryptedPasswords = await Promise.all(
        deletedData.map(async (item) => {
          try {
            const decryptedPayload = encryptionService.decryptPasswordEntryOptimized(
              { encrypted_payload: JSON.parse(item.encrypted_payload) },
              vaultService.masterPassword
            );

            // Calculate days remaining
            const expiresAt = item.expires_at ? new Date(item.expires_at) : new Date();
            const now = new Date();
            const daysRemaining = Math.max(0, Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24)));

            return {
              ...item,
              ...decryptedPayload,
              daysRemaining,
              isExpired: daysRemaining === 0,
            };
          } catch (decryptError) {
            console.error('Error decrypting deleted password:', decryptError);
            return null;
          }
        })
      );

      const validPasswords = decryptedPasswords.filter(Boolean);
      setDeletedPasswords(validPasswords);
      setFilteredPasswords(validPasswords);
    } catch (err) {
      console.error('Error loading deleted passwords:', err);
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
      const filtered = deletedPasswords.filter((item) =>
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

  // Handle refresh
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadDeletedPasswords();
  }, [loadDeletedPasswords]);

  // Restore password
  const handleRestore = (item) => {
    if (!item || !item.id) {
      Alert.alert('Error', 'Invalid item selected');
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
              await vaultService.restorePasswordFromTrash(item.id);
              await loadDeletedPasswords();
              Alert.alert('Success', 'Password restored successfully');
            } catch (err) {
              console.error('Error restoring password:', err);
              Alert.alert('Error', 'Failed to restore password');
            }
          },
        },
      ]
    );
  };

  // Permanently delete password
  const handlePermanentDelete = (item) => {
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
              Alert.alert('Success', `${deletedCount} items permanently deleted`);
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
    <View style={[styles.passwordItem, { backgroundColor: theme.colors.surface }]}>
      <View style={styles.passwordHeader}>
        <View style={styles.passwordInfo}>
          <Text style={[styles.passwordTitle, { color: theme.colors.text }]}>
            {item.title || 'Untitled'}
          </Text>
          <Text style={[styles.passwordDetails, { color: theme.colors.textSecondary }]}>
            {item.username && `${item.username} • `}
            {item.category_name || 'No Category'}
          </Text>
          <Text style={[styles.deletionInfo, { color: theme.colors.textSecondary }]}>
            Deleted {item.deleted_at ? new Date(item.deleted_at).toLocaleDateString() : 'Unknown date'}
            {item.isExpired ? (
              <Text style={{ color: theme.colors.error }}> • Expired</Text>
            ) : (
              <Text style={{ color: theme.colors.textSecondary }}> • {item.daysRemaining || 0} days left</Text>
            )}
          </Text>
        </View>
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: theme.colors.primary }]}
            onPress={() => handleRestore(item)}
          >
            <Icon name="undo" size={16} color={theme.colors.onPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: theme.colors.error }]}
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
      <Text style={[styles.emptyDescription, { color: theme.colors.textSecondary }]}>
        Deleted passwords will appear here and can be restored within the retention period.
      </Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
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
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={styles.errorContainer}>
          <Icon name="exclamation-triangle" size={64} color={theme.colors.error} />
          <Text style={[styles.errorText, { color: theme.colors.error }]}>{error}</Text>
          <Button mode="contained" onPress={loadDeletedPasswords} style={styles.retryButton}>
            Retry
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Icon name="arrow-left" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
          Trash ({filteredPasswords.length})
        </Text>
        {filteredPasswords.length > 0 && (
          <TouchableOpacity
            style={[styles.emptyTrashButton, { backgroundColor: theme.colors.errorContainer }]}
            onPress={handleEmptyTrash}
          >
            <Text style={[styles.emptyTrashText, { color: theme.colors.onErrorContainer }]}>
              Empty
            </Text>
          </TouchableOpacity>
        )}
      </View>

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
        keyExtractor={(item, index) => item.id?.toString() ?? `deleted_${index}`}
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
          filteredPasswords.length === 0 ? styles.emptyContainer : styles.listContainer
        }
      />
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: 'bold',
    marginLeft: 8,
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