# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Start development server
npm run start

# Start for specific platforms
npm run android
npm run ios
npm run web

# Lint and fix code
npm run lint
npm run lint:fix
```

## Project Architecture

This is a React Native password manager built with Expo that stores encrypted data locally without cloud sync.

### Core Technologies
- **React Native + Expo**: Cross-platform mobile framework
- **SQLite**: Local encrypted database storage via expo-sqlite
- **AES-256 Encryption**: Secure data encryption using crypto-js
- **React Navigation**: Navigation and routing
- **React Native Paper**: UI components and theming

### Security Architecture
- **Master Password**: Uses bcrypt.js for secure hashing with PBKDF2 key derivation
- **AES-256-CBC Encryption**: All sensitive data encrypted with unique IVs and salts
- **Biometric Authentication**: Expo LocalAuthentication for fingerprint/face unlock
- **Auto-Lock**: Configurable timeout-based session management
- **Recovery System**: 12-word recovery phrase for master password reset

### Key Service Files
- `src/services/databaseService.js`: SQLite operations with transaction support and migration system
- `src/services/encryptionService.js`: AES-256 encryption/decryption with PBKDF2 key derivation
- `src/services/vaultService.js`: High-level vault operations combining database and encryption
- `src/services/biometricService.js`: Biometric authentication wrapper
- `src/services/secureStorage.js`: Expo SecureStore wrapper for sensitive data

### Context Architecture
- `src/PasswordContext.js`: React context for decrypted password state management
- `src/contexts/ThemeContext.js`: Theme and appearance state management

### Database Schema
- **passwords**: Stores encrypted password entries with single encrypted payload for performance
- **categories**: Organizes passwords into categories with icons and colors
- **deleted_passwords**: Soft delete implementation with configurable retention
- **settings**: Application configuration and user preferences
- **audit_log**: Security event logging

### Navigation Structure
- Stack Navigator with session-aware routing
- Tab Navigation: MyVault, Categories, PasswordGenerator, Settings
- Authentication flow: SetMasterPassword → Login → MainTabs
- Session management with automatic logout based on inactivity

### Performance Optimizations
- Single encrypted payload per password entry (vs individual field encryption)
- Transaction-based database operations with retry logic
- Context-based state management to avoid prop drilling
- Lazy loading of encrypted data

### Security Features
- Master password strength validation
- Failed login attempt lockout protection
- Clipboard auto-clear functionality
- Memory clearing for sensitive data
- Comprehensive audit logging

### Import/Export System
- JSON-based vault export with encrypted password data
- Vault import with merge or replace options
- Category and settings preservation during import

## Common Development Patterns

### Adding New Encrypted Fields
When adding encrypted fields to password entries, use the optimized single-payload approach in `encryptionService.js` for better performance.

### Database Operations
Always use `databaseService` methods with built-in transaction support and retry logic. Use `executeTransaction()` for multi-step operations.

### Error Handling
The codebase uses comprehensive error handling with detailed error messages. Services throw descriptive errors that bubble up to UI components.

### State Management
Password data is managed through `PasswordContext` to keep decrypted data in memory only when vault is unlocked.