import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Linking,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { Button, IconButton, Snackbar } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import Icon from 'react-native-vector-icons/FontAwesome5';
import * as Clipboard from 'expo-clipboard';
import vaultService from '../services/vaultService';
import { useNavigation, useRoute } from '@react-navigation/native';

const PasswordDetailsScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { id } = route.params;

  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });
  const [favorite, setFavorite] = useState(false);
  const [decryptionError, setDecryptionError] = useState(false);

  useEffect(() => {
    fetchEntry();
  }, [id]);

  const fetchEntry = async () => {
    setLoading(true);
    try {
      const data = await vaultService.getPasswordEntry(id);
      setEntry(data);
      setFavorite(!!data.isFavorite);
      setDecryptionError(false);
    } catch (e) {
      setDecryptionError(true);
      setEntry(null);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleFavorite = async () => {
    if (!entry) return;
    try {
      await vaultService.updatePasswordEntry(entry.id, {
        isFavorite: !favorite,
      });
      setFavorite(!favorite);
      setSnackbar({
        visible: true,
        message: !favorite ? 'Marked as favorite' : 'Removed from favorites',
      });
    } catch (e) {
      setSnackbar({ visible: true, message: 'Failed to update favorite' });
    }
  };

  const handleCopy = async value => {
    try {
      await Clipboard.setStringAsync(value);
      setSnackbar({ visible: true, message: 'Copied to clipboard' });
    } catch (e) {
      setSnackbar({ visible: true, message: 'Copy failed' });
    }
  };

  const handleEdit = () => {
    navigation.navigate('EditPasswordScreen', { id });
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Password',
      'Are you sure you want to delete this password?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await vaultService.deletePasswordEntry(id);
              navigation.goBack();
              // Optionally: trigger refresh in parent
            } catch (e) {
              setSnackbar({ visible: true, message: 'Delete failed' });
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (decryptionError || !entry) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>Unable to decrypt entry.</Text>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{ marginTop: 20 }}
        >
          <Text style={{ color: '#8e44ad', fontWeight: 'bold' }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const theme = {
    primary: '#8e44ad',
    secondary: '#3498db',
    card: '#fff',
    text: '#333',
    textSecondary: '#888',
    error: '#e74c3c',
    border: '#e0e0e0',
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
      {/* Gradient Header */}
      <LinearGradient colors={['#9b59b6', '#3498db']} style={styles.header}>
        <TouchableOpacity
          style={styles.headerBack}
          onPress={() => navigation.goBack()}
        >
          <Icon name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {entry.title || 'Password Details'}
        </Text>
        <View style={{ width: 32 }} />
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
        {/* Content Card */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View
              style={[
                styles.categoryIconCircle,
                { backgroundColor: entry.categoryColor || theme.primary },
              ]}
            >
              <Icon
                name={entry.categoryIcon || 'folder'}
                size={28}
                color="#fff"
              />
            </View>
            <TouchableOpacity
              onPress={handleToggleFavorite}
              style={styles.favoriteIcon}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Icon
                name={favorite ? 'star' : 'star-o'}
                size={26}
                color={favorite ? theme.primary : theme.textSecondary}
                solid={favorite}
              />
            </TouchableOpacity>
          </View>

          {/* Field List */}
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Title</Text>
            <Text style={styles.fieldValue}>
              {entry.title || (
                <Text style={styles.errorText}>Unable to decrypt</Text>
              )}
            </Text>
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Username / Email</Text>
            <Text style={styles.fieldValue}>
              {entry.username || (
                <Text style={styles.errorText}>Unable to decrypt</Text>
              )}
            </Text>
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Password</Text>
            <View style={styles.passwordRow}>
              <Text style={styles.fieldValue}>
                {showPassword ? (
                  entry.password || (
                    <Text style={styles.errorText}>Unable to decrypt</Text>
                  )
                ) : entry.password ? (
                  '•'.repeat(10)
                ) : (
                  <Text style={styles.errorText}>Unable to decrypt</Text>
                )}
              </Text>
              <IconButton
                icon={showPassword ? 'eye-off' : 'eye'}
                size={20}
                color={theme.textSecondary}
                onPress={() => setShowPassword(!showPassword)}
                style={{ marginLeft: 0 }}
              />
              <IconButton
                icon="clipboard"
                size={20}
                color={theme.textSecondary}
                onPress={() => handleCopy(entry.password)}
                style={{ marginLeft: -8 }}
              />
            </View>
          </View>

          {entry.url ? (
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Website URL</Text>
              <TouchableOpacity onPress={() => Linking.openURL(entry.url)}>
                <Text
                  style={[
                    styles.fieldValue,
                    { color: theme.secondary, textDecorationLine: 'underline' },
                  ]}
                  numberOfLines={1}
                >
                  {entry.url}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {entry.notes ? (
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Notes</Text>
              <Text style={[styles.fieldValue, { minHeight: 40 }]}>
                {entry.notes}
              </Text>
            </View>
          ) : null}

          <View style={{ marginTop: 16 }}>
            <Text style={styles.timestampText}>
              Created:{' '}
              {entry.createdAt
                ? new Date(entry.createdAt).toLocaleString()
                : '-'}
            </Text>
            <Text style={styles.timestampText}>
              Last Updated:{' '}
              {entry.updatedAt
                ? new Date(entry.updatedAt).toLocaleString()
                : '-'}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Footer Actions */}
      <View style={styles.footerActions}>
        <TouchableOpacity activeOpacity={0.85} onPress={handleEdit}>
          <LinearGradient
            colors={['#9b59b6', '#3498db']}
            style={styles.editButton}
          >
            <Text style={styles.editButtonText}>Edit</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleDelete} style={styles.deleteButton}>
          <Text style={styles.deleteButtonText}>Delete Password</Text>
        </TouchableOpacity>
      </View>

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ visible: false, message: '' })}
        duration={2000}
        style={{ backgroundColor: '#333' }}
      >
        {snackbar.message}
      </Snackbar>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    width: '100%',
    paddingTop: 48,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBack: {
    position: 'absolute',
    left: 20,
    top: 48,
    zIndex: 2,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    flex: 1,
    marginHorizontal: 40,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 24,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  categoryIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favoriteIcon: {
    padding: 8,
  },
  fieldBlock: {
    marginBottom: 18,
  },
  fieldLabel: {
    color: '#888',
    fontWeight: '600',
    fontSize: 14,
    marginBottom: 2,
  },
  fieldValue: {
    color: '#222',
    fontSize: 16,
    marginBottom: 2,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  timestampText: {
    color: '#aaa',
    fontSize: 12,
    marginTop: 2,
  },
  editButton: {
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  editButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteButton: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  deleteButtonText: {
    color: '#e74c3c',
    fontSize: 15,
    fontWeight: '600',
  },
  footerActions: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    padding: 20,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    color: '#888',
    fontSize: 16,
  },
  errorText: {
    color: '#e74c3c',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default PasswordDetailsScreen;
 