import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Linking,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { IconButton, Snackbar } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import Icon from 'react-native-vector-icons/FontAwesome5';
import clipboardService from '../services/clipboardService';
import vaultService from '../services/vaultService';
import {
  useNavigation,
  useRoute,
  useFocusEffect,
} from '@react-navigation/native';
import { usePasswords } from '../PasswordContext';
import { useTheme } from '../contexts/ThemeContext';

const PasswordDetailsScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { id } = route.params;
  const { deletePassword } = usePasswords();
  const { theme } = useTheme();

  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });
  const [favorite, setFavorite] = useState(false);
  const [decryptionError, setDecryptionError] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);

  // Only fetch on initial load - avoid redundant focus-based refetching
  useEffect(() => {
    if (!hasInitialized) {
      fetchEntry();
      setHasInitialized(true);
    }
  }, [id, hasInitialized]);

  // Only refresh data when returning from EditPasswordScreen (check route params)
  useFocusEffect(
    useCallback(() => {
      // Only refetch if we're returning from edit screen or explicitly requested
      if (route.params?.shouldRefresh && hasInitialized) {
        fetchEntry();
        // Clear the refresh flag
        navigation.setParams({ shouldRefresh: undefined });
      }
    }, [route.params?.shouldRefresh, hasInitialized])
  );

  const fetchEntry = async () => {
    setLoading(true);
    try {
      console.log('PasswordDetailsScreen: Fetching entry for ID:', id);
      const startTime = Date.now();

      const data = await vaultService.getPasswordEntry(id);

      const endTime = Date.now();
      console.log(
        `PasswordDetailsScreen: Entry fetched in ${endTime - startTime}ms`
      );

      setEntry(data);
      setFavorite(!!data.isFavorite);
      setDecryptionError(false);

      // Update last accessed when viewing password details
      vaultService.updateLastAccessed(id).catch(error => {
        console.warn('Failed to update last accessed for view:', error);
      });
    } catch (e) {
      console.error('PasswordDetailsScreen: Error fetching entry:', e);
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

  const handleCopy = async (value, isPassword = false) => {
    try {
      const success = await clipboardService.copyToClipboard(value, isPassword);
      if (success) {
        setSnackbar({ visible: true, message: 'Copied to clipboard' });

        // Track password access when copying (especially for password field)
        if (isPassword && entry?.id) {
          vaultService.updateLastAccessed(entry.id).catch(error => {
            console.warn('Failed to update last accessed for copy:', error);
          });
        }
      } else {
        setSnackbar({ visible: true, message: 'Copy failed' });
      }
    } catch (e) {
      setSnackbar({ visible: true, message: 'Copy failed' });
    }
  };

  const handleEdit = () => {
    navigation.navigate('EditPasswordScreen', {
      id,
      // Pass current entry data to avoid re-fetching in edit screen
      entryData: entry,
    });
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
              deletePassword(id); // Update context state immediately
              navigation.navigate('MainTabs', {
                screen: 'MyVault',
                params: { shouldRefresh: true },
              });
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
      <View
        style={[
          styles.loadingContainer,
          { backgroundColor: theme.colors.background },
        ]}
      >
        <Text style={[styles.loadingText, { color: theme.colors.text }]}>
          Loading...
        </Text>
      </View>
    );
  }

  if (decryptionError || !entry) {
    return (
      <View
        style={[
          styles.loadingContainer,
          { backgroundColor: theme.colors.background },
        ]}
      >
        <Text style={[styles.errorText, { color: theme.colors.error }]}>
          Unable to decrypt entry.
        </Text>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{ marginTop: 20 }}
        >
          <Text style={{ color: theme.colors.primary, fontWeight: 'bold' }}>
            Go Back
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* Gradient Header */}
      <LinearGradient
        colors={[theme.colors.primary, theme.colors.secondary]}
        style={styles.header}
      >
        <TouchableOpacity
          style={styles.headerBack}
          onPress={() => navigation.goBack()}
        >
          <Icon name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: '#fff' }]} numberOfLines={1}>
          {entry.title || 'Password Details'}
        </Text>
        <View style={{ width: 32 }} />
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
        {/* Content Card */}
        <View style={[styles.card, { backgroundColor: theme.colors.card }]}>
          <View style={styles.cardHeaderRow}>
            <View
              style={[
                styles.categoryIconCircle,
                {
                  backgroundColor: entry.categoryColor || theme.colors.primary,
                },
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
                color={
                  favorite ? theme.colors.primary : theme.colors.textSecondary
                }
                solid={favorite}
              />
            </TouchableOpacity>
          </View>

          {/* Field List */}
          <View style={styles.fieldBlock}>
            <Text
              style={[styles.fieldLabel, { color: theme.colors.textSecondary }]}
            >
              Title
            </Text>
            <Text style={[styles.fieldValue, { color: theme.colors.text }]}>
              {entry.title || (
                <Text style={styles.errorText}>Unable to decrypt</Text>
              )}
            </Text>
          </View>

          <View style={styles.fieldBlock}>
            <Text
              style={[styles.fieldLabel, { color: theme.colors.textSecondary }]}
            >
              Username / Email
            </Text>
            <Text style={[styles.fieldValue, { color: theme.colors.text }]}>
              {entry.username || (
                <Text style={styles.errorText}>Unable to decrypt</Text>
              )}
            </Text>
          </View>

          <View style={styles.fieldBlock}>
            <Text
              style={[styles.fieldLabel, { color: theme.colors.textSecondary }]}
            >
              Password
            </Text>
            <View style={styles.passwordRow}>
              <Text style={[styles.fieldValue, { color: theme.colors.text }]}>
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
                color={theme.colors.textSecondary}
                onPress={() => {
                  setShowPassword(!showPassword);
                  // Track password access when revealing password
                  if (!showPassword && entry?.id) {
                    vaultService.updateLastAccessed(entry.id).catch(error => {
                      console.warn('Failed to update last accessed for reveal:', error);
                    });
                  }
                }}
                style={{ marginLeft: 0 }}
              />
              <IconButton
                icon="clipboard"
                size={20}
                color={theme.textSecondary}
                onPress={() => handleCopy(entry.password, true)}
                style={{ marginLeft: -8 }}
              />
            </View>
          </View>

          {entry.url ? (
            <View style={styles.fieldBlock}>
              <Text
                style={[
                  styles.fieldLabel,
                  { color: theme.colors.textSecondary },
                ]}
              >
                Website URL
              </Text>
              <TouchableOpacity onPress={() => Linking.openURL(entry.url)}>
                <Text
                  style={[
                    styles.fieldValue,
                    {
                      color: theme.colors.text,
                      textDecorationLine: 'underline',
                    },
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
              <Text
                style={[
                  styles.fieldLabel,
                  { color: theme.colors.textSecondary },
                ]}
              >
                Notes
              </Text>
              <Text
                style={[
                  styles.fieldValue,
                  { color: theme.colors.text, minHeight: 40 },
                ]}
              >
                {entry.notes}
              </Text>
            </View>
          ) : null}

          <View style={{ marginTop: 16 }}>
            <Text
              style={[
                styles.timestampText,
                { color: theme.colors.textSecondary },
              ]}
            >
              Created:{' '}
              {entry.createdAt
                ? new Date(entry.createdAt).toLocaleString()
                : '-'}
            </Text>
            <Text
              style={[
                styles.timestampText,
                { color: theme.colors.textSecondary },
              ]}
            >
              Last Updated:{' '}
              {entry.updatedAt
                ? new Date(entry.updatedAt).toLocaleString()
                : '-'}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Footer Actions */}
      <View
        style={[styles.footerActions, { backgroundColor: theme.colors.card }]}
      >
        <TouchableOpacity activeOpacity={0.85} onPress={handleEdit}>
          <LinearGradient
            colors={[theme.colors.primary, theme.colors.secondary]}
            style={styles.editButton}
          >
            <Text style={[styles.editButtonText, { color: '#fff' }]}>Edit</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleDelete} style={styles.deleteButton}>
          <Text
            style={[styles.deleteButtonText, { color: theme.colors.error }]}
          >
            Delete Password
          </Text>
        </TouchableOpacity>
      </View>

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ visible: false, message: '' })}
        duration={2000}
        style={{
          backgroundColor: theme.isDark ? '#1e1e2e' : '#FFFFFF',
        }}
        theme={{
          colors: {
            onSurface: theme.isDark ? '#FFFFFF' : '#000000',
          },
        }}
      >
        <Text style={{ color: theme.isDark ? '#FFFFFF' : '#000000' }}>
          {snackbar.message}
        </Text>
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
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    flex: 1,
    marginHorizontal: 40,
  },
  card: {
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
    fontWeight: '600',
    fontSize: 14,
    marginBottom: 2,
  },
  fieldValue: {
    fontSize: 16,
    marginBottom: 2,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  timestampText: {
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
    fontSize: 16,
    fontWeight: '600',
  },
  deleteButton: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  deleteButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  footerActions: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
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
  },
  loadingText: {
    fontSize: 16,
  },
  errorText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default PasswordDetailsScreen;
