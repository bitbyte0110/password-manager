import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';

const AboutScreen = () => {
  const navigation = useNavigation();
  const { theme } = useTheme();

  const appInfo = {
    name: 'SecureVault',
    version: '1.0.0',
    build: '100',
    description:
      'A secure password manager that keeps your credentials safe on your device.',
  };

  const renderInfoCard = (title, content, icon) => (
    <View style={[styles.infoCard, { backgroundColor: theme.colors.card }]}>
      <View style={styles.cardHeader}>
        <View
          style={[styles.cardIcon, { backgroundColor: theme.colors.primary + '20' }]}
        >
          <Icon name={icon} size={20} color={theme.colors.primary} />
        </View>
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{title}</Text>
      </View>
      <Text style={[styles.cardContent, { color: theme.colors.textSecondary }]}>
        {content}
      </Text>
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Icon name="arrow-left" size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>About</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          {/* App Icon and Name */}
          <View style={styles.appHeaderSection}>
            <View style={[styles.appIcon, { backgroundColor: theme.colors.primary }]}>
              <Icon name="shield-alt" size={32} color="#ffffff" />
            </View>
            <Text style={[styles.appName, { color: theme.colors.text }]}>
              {appInfo.name}
            </Text>
            <Text
              style={[styles.appDescription, { color: theme.colors.textSecondary }]}
            >
              {appInfo.description}
            </Text>
          </View>

          {/* Version Information */}
          {renderInfoCard(
            'Version Information',
            `Version ${appInfo.version} (Build ${appInfo.build})`,
            'tag'
          )}

          {/* Security Features */}
          {renderInfoCard(
            'Security Features',
            'AES-256 encryption, biometric authentication, auto-lock, and secure local storage protect your data.',
            'shield-alt'
          )}

          {/* Privacy */}
          {renderInfoCard(
            'Privacy First',
            'All your data is stored locally on your device. We never collect, transmit, or store your passwords.',
            'user-shield'
          )}

          {/* Open Source Notice */}
          <View style={[styles.footerSection, { backgroundColor: theme.colors.card }]}>
            <Icon name="heart" size={18} color={theme.colors.primary} />
            <Text style={[styles.footerText, { color: theme.colors.textSecondary }]}>
              Built with security and privacy in mind
            </Text>
          </View>

          {/* Technical Info */}
          <View style={styles.technicalInfo}>
            <Text style={[styles.technicalTitle, { color: theme.colors.text }]}>
              Technical Information
            </Text>
            <View style={styles.technicalList}>
              <View style={styles.technicalItem}>
                <Text
                  style={[
                    styles.technicalLabel,
                    { color: theme.colors.textSecondary },
                  ]}
                >
                  Platform:
                </Text>
                <Text style={[styles.technicalValue, { color: theme.colors.text }]}>
                  React Native
                </Text>
              </View>
              <View style={styles.technicalItem}>
                <Text
                  style={[
                    styles.technicalLabel,
                    { color: theme.colors.textSecondary },
                  ]}
                >
                  Encryption:
                </Text>
                <Text style={[styles.technicalValue, { color: theme.colors.text }]}>
                  AES-256
                </Text>
              </View>
              <View style={styles.technicalItem}>
                <Text
                  style={[
                    styles.technicalLabel,
                    { color: theme.colors.textSecondary },
                  ]}
                >
                  Storage:
                </Text>
                <Text style={[styles.technicalValue, { color: theme.colors.text }]}>
                  SQLite + Secure Storage
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
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
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  headerRight: {
    width: 44,
  },
  scrollContainer: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  appHeaderSection: {
    alignItems: 'center',
    paddingVertical: 32,
    marginBottom: 24,
  },
  appIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  appName: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  appDescription: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  infoCard: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  cardContent: {
    fontSize: 14,
    lineHeight: 20,
    marginLeft: 48,
  },
  footerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    borderRadius: 12,
    marginVertical: 24,
    gap: 8,
  },
  footerText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  technicalInfo: {
    marginTop: 8,
  },
  technicalTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  technicalList: {
    gap: 12,
  },
  technicalItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  technicalLabel: {
    fontSize: 14,
    width: 80,
  },
  technicalValue: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
});

export default AboutScreen;
