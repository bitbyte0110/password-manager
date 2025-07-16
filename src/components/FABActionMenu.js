import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  useColorScheme,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';

const FABActionMenu = ({
  visible,
  onClose,
  navigation,
  onAddPassword,
  onAddCategory,
}) => {
  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === 'dark';

  const theme = {
    background: isDarkMode ? '#121212' : '#ffffff',
    surface: isDarkMode ? '#1e1e1e' : '#f5f5f5',
    primary: '#8e44ad',
    secondary: '#3498db',
    text: isDarkMode ? '#ffffff' : '#000000',
    textSecondary: isDarkMode ? '#b0b0b0' : '#666666',
    border: isDarkMode ? '#333333' : '#e0e0e0',
  };

  const handleAddPassword = () => {
    onClose();
    if (onAddPassword) {
      onAddPassword();
    } else {
      navigation.navigate('AddPassword');
    }
  };

  const handleAddCategory = () => {
    onClose();
    if (onAddCategory) {
      onAddCategory();
    } else {
      navigation.navigate('AddCategory');
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={onClose}
        />
        <View
          style={[styles.modalContent, { backgroundColor: theme.background }]}
        >
          <View
            style={[styles.modalHeader, { borderBottomColor: theme.border }]}
          >
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              Add New
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Icon name="times" size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.addOption}
            onPress={handleAddPassword}
            activeOpacity={0.7}
          >
            <View
              style={[styles.addOptionIcon, { backgroundColor: theme.primary }]}
            >
              <Icon name="key" size={20} color="#fff" />
            </View>
            <View style={styles.addOptionContent}>
              <Text style={[styles.addOptionTitle, { color: theme.text }]}>
                Add Password
              </Text>
              <Text
                style={[
                  styles.addOptionSubtitle,
                  { color: theme.textSecondary },
                ]}
              >
                Store a new login credential
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.addOption}
            onPress={handleAddCategory}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.addOptionIcon,
                { backgroundColor: theme.secondary },
              ]}
            >
              <Icon name="folder-plus" size={20} color="#fff" />
            </View>
            <View style={styles.addOptionContent}>
              <Text style={[styles.addOptionTitle, { color: theme.text }]}>
                Add Category
              </Text>
              <Text
                style={[
                  styles.addOptionSubtitle,
                  { color: theme.textSecondary },
                ]}
              >
                Create a new category
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  addOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
  },
  addOptionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addOptionContent: {
    flex: 1,
  },
  addOptionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  addOptionSubtitle: {
    fontSize: 14,
  },
});

export default FABActionMenu;
