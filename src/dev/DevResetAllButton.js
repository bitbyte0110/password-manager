import React from 'react';
import { View, Button, Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
// If you use SQLite, uncomment the next line and configure as needed:
// import SQLite from 'react-native-sqlite-storage';

const DEV_KEYS = ['vault_masterHash', 'vault_recoveryHash'];

async function clearSecureStore() {
  await Promise.all(DEV_KEYS.map(key => SecureStore.deleteItemAsync(key)));
}

async function clearAsyncStorage() {
  await AsyncStorage.clear();
}

// Optionally clear all tables/records from the SQLite vault database
async function clearSQLiteVault() {
  // Uncomment and adapt this section if you use SQLite for your vault
  /*
  const db = SQLite.openDatabase({ name: 'vault.db', location: 'default' });
  await new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql('SELECT name FROM sqlite_master WHERE type="table";', [], (tx, results) => {
        const tableNames = [];
        for (let i = 0; i < results.rows.length; i++) {
          const name = results.rows.item(i).name;
          if (name !== 'sqlite_sequence') tableNames.push(name);
        }
        tableNames.forEach(table => {
          tx.executeSql(`DELETE FROM ${table}`);
        });
        resolve();
      });
    }, reject);
  });
  */
}

async function handleReset(onReset) {
  try {
    await clearSecureStore();
    await clearAsyncStorage();
    await clearSQLiteVault();
    Alert.alert('All local app data has been cleared.');
    if (typeof onReset === 'function') {
      onReset();
    }
  } catch (e) {
    Alert.alert('Error', 'Failed to clear all data.');
  }
}

const DevResetAllButton = ({ onReset }) => {
  if (!__DEV__) return null;
  return (
    <View style={{ margin: 16 }}>
      <Button
        title="[DEV] Reset All Local Data"
        color="#e74c3c"
        onPress={() => handleReset(onReset)}
      />
    </View>
  );
};

export default DevResetAllButton;
