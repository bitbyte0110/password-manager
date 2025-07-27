import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
} from 'react';

// Context for decrypted passwords
const PasswordContext = createContext();

export const usePasswords = () => useContext(PasswordContext);

export const PasswordProvider = ({ children }) => {
  const [passwords, setPasswords] = useState([]); // decrypted password entries
  const [categories, setCategories] = useState([]); // categories with password counts
  const [loading, setLoading] = useState(false);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  // Event listeners for global refresh notifications
  const refreshListeners = useRef(new Set());
  const categoryRefreshListeners = useRef(new Map());

  // Global refresh notification system
  const subscribeToRefresh = useCallback(callback => {
    refreshListeners.current.add(callback);
    return () => refreshListeners.current.delete(callback);
  }, []);

  const notifyGlobalRefresh = useCallback(() => {
    refreshListeners.current.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error('Error in global refresh callback:', error);
      }
    });
  }, []);

  // Load passwords with automatic category refresh
  const loadPasswords = useCallback(
    async (loaderFn, skipGlobalNotify = false) => {
      // Only show loading if we don't have any passwords yet (avoid flickering)
      if (passwords.length === 0) {
        setLoading(true);
      }
      setError(null);
      try {
        const data = await loaderFn(); // loaderFn should return decrypted passwords
        setPasswords(data);
        setLastRefresh(Date.now());

        // Notify all subscribers of the refresh
        if (!skipGlobalNotify) {
          notifyGlobalRefresh();
        }
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    },
    [passwords.length, notifyGlobalRefresh]
  );

  // Load categories with password counts
  const loadCategories = useCallback(async loaderFn => {
    setCategoriesLoading(true);
    try {
      const data = await loaderFn(); // Should return categories with password counts
      setCategories(data);
    } catch (err) {
      console.error('Error loading categories:', err);
    } finally {
      setCategoriesLoading(false);
    }
  }, []);

  // Refresh all data (passwords and categories)
  const refreshAll = useCallback(
    async (passwordLoaderFn, categoryLoaderFn) => {
      try {
        const [passwordsData, categoriesData] = await Promise.all([
          passwordLoaderFn(),
          categoryLoaderFn(),
        ]);

        setPasswords(passwordsData);
        setCategories(categoriesData);
        setLastRefresh(Date.now());
        notifyGlobalRefresh();
      } catch (err) {
        setError(err);
      }
    },
    [notifyGlobalRefresh]
  );

  // Category refresh notification system
  const subscribeToCategoryRefresh = useCallback((categoryId, callback) => {
    const listenerId = `${categoryId}_${Date.now()}_${Math.random()}`;
    if (!categoryRefreshListeners.current.has(categoryId)) {
      categoryRefreshListeners.current.set(categoryId, new Map());
    }
    categoryRefreshListeners.current.get(categoryId).set(listenerId, callback);

    // Return unsubscribe function
    return () => {
      const listeners = categoryRefreshListeners.current.get(categoryId);
      if (listeners) {
        listeners.delete(listenerId);
        if (listeners.size === 0) {
          categoryRefreshListeners.current.delete(categoryId);
        }
      }
    };
  }, []);

  const notifyCategoryRefresh = useCallback(categoryId => {
    const listeners = categoryRefreshListeners.current.get(categoryId);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback();
        } catch (error) {
          console.error('Error in category refresh callback:', error);
        }
      });
    }
  }, []);

  // Enhanced add, update, delete helpers with immediate state updates and global sync
  const addPassword = useCallback(
    async entry => {
      // Optimistically update local state immediately
      setPasswords(prev => [entry, ...prev]);

      // Update category counts
      setCategories(prev =>
        prev.map(cat =>
          cat.id === entry.categoryId
            ? { ...cat, password_count: (cat.password_count || 0) + 1 }
            : cat
        )
      );

      setLastRefresh(Date.now());

      // Notify all refresh listeners immediately
      notifyGlobalRefresh();

      // Notify specific category listeners
      if (entry.categoryId) {
        notifyCategoryRefresh(entry.categoryId);
      }
    },
    [notifyGlobalRefresh, notifyCategoryRefresh]
  );

  const updatePassword = useCallback(
    async (id, updated) => {
      // Get old entry to check if category changed
      let oldCategoryId = null;

      setPasswords(prev => {
        const oldEntry = prev.find(p => p.id === id);
        oldCategoryId = oldEntry?.categoryId;
        return prev.map(p => (p.id === id ? updated : p));
      });

      // Update category counts if category changed
      if (oldCategoryId !== updated.categoryId) {
        setCategories(prev =>
          prev.map(cat => {
            if (cat.id === oldCategoryId) {
              return {
                ...cat,
                password_count: Math.max(0, (cat.password_count || 0) - 1),
              };
            }
            if (cat.id === updated.categoryId) {
              return { ...cat, password_count: (cat.password_count || 0) + 1 };
            }
            return cat;
          })
        );
      }

      setLastRefresh(Date.now());

      // Notify global refresh
      notifyGlobalRefresh();

      // Notify affected categories
      if (oldCategoryId && oldCategoryId !== updated.categoryId) {
        notifyCategoryRefresh(oldCategoryId);
      }
      if (updated.categoryId) {
        notifyCategoryRefresh(updated.categoryId);
      }
    },
    [notifyGlobalRefresh, notifyCategoryRefresh]
  );

  const deletePassword = useCallback(
    async id => {
      let deletedCategoryId = null;

      setPasswords(prev => {
        const deletedEntry = prev.find(p => p.id === id);
        deletedCategoryId = deletedEntry?.categoryId;
        return prev.filter(p => p.id !== id);
      });

      // Update category counts
      if (deletedCategoryId) {
        setCategories(prev =>
          prev.map(cat =>
            cat.id === deletedCategoryId
              ? {
                  ...cat,
                  password_count: Math.max(0, (cat.password_count || 0) - 1),
                }
              : cat
          )
        );
      }

      setLastRefresh(Date.now());

      // Notify global refresh
      notifyGlobalRefresh();

      // Notify category refresh listeners
      if (deletedCategoryId) {
        notifyCategoryRefresh(deletedCategoryId);
      }
    },
    [notifyGlobalRefresh, notifyCategoryRefresh]
  );

  // Get passwords by category from current state (no database call needed)
  const getPasswordsByCategory = useCallback(
    categoryId => {
      return passwords.filter(p => p.categoryId === categoryId);
    },
    [passwords]
  );

  const clearPasswords = useCallback(() => setPasswords([]), []);

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(
    () => ({
      // Password data
      passwords,
      loading,
      error,
      lastRefresh,

      // Category data
      categories,
      categoriesLoading,

      // Core functions
      loadPasswords,
      loadCategories,
      refreshAll,
      addPassword,
      updatePassword,
      deletePassword,
      clearPasswords,
      getPasswordsByCategory,

      // Event system
      subscribeToRefresh,
      subscribeToCategoryRefresh,
      notifyGlobalRefresh,
      notifyCategoryRefresh,
    }),
    [
      passwords,
      loading,
      error,
      lastRefresh,
      categories,
      categoriesLoading,
      loadPasswords,
      loadCategories,
      refreshAll,
      addPassword,
      updatePassword,
      deletePassword,
      clearPasswords,
      getPasswordsByCategory,
      subscribeToRefresh,
      subscribeToCategoryRefresh,
      notifyGlobalRefresh,
      notifyCategoryRefresh,
    ]
  );

  return (
    <PasswordContext.Provider value={contextValue}>
      {children}
    </PasswordContext.Provider>
  );
};
