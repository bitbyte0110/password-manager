import React, { useEffect, useState } from 'react';
import {
  View,
  FlatList,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { Snackbar, IconButton } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import vaultService from '../services/vaultService';
import { useNavigation, useRoute } from '@react-navigation/native';

const CategoryDetailsScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { categoryId, categoryName, categoryColor, categoryIcon } =
    route.params;

  const [passwords, setPasswords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });

  useEffect(() => {
    fetchPasswords();
  }, [categoryId]);

  const fetchPasswords = async () => {
    setLoading(true);
    try {
      const data = await vaultService.getPasswordsByCategory(categoryId);
      setPasswords(data);
    } catch (error) {
      console.error('Error fetching category passwords:', error);
      setSnackbar({ visible: true, message: 'Error loading passwords' });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordPress = password => {
    navigation.navigate('PasswordDetails', { id: password.id });
  };

  const handleCopyUsername = async username => {
    try {
      await Clipboard.setStringAsync(username || '');
      setSnackbar({ visible: true, message: 'Username copied' });
    } catch (error) {
      setSnackbar({ visible: true, message: 'Copy failed' });
    }
  };

  const handleAddPassword = () => {
    navigation.navigate('AddPassword', { categoryId, categoryName });
  };

  const renderPasswordCard = ({ item }) => {
    if (item.decryptionError) {
      return (
        <TouchableOpacity
          style={[styles.passwordCard, styles.errorCard]}
          onPress={() => handlePasswordPress(item)}
        >
          <View style={styles.cardContent}>
            <View style={styles.cardLeft}>
              <View style={styles.errorIcon}>
                <Icon name="exclamation-triangle" size={16} color="#fff" />
              </View>
              <View style={styles.passwordInfo}>
                <Text style={styles.errorText}>Unable to decrypt</Text>
                <Text style={styles.errorSubtext}>Tap to view details</Text>
              </View>
            </View>
            <Icon name="chevron-right" size={16} color="#888" />
          </View>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        style={styles.passwordCard}
        onPress={() => handlePasswordPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.cardContent}>
          <View style={styles.cardLeft}>
            <View style={styles.passwordInfo}>
              <Text style={styles.passwordTitle} numberOfLines={1}>
                {item.title || 'Untitled'}
              </Text>
              <Text style={styles.passwordUsername} numberOfLines={1}>
                {item.username || 'No username'}
              </Text>
            </View>
          </View>
          <View style={styles.cardRight}>
            <IconButton
              icon="clipboard"
              size={20}
              iconColor="#888"
              onPress={() => handleCopyUsername(item.username)}
              style={styles.copyButton}
            />
            <Icon name="chevron-right" size={16} color="#888" />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Icon name="folder-open" size={64} color="#ccc" />
      <Text style={styles.emptyTitle}>No passwords in this category</Text>
      <Text style={styles.emptySubtitle}>
        Tap the + button to add your first password
      </Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading passwords...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Icon name="arrow-left" size={20} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {categoryName || 'Category'}
        </Text>
        <View style={styles.headerRight} />
      </View>

      {/* Category Info */}
      <View style={styles.categoryInfo}>
        <View
          style={[
            styles.categoryIcon,
            { backgroundColor: categoryColor || '#8e44ad' },
          ]}
        >
          <Icon name={categoryIcon || 'folder'} size={24} color="#fff" />
        </View>
        <Text style={styles.categoryTitle}>{categoryName}</Text>
        <Text style={styles.passwordCount}>
          {passwords.length} {passwords.length === 1 ? 'password' : 'passwords'}
        </Text>
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
            : { paddingBottom: 100 }
        }
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmptyState}
      />

      {/* Floating Action Button */}
      <View style={styles.fabContainer}>
        <TouchableOpacity
          style={styles.fab}
          onPress={handleAddPassword}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={['#9b59b6', '#3498db']}
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
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 20,
  },
  headerRight: {
    width: 28,
  },
  categoryInfo: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  categoryIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  categoryTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  passwordCount: {
    fontSize: 14,
    color: '#888',
  },
  passwordList: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  passwordCard: {
    backgroundColor: '#fff',
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
    color: '#333',
    marginBottom: 4,
  },
  passwordUsername: {
    fontSize: 14,
    color: '#888',
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
    backgroundColor: '#e74c3c',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  errorText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e74c3c',
    marginBottom: 2,
  },
  errorSubtext: {
    fontSize: 14,
    color: '#999',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#888',
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
    color: '#888',
  },
  snackbar: {
    backgroundColor: '#333',
  },
});

export default CategoryDetailsScreen;
