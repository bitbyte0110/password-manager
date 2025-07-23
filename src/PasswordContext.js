import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
} from 'react';

// Context for decrypted passwords
const PasswordContext = createContext();

export const usePasswords = () => useContext(PasswordContext);

export const PasswordProvider = ({ children }) => {
  const [passwords, setPasswords] = useState([]); // decrypted password entries
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load and set passwords (after login/unlock) with optimized loading state
  const loadPasswords = useCallback(
    async loaderFn => {
      // Only show loading if we don't have any passwords yet (avoid flickering)
      if (passwords.length === 0) {
        setLoading(true);
      }
      setError(null);
      try {
        const data = await loaderFn(); // loaderFn should return decrypted passwords
        setPasswords(data);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    },
    [passwords.length]
  );

  // Optimized add, update, delete helpers with batch updates
  const addPassword = useCallback(entry => {
    setPasswords(prev => [entry, ...prev]);
  }, []);

  const updatePassword = useCallback((id, updated) => {
    setPasswords(prev => prev.map(p => (p.id === id ? updated : p)));
  }, []);

  const deletePassword = useCallback(id => {
    setPasswords(prev => prev.filter(p => p.id !== id));
  }, []);

  const clearPasswords = useCallback(() => setPasswords([]), []);

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(
    () => ({
      passwords,
      loading,
      error,
      loadPasswords,
      addPassword,
      updatePassword,
      deletePassword,
      clearPasswords,
    }),
    [
      passwords,
      loading,
      error,
      loadPasswords,
      addPassword,
      updatePassword,
      deletePassword,
      clearPasswords,
    ]
  );

  return (
    <PasswordContext.Provider value={contextValue}>
      {children}
    </PasswordContext.Provider>
  );
};
