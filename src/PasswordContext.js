import React, { createContext, useContext, useState, useCallback } from 'react';

// Context for decrypted passwords
const PasswordContext = createContext();

export const usePasswords = () => useContext(PasswordContext);

export const PasswordProvider = ({ children }) => {
  const [passwords, setPasswords] = useState([]); // decrypted password entries
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load and set passwords (after login/unlock)
  const loadPasswords = useCallback(async loaderFn => {
    setLoading(true);
    setError(null);
    try {
      const data = await loaderFn(); // loaderFn should return decrypted passwords
      setPasswords(data);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Add, update, delete helpers
  const addPassword = entry => setPasswords(prev => [entry, ...prev]);
  const updatePassword = (id, updated) =>
    setPasswords(prev => prev.map(p => (p.id === id ? updated : p)));
  const deletePassword = id =>
    setPasswords(prev => prev.filter(p => p.id !== id));
  const clearPasswords = () => setPasswords([]);

  return (
    <PasswordContext.Provider
      value={{
        passwords,
        loading,
        error,
        loadPasswords,
        addPassword,
        updatePassword,
        deletePassword,
        clearPasswords,
      }}
    >
      {children}
    </PasswordContext.Provider>
  );
};
