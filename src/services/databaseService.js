import * as SQLite from 'expo-sqlite';
import encryptionService from './encryptionService';

/**
 * Database Service for Password Manager
 * Handles SQLite database operations with encryption support
 */
class DatabaseService {
  constructor() {
    this.db = null;
    this.dbName = 'passwordManager.db';
    this.dbVersion = '1.0';
    this.currentSchemaVersion = 1;
    this.isInitialized = false;
    this.isInitializing = false; // Add initialization lock
    this.initializationPromise = null; // Store the initialization promise
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 second
  }

  /**
   * Database initialization with migration support (alias for initialize)
   * @returns {Promise<boolean>} Initialization success status
   */
  async initDatabase() {
    return await this.initialize();
  }

  /**
   * Execute database operation with retry logic
   * @param {Function} operation - Database operation to execute
   * @param {string} operationName - Name of the operation for logging
   * @returns {Promise<any>} Operation result
   */
  async executeWithRetry(operation, operationName = 'Database operation') {
    let lastError;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        console.warn(
          `${operationName} failed (attempt ${attempt}/${this.maxRetries}):`,
          error.message
        );

        if (attempt < this.maxRetries) {
          await new Promise(resolve =>
            setTimeout(resolve, this.retryDelay * attempt)
          );
        }
      }
    }

    throw new Error(
      `${operationName} failed after ${this.maxRetries} attempts: ${lastError.message}`
    );
  }

  /**
   * Execute operations in a database transaction
   * @param {Function} operations - Function containing database operations
   * @returns {Promise<any>} Transaction result
   */
  async executeTransaction(operations) {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return await this.executeWithRetry(async () => {
      return await this.db.withTransactionAsync(async () => {
        return await operations();
      });
    }, 'Transaction');
  }

  /**
   * Get current database schema version
   * @returns {Promise<number>} Current schema version
   */
  async getDatabaseVersion() {
    try {
      if (!this.db) return 0;

      const result = await this.db.getFirstAsync(
        'SELECT value FROM settings WHERE key = ?',
        ['schema_version']
      );

      return result ? parseInt(result.value) : 0;
    } catch (error) {
      // If settings table doesn't exist, this is version 0
      return 0;
    }
  }

  /**
   * Set database schema version
   * @param {number} version - Schema version to set
   * @returns {Promise<void>}
   */
  async setDatabaseVersion(version) {
    try {
      await this.db.runAsync(
        `INSERT OR REPLACE INTO settings (key, value, value_type)
         VALUES (?, ?, 'number')`,
        ['schema_version', version.toString()]
      );
    } catch (error) {
      console.warn('Could not set database version:', error.message);
    }
  }

  /**
   * Run database migrations
   * @returns {Promise<void>}
   */
  async runMigrations() {
    try {
      const currentVersion = await this.getDatabaseVersion();
      console.log(
        `Current database version: ${currentVersion}, Target version: ${this.currentSchemaVersion}`
      );

      if (currentVersion >= this.currentSchemaVersion) {
        console.log('Database is up to date');
        return;
      }

      // Run migrations in sequence
      for (
        let version = currentVersion + 1;
        version <= this.currentSchemaVersion;
        version++
      ) {
        console.log(`Running migration to version ${version}`);
        await this.runMigration(version);
        await this.setDatabaseVersion(version);
        console.log(`Migration to version ${version} completed`);
      }
    } catch (error) {
      throw new Error(`Migration failed: ${error.message}`);
    }
  }

  /**
   * Run specific migration
   * @param {number} version - Migration version to run
   * @returns {Promise<void>}
   */
  async runMigration(version) {
    switch (version) {
      case 1:
        // Initial schema - already handled by createTables
        break;
      case 2:
        // Future migration example: Add new column
        // await this.db.execAsync('ALTER TABLE passwords ADD COLUMN new_field TEXT;');
        break;
      default:
        console.warn(`No migration defined for version ${version}`);
    }
  }

  /**
   * Initialize database connection and create tables
   * @returns {Promise<boolean>} Initialization success status
   */
  async initialize() {
    // If already initialized, return immediately
    if (this.isInitialized && this.db) {
      console.log('Database already initialized');
      return true;
    }

    // If initialization is in progress, wait for it to complete
    if (this.isInitializing && this.initializationPromise) {
      console.log('Database initialization already in progress, waiting...');
      return await this.initializationPromise;
    }

    // Start initialization
    this.isInitializing = true;
    this.initializationPromise = this.executeWithRetry(async () => {
      if (this.isInitialized && this.db) {
        console.log('Database already initialized (double-check)');
        return true;
      }

      console.log('Starting database initialization...');

      try {
        // Close any existing connection
        if (this.db) {
          await this.db.closeAsync();
          this.db = null;
        }

        // Open database connection
        console.log(`Opening database: ${this.dbName}`);
        this.db = await SQLite.openDatabaseAsync(this.dbName);

        if (!this.db) {
          throw new Error('Failed to open database - connection is null');
        }

        console.log('Database opened successfully, configuring settings...');

        // Configure database settings with null checks
        await this.execAsyncSafe('PRAGMA foreign_keys = ON;');
        await this.execAsyncSafe('PRAGMA journal_mode = WAL;');
        await this.execAsyncSafe('PRAGMA synchronous = NORMAL;');

        console.log('Database settings configured, creating tables...');

        // Create tables
        await this.createTables();

        console.log('Tables created, running migrations...');

        // Run migrations
        await this.runMigrations();

        console.log('Migrations complete, creating indexes...');

        // Create indexes
        await this.createIndexes();

        console.log('Indexes created, inserting default data...');

        // Insert default data
        await this.insertDefaultCategories();

        this.isInitialized = true;
        console.log('Database initialization completed successfully');
        return true;
      } catch (error) {
        console.error('Database initialization failed:', error);
        // Clean up on failure
        if (this.db) {
          try {
            await this.db.closeAsync();
          } catch (closeError) {
            console.error('Error closing database after failure:', closeError);
          }
          this.db = null;
        }
        this.isInitialized = false;
        throw error;
      } finally {
        // Always clean up initialization state
        this.isInitializing = false;
        this.initializationPromise = null;
      }
    }, 'Database initialization');

    try {
      const result = await this.initializationPromise;
      return result;
    } catch (error) {
      // Clean up on error
      this.isInitializing = false;
      this.initializationPromise = null;
      throw error;
    }
  }

  /**
   * Safe execAsync wrapper with null checks and better error handling
   * @param {string} sql - SQL statement to execute
   * @returns {Promise<void>}
   */
  async execAsyncSafe(sql) {
    if (!this.db) {
      throw new Error('Database connection is null - cannot execute SQL');
    }

    try {
      console.log(`Executing SQL: ${sql.substring(0, 50)}...`);
      await this.db.execAsync(sql);
    } catch (error) {
      console.error(`Failed to execute SQL: ${sql.substring(0, 50)}...`, error);
      throw error;
    }
  }

  /**
   * Create all database tables
   * @returns {Promise<void>}
   */
  async createTables() {
    try {
      if (!this.db) {
        throw new Error('Database connection is null in createTables');
      }

      // User authentication table
      await this.execAsyncSafe(`
        CREATE TABLE IF NOT EXISTS user_auth (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          master_password_hash TEXT NOT NULL,
          biometric_enabled INTEGER DEFAULT 0,
          mfa_enabled INTEGER DEFAULT 0,
          auto_lock_timeout INTEGER DEFAULT 300,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Categories table
      await this.execAsyncSafe(`
        CREATE TABLE IF NOT EXISTS categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          description TEXT,
          icon TEXT DEFAULT 'folder',
          color TEXT DEFAULT '#007AFF',
          is_default INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Password entries table (with encrypted fields)
      await this.execAsyncSafe(`
        CREATE TABLE IF NOT EXISTS passwords (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title_encrypted TEXT NOT NULL,
          username_encrypted TEXT,
          password_encrypted TEXT NOT NULL,
          url_encrypted TEXT,
          notes_encrypted TEXT,
          category_id INTEGER,
          is_favorite INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_accessed DATETIME,
          FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE SET NULL
        );
      `);

      // Application settings table
      await this.execAsyncSafe(`
        CREATE TABLE IF NOT EXISTS settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT NOT NULL UNIQUE,
          value TEXT,
          value_type TEXT DEFAULT 'string',
          is_encrypted INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Password history table (for tracking changes)
      await this.execAsyncSafe(`
        CREATE TABLE IF NOT EXISTS password_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          password_id INTEGER NOT NULL,
          old_password_encrypted TEXT NOT NULL,
          changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (password_id) REFERENCES passwords (id) ON DELETE CASCADE
        );
      `);

      // Audit log table (for security tracking)
      await this.execAsyncSafe(`
        CREATE TABLE IF NOT EXISTS audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          action TEXT NOT NULL,
          table_name TEXT,
          record_id INTEGER,
          old_values TEXT,
          new_values TEXT,
          user_agent TEXT,
          ip_address TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      console.log('All tables created successfully');
    } catch (error) {
      throw new Error(`Failed to create tables: ${error.message}`);
    }
  }

  /**
   * Create database indexes for performance
   * @returns {Promise<void>}
   */
  async createIndexes() {
    try {
      const indexes = [
        // Password table indexes
        'CREATE INDEX IF NOT EXISTS idx_passwords_category_id ON passwords (category_id);',
        'CREATE INDEX IF NOT EXISTS idx_passwords_created_at ON passwords (created_at DESC);',
        'CREATE INDEX IF NOT EXISTS idx_passwords_updated_at ON passwords (updated_at DESC);',
        'CREATE INDEX IF NOT EXISTS idx_passwords_is_favorite ON passwords (is_favorite);',
        'CREATE INDEX IF NOT EXISTS idx_passwords_last_accessed ON passwords (last_accessed DESC);',

        // Category table indexes
        'CREATE INDEX IF NOT EXISTS idx_categories_name ON categories (name);',
        'CREATE INDEX IF NOT EXISTS idx_categories_is_default ON categories (is_default);',

        // Settings table indexes
        'CREATE INDEX IF NOT EXISTS idx_settings_key ON settings (key);',

        // Password history indexes
        'CREATE INDEX IF NOT EXISTS idx_password_history_password_id ON password_history (password_id);',
        'CREATE INDEX IF NOT EXISTS idx_password_history_changed_at ON password_history (changed_at DESC);',

        // Audit log indexes
        'CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log (action);',
        'CREATE INDEX IF NOT EXISTS idx_audit_log_table_name ON audit_log (table_name);',
        'CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log (created_at DESC);',
      ];

      if (!this.db) {
        throw new Error('Database connection is null in createIndexes');
      }

      for (const indexQuery of indexes) {
        await this.execAsyncSafe(indexQuery);
      }

      console.log('All indexes created successfully');
    } catch (error) {
      throw new Error(`Failed to create indexes: ${error.message}`);
    }
  }

  /**
   * Insert default categories
   * @returns {Promise<void>}
   */
  async insertDefaultCategories() {
    try {
      if (!this.db) {
        throw new Error(
          'Database connection is null in insertDefaultCategories'
        );
      }

      const defaultCategories = [
        {
          name: 'General',
          description: 'General passwords',
          icon: 'folder',
          color: '#007AFF',
          is_default: 1,
        },
        {
          name: 'Social Media',
          description: 'Social media accounts',
          icon: 'people',
          color: '#FF3B30',
          is_default: 1,
        },
        {
          name: 'Banking',
          description: 'Banking and financial accounts',
          icon: 'card',
          color: '#34C759',
          is_default: 1,
        },
        {
          name: 'Work',
          description: 'Work-related accounts',
          icon: 'briefcase',
          color: '#FF9500',
          is_default: 1,
        },
        {
          name: 'Email',
          description: 'Email accounts',
          icon: 'mail',
          color: '#5856D6',
          is_default: 1,
        },
        {
          name: 'Shopping',
          description: 'Online shopping accounts',
          icon: 'bag',
          color: '#FF2D92',
          is_default: 1,
        },
      ];

      for (const category of defaultCategories) {
        await this.db.runAsync(
          `INSERT OR IGNORE INTO categories (name, description, icon, color, is_default) 
           VALUES (?, ?, ?, ?, ?)`,
          [
            category.name,
            category.description,
            category.icon,
            category.color,
            category.is_default,
          ]
        );
      }

      console.log('Default categories inserted successfully');
    } catch (error) {
      console.error('Failed to insert default categories:', error);
    }
  }

  /**
   * Add a new password entry
   * @param {Object} passwordEntry - Password entry object
   * @param {string} masterPassword - Master password for encryption
   * @returns {Promise<number>} Inserted row ID
   */
  async addPassword(passwordEntry, masterPassword) {
    try {
      if (!this.db) throw new Error('Database not initialized');

      // Encrypt the password entry
      const encryptedEntry = encryptionService.encryptPasswordEntry(
        passwordEntry,
        masterPassword
      );

      const result = await this.db.runAsync(
        `INSERT INTO passwords 
         (title_encrypted, username_encrypted, password_encrypted, url_encrypted, notes_encrypted, category_id, is_favorite)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          JSON.stringify(encryptedEntry.title),
          JSON.stringify(encryptedEntry.username),
          JSON.stringify(encryptedEntry.password),
          JSON.stringify(encryptedEntry.url),
          JSON.stringify(encryptedEntry.notes),
          encryptedEntry.categoryId,
          passwordEntry.isFavorite ? 1 : 0,
        ]
      );

      // Log the action
      await this.logAuditAction(
        'INSERT',
        'passwords',
        result.lastInsertRowId,
        null,
        passwordEntry
      );

      return result.lastInsertRowId;
    } catch (error) {
      throw new Error(`Failed to add password: ${error.message}`);
    }
  }

  /**
   * Get all password entries (encrypted)
   * @returns {Promise<Array>} Array of encrypted password entries
   */
  async getAllPasswords() {
    try {
      if (!this.db) throw new Error('Database not initialized');

      const result = await this.db.getAllAsync(
        `SELECT p.*, c.name as category_name, c.color as category_color
         FROM passwords p
         LEFT JOIN categories c ON p.category_id = c.id
         ORDER BY p.updated_at DESC`
      );

      return result;
    } catch (error) {
      throw new Error(`Failed to get passwords: ${error.message}`);
    }
  }

  /**
   * Get password entries by category
   * @param {number} categoryId - Category ID
   * @returns {Promise<Array>} Array of encrypted password entries
   */
  async getPasswordsByCategory(categoryId) {
    try {
      if (!this.db) throw new Error('Database not initialized');

      const result = await this.db.getAllAsync(
        `SELECT p.*, c.name as category_name, c.color as category_color
         FROM passwords p
         LEFT JOIN categories c ON p.category_id = c.id
         WHERE p.category_id = ?
         ORDER BY p.updated_at DESC`,
        [categoryId]
      );

      return result;
    } catch (error) {
      throw new Error(`Failed to get passwords by category: ${error.message}`);
    }
  }

  /**
   * Update password entry
   * @param {number} id - Password entry ID
   * @param {Object} passwordEntry - Updated password entry object
   * @param {string} masterPassword - Master password for encryption
   * @returns {Promise<boolean>} Update success status
   */
  async updatePassword(id, passwordEntry, masterPassword) {
    try {
      if (!this.db) throw new Error('Database not initialized');

      // Get old entry for audit log
      const oldEntry = await this.getPasswordById(id);

      // Encrypt the updated entry
      const encryptedEntry = encryptionService.encryptPasswordEntry(
        passwordEntry,
        masterPassword
      );

      const result = await this.db.runAsync(
        `UPDATE passwords 
         SET title_encrypted = ?, username_encrypted = ?, password_encrypted = ?, 
             url_encrypted = ?, notes_encrypted = ?, category_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          JSON.stringify(encryptedEntry.title),
          JSON.stringify(encryptedEntry.username),
          JSON.stringify(encryptedEntry.password),
          JSON.stringify(encryptedEntry.url),
          JSON.stringify(encryptedEntry.notes),
          encryptedEntry.categoryId,
          id,
        ]
      );

      // Store password history
      if (oldEntry && oldEntry.password_encrypted) {
        await this.db.runAsync(
          `INSERT INTO password_history (password_id, old_password_encrypted)
           VALUES (?, ?)`,
          [id, oldEntry.password_encrypted]
        );
      }

      // Log the action
      await this.logAuditAction(
        'UPDATE',
        'passwords',
        id,
        oldEntry,
        passwordEntry
      );

      return result.changes > 0;
    } catch (error) {
      throw new Error(`Failed to update password: ${error.message}`);
    }
  }

  /**
   * Delete password entry
   * @param {number} id - Password entry ID
   * @returns {Promise<boolean>} Delete success status
   */
  async deletePassword(id) {
    try {
      if (!this.db) throw new Error('Database not initialized');

      // Get entry for audit log
      const oldEntry = await this.getPasswordById(id);

      const result = await this.db.runAsync(
        'DELETE FROM passwords WHERE id = ?',
        [id]
      );

      // Log the action
      await this.logAuditAction('DELETE', 'passwords', id, oldEntry, null);

      return result.changes > 0;
    } catch (error) {
      throw new Error(`Failed to delete password: ${error.message}`);
    }
  }

  /**
   * Get password entry by ID
   * @param {number} id - Password entry ID
   * @returns {Promise<Object|null>} Password entry or null
   */
  async getPasswordById(id) {
    try {
      if (!this.db) throw new Error('Database not initialized');

      const result = await this.db.getFirstAsync(
        `SELECT p.*, c.name as category_name, c.color as category_color
         FROM passwords p
         LEFT JOIN categories c ON p.category_id = c.id
         WHERE p.id = ?`,
        [id]
      );

      // Update last accessed timestamp
      if (result) {
        await this.db.runAsync(
          'UPDATE passwords SET last_accessed = CURRENT_TIMESTAMP WHERE id = ?',
          [id]
        );
      }

      return result;
    } catch (error) {
      throw new Error(`Failed to get password by ID: ${error.message}`);
    }
  }

  /**
   * Search passwords by title (requires decryption)
   * @param {string} searchTerm - Search term
   * @param {string} masterPassword - Master password for decryption
   * @returns {Promise<Array>} Array of matching password entries
   */
  async searchPasswords(searchTerm, masterPassword) {
    try {
      if (!this.db) throw new Error('Database not initialized');

      // Get all passwords and decrypt for searching
      const allPasswords = await this.getAllPasswords();
      const matchingPasswords = [];

      for (const encryptedPassword of allPasswords) {
        try {
          // Decrypt title for searching
          const titleData = JSON.parse(encryptedPassword.title_encrypted);
          const decryptedTitle = encryptionService.decrypt(
            titleData,
            masterPassword
          );

          if (decryptedTitle.toLowerCase().includes(searchTerm.toLowerCase())) {
            matchingPasswords.push(encryptedPassword);
          }
        } catch (decryptError) {
          // Skip entries that can't be decrypted
          console.warn(
            `Could not decrypt entry ${encryptedPassword.id} for search`
          );
        }
      }

      return matchingPasswords;
    } catch (error) {
      throw new Error(`Failed to search passwords: ${error.message}`);
    }
  }

  /**
   * Create a new password entry with transaction support (alias for addPassword)
   * @param {Object} passwordEntry - Password entry object
   * @param {string} masterPassword - Master password for encryption
   * @returns {Promise<number>} Inserted row ID
   */
  async createPasswordEntry(passwordEntry, masterPassword) {
    return await this.executeTransaction(async () => {
      return await this.addPassword(passwordEntry, masterPassword);
    });
  }

  /**
   * Get all password entries with enhanced error handling (alias for getAllPasswords)
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of encrypted password entries
   */
  async getPasswordEntries(options = {}) {
    return await this.executeWithRetry(async () => {
      const {
        categoryId = null,
        isFavorite = null,
        limit = null,
        offset = 0,
        sortBy = 'updated_at',
        sortOrder = 'DESC',
      } = options;

      if (!this.db) throw new Error('Database not initialized');

      let query = `
        SELECT p.*, c.name as category_name, c.color as category_color, c.icon as category_icon
        FROM passwords p
        LEFT JOIN categories c ON p.category_id = c.id
      `;

      const conditions = [];
      const params = [];

      if (categoryId !== null) {
        conditions.push('p.category_id = ?');
        params.push(categoryId);
      }

      if (isFavorite !== null) {
        conditions.push('p.is_favorite = ?');
        params.push(isFavorite ? 1 : 0);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      // Validate sort column to prevent SQL injection
      const validSortColumns = [
        'created_at',
        'updated_at',
        'last_accessed',
        'id',
      ];
      const validSortBy = validSortColumns.includes(sortBy)
        ? sortBy
        : 'updated_at';
      const validSortOrder = ['ASC', 'DESC'].includes(sortOrder.toUpperCase())
        ? sortOrder.toUpperCase()
        : 'DESC';

      query += ` ORDER BY p.${validSortBy} ${validSortOrder}`;

      if (limit) {
        query += ` LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`;
      }

      const result = await this.db.getAllAsync(query, params);
      return result;
    }, 'Get password entries');
  }

  /**
   * Update password entry with transaction support (enhanced version)
   * @param {number} id - Password entry ID
   * @param {Object} passwordEntry - Updated password entry object
   * @param {string} masterPassword - Master password for encryption
   * @returns {Promise<boolean>} Update success status
   */
  async updatePasswordEntry(id, passwordEntry, masterPassword) {
    return await this.executeTransaction(async () => {
      if (!this.db) throw new Error('Database not initialized');

      // Validate ID
      if (!id || isNaN(id)) {
        throw new Error('Valid password ID is required');
      }

      // Get old entry for audit log and history
      const oldEntry = await this.getPasswordById(id);
      if (!oldEntry) {
        throw new Error(`Password entry with ID ${id} not found`);
      }

      // Encrypt the updated entry
      const encryptedEntry = encryptionService.encryptPasswordEntry(
        passwordEntry,
        masterPassword
      );

      const result = await this.db.runAsync(
        `UPDATE passwords 
         SET title_encrypted = ?, username_encrypted = ?, password_encrypted = ?, 
             url_encrypted = ?, notes_encrypted = ?, category_id = ?, 
             is_favorite = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          JSON.stringify(encryptedEntry.title),
          JSON.stringify(encryptedEntry.username),
          JSON.stringify(encryptedEntry.password),
          JSON.stringify(encryptedEntry.url),
          JSON.stringify(encryptedEntry.notes),
          encryptedEntry.categoryId,
          passwordEntry.isFavorite ? 1 : 0,
          id,
        ]
      );

      if (result.changes === 0) {
        throw new Error('No password entry was updated');
      }

      // Store password history if password changed
      if (
        oldEntry.password_encrypted !== JSON.stringify(encryptedEntry.password)
      ) {
        await this.db.runAsync(
          `INSERT INTO password_history (password_id, old_password_encrypted)
           VALUES (?, ?)`,
          [id, oldEntry.password_encrypted]
        );
      }

      // Log the action
      await this.logAuditAction(
        'UPDATE',
        'passwords',
        id,
        oldEntry,
        passwordEntry
      );

      return true;
    });
  }

  /**
   * Delete password entry with transaction support (enhanced version)
   * @param {number} id - Password entry ID
   * @returns {Promise<boolean>} Delete success status
   */
  async deletePasswordEntry(id) {
    return await this.executeTransaction(async () => {
      if (!this.db) throw new Error('Database not initialized');

      // Validate ID
      if (!id || isNaN(id)) {
        throw new Error('Valid password ID is required');
      }

      // Get entry for audit log
      const oldEntry = await this.getPasswordById(id);
      if (!oldEntry) {
        throw new Error(`Password entry with ID ${id} not found`);
      }

      const result = await this.db.runAsync(
        'DELETE FROM passwords WHERE id = ?',
        [id]
      );

      if (result.changes === 0) {
        throw new Error('No password entry was deleted');
      }

      // Log the action
      await this.logAuditAction('DELETE', 'passwords', id, oldEntry, null);

      return true;
    });
  }

  /**
   * Get password entries by multiple IDs
   * @param {Array<number>} ids - Array of password IDs
   * @returns {Promise<Array>} Array of password entries
   */
  async getPasswordEntriesByIds(ids) {
    return await this.executeWithRetry(async () => {
      if (!this.db) throw new Error('Database not initialized');

      if (!Array.isArray(ids) || ids.length === 0) {
        return [];
      }

      // Validate IDs
      const validIds = ids.filter(id => Number.isInteger(id) && id > 0);
      if (validIds.length === 0) {
        return [];
      }

      const placeholders = validIds.map(() => '?').join(',');
      const result = await this.db.getAllAsync(
        `SELECT p.*, c.name as category_name, c.color as category_color
         FROM passwords p
         LEFT JOIN categories c ON p.category_id = c.id
         WHERE p.id IN (${placeholders})
         ORDER BY p.updated_at DESC`,
        validIds
      );

      return result;
    }, 'Get password entries by IDs');
  }

  /**
   * Bulk update password entries
   * @param {Array<Object>} updates - Array of update objects with id and data
   * @param {string} masterPassword - Master password for encryption
   * @returns {Promise<Array<number>>} Array of updated IDs
   */
  async bulkUpdatePasswordEntries(updates, masterPassword) {
    return await this.executeTransaction(async () => {
      const updatedIds = [];

      for (const update of updates) {
        const { id, ...passwordEntry } = update;
        const success = await this.updatePasswordEntry(
          id,
          passwordEntry,
          masterPassword
        );
        if (success) {
          updatedIds.push(id);
        }
      }

      return updatedIds;
    });
  }

  /**
   * Bulk delete password entries
   * @param {Array<number>} ids - Array of password IDs to delete
   * @returns {Promise<Array<number>>} Array of deleted IDs
   */
  async bulkDeletePasswordEntries(ids) {
    return await this.executeTransaction(async () => {
      const deletedIds = [];

      for (const id of ids) {
        const success = await this.deletePasswordEntry(id);
        if (success) {
          deletedIds.push(id);
        }
      }

      return deletedIds;
    });
  }

  /**
   * Get all categories
   * @returns {Promise<Array>} Array of categories
   */
  async getAllCategories() {
    try {
      if (!this.db) throw new Error('Database not initialized');

      const result = await this.db.getAllAsync(
        `SELECT *, 
         (SELECT COUNT(*) FROM passwords WHERE category_id = categories.id) as password_count
         FROM categories 
         ORDER BY name ASC`
      );

      return result;
    } catch (error) {
      throw new Error(`Failed to get categories: ${error.message}`);
    }
  }

  /**
   * Add new category
   * @param {Object} category - Category object
   * @returns {Promise<number>} Inserted row ID
   */
  async addCategory(category) {
    try {
      if (!this.db) throw new Error('Database not initialized');

      const result = await this.db.runAsync(
        `INSERT INTO categories (name, description, icon, color)
         VALUES (?, ?, ?, ?)`,
        [category.name, category.description, category.icon, category.color]
      );

      return result.lastInsertRowId;
    } catch (error) {
      throw new Error(`Failed to add category: ${error.message}`);
    }
  }

  /**
   * Update category
   * @param {number} id - Category ID
   * @param {Object} category - Updated category object
   * @returns {Promise<boolean>} Update success status
   */
  async updateCategory(id, category) {
    try {
      if (!this.db) throw new Error('Database not initialized');

      const result = await this.db.runAsync(
        `UPDATE categories 
         SET name = ?, description = ?, icon = ?, color = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [category.name, category.description, category.icon, category.color, id]
      );

      return result.changes > 0;
    } catch (error) {
      throw new Error(`Failed to update category: ${error.message}`);
    }
  }

  /**
   * Delete category
   * @param {number} id - Category ID
   * @returns {Promise<boolean>} Delete success status
   */
  async deleteCategory(id) {
    try {
      if (!this.db) throw new Error('Database not initialized');

      // Check if category has passwords
      const passwordCount = await this.db.getFirstAsync(
        'SELECT COUNT(*) as count FROM passwords WHERE category_id = ?',
        [id]
      );

      if (passwordCount.count > 0) {
        throw new Error('Cannot delete category with existing passwords');
      }

      const result = await this.db.runAsync(
        'DELETE FROM categories WHERE id = ?',
        [id]
      );

      return result.changes > 0;
    } catch (error) {
      throw new Error(`Failed to delete category: ${error.message}`);
    }
  }

  /**
   * Enhanced category management with transaction support
   */

  /**
   * Create category with transaction support
   * @param {Object} category - Category object
   * @returns {Promise<number>} Inserted row ID
   */
  async createCategory(category) {
    return await this.executeTransaction(async () => {
      return await this.addCategory(category);
    });
  }

  /**
   * Get categories with enhanced filtering
   * @param {Object} options - Filter options
   * @returns {Promise<Array>} Array of categories
   */
  async getCategories(options = {}) {
    return await this.executeWithRetry(async () => {
      if (!this.db) throw new Error('Database not initialized');

      const {
        includePasswordCount = true,
        sortBy = 'name',
        sortOrder = 'ASC',
      } = options;

      let query = 'SELECT *';

      if (includePasswordCount) {
        query +=
          ', (SELECT COUNT(*) FROM passwords WHERE category_id = categories.id) as password_count';
      }

      query += ' FROM categories';

      const conditions = [];
      const params = [];

      // All categories are now included - removed default category exclusion

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      // Validate sort parameters
      const validSortColumns = ['name', 'created_at', 'updated_at', 'id'];
      const validSortBy = validSortColumns.includes(sortBy) ? sortBy : 'name';
      const validSortOrder = ['ASC', 'DESC'].includes(sortOrder.toUpperCase())
        ? sortOrder.toUpperCase()
        : 'ASC';

      query += ` ORDER BY ${validSortBy} ${validSortOrder}`;

      const result = await this.db.getAllAsync(query, params);
      return result;
    }, 'Get categories');
  }

  /**
   * Update category with validation
   * @param {number} id - Category ID
   * @param {Object} category - Updated category object
   * @returns {Promise<boolean>} Update success status
   */
  async updateCategoryEntry(id, category) {
    return await this.executeTransaction(async () => {
      if (!this.db) throw new Error('Database not initialized');

      // Validate ID
      if (!id || isNaN(id)) {
        throw new Error('Valid category ID is required');
      }

      // Check if category exists
      const existingCategory = await this.db.getFirstAsync(
        'SELECT * FROM categories WHERE id = ?',
        [id]
      );

      if (!existingCategory) {
        throw new Error(`Category with ID ${id} not found`);
      }

      // Check if new name conflicts with existing category (if name is being changed)
      if (category.name && category.name !== existingCategory.name) {
        const nameConflict = await this.db.getFirstAsync(
          'SELECT id FROM categories WHERE name = ? AND id != ?',
          [category.name, id]
        );

        if (nameConflict) {
          throw new Error(`Category name '${category.name}' already exists`);
        }
      }

      const result = await this.db.runAsync(
        `UPDATE categories 
         SET name = ?, description = ?, icon = ?, color = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          category.name || existingCategory.name,
          category.description || existingCategory.description,
          category.icon || existingCategory.icon,
          category.color || existingCategory.color,
          id,
        ]
      );

      if (result.changes === 0) {
        throw new Error('No category was updated');
      }

      return true;
    });
  }

  /**
   * Delete category with enhanced validation
   * @param {number} id - Category ID
   * @param {boolean} forceDelete - Force delete even if passwords exist
   * @returns {Promise<boolean>} Delete success status
   */
  async deleteCategoryEntry(id, forceDelete = false) {
    return await this.executeTransaction(async () => {
      if (!this.db) throw new Error('Database not initialized');

      // Validate ID
      if (!id || isNaN(id)) {
        throw new Error('Valid category ID is required');
      }

      // Check if category exists
      const category = await this.db.getFirstAsync(
        'SELECT * FROM categories WHERE id = ?',
        [id]
      );

      if (!category) {
        throw new Error(`Category with ID ${id} not found`);
      }

      // All categories can be deleted - removed default category restriction

      // Check if category has passwords
      const passwordCount = await this.db.getFirstAsync(
        'SELECT COUNT(*) as count FROM passwords WHERE category_id = ?',
        [id]
      );

      if (passwordCount.count > 0 && !forceDelete) {
        throw new Error(
          `Cannot delete category with ${passwordCount.count} existing passwords. Use forceDelete option to override.`
        );
      }

      // If force delete, set passwords to have no category (NULL)
      if (passwordCount.count > 0 && forceDelete) {
        await this.db.runAsync(
          'UPDATE passwords SET category_id = NULL WHERE category_id = ?',
          [id]
        );
      }

      const result = await this.db.runAsync(
        'DELETE FROM categories WHERE id = ?',
        [id]
      );

      if (result.changes === 0) {
        throw new Error('No category was deleted');
      }

      return true;
    });
  }

  /**
   * Get setting value
   * @param {string} key - Setting key
   * @returns {Promise<any>} Setting value
   */
  async getSetting(key) {
    try {
      if (!this.db) throw new Error('Database not initialized');

      const result = await this.db.getFirstAsync(
        'SELECT value, value_type FROM settings WHERE key = ?',
        [key]
      );

      if (!result) return null;

      // Parse value based on type
      switch (result.value_type) {
        case 'number':
          return parseFloat(result.value);
        case 'boolean':
          return result.value === 'true';
        case 'json':
          return JSON.parse(result.value);
        default:
          return result.value;
      }
    } catch (error) {
      throw new Error(`Failed to get setting: ${error.message}`);
    }
  }

  /**
   * Set setting value
   * @param {string} key - Setting key
   * @param {any} value - Setting value
   * @param {string} valueType - Value type (string, number, boolean, json)
   * @returns {Promise<boolean>} Success status
   */
  async setSetting(key, value, valueType = 'string') {
    try {
      if (!this.db) throw new Error('Database not initialized');

      let stringValue;
      switch (valueType) {
        case 'json':
          stringValue = JSON.stringify(value);
          break;
        case 'boolean':
          stringValue = value ? 'true' : 'false';
          break;
        default:
          stringValue = String(value);
      }

      const result = await this.db.runAsync(
        `INSERT OR REPLACE INTO settings (key, value, value_type, updated_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
        [key, stringValue, valueType]
      );

      return result.changes > 0;
    } catch (error) {
      throw new Error(`Failed to set setting: ${error.message}`);
    }
  }

  /**
   * Log audit action
   * @param {string} action - Action type
   * @param {string} tableName - Table name
   * @param {number} recordId - Record ID
   * @param {Object} oldValues - Old values
   * @param {Object} newValues - New values
   * @returns {Promise<void>}
   */
  async logAuditAction(action, tableName, recordId, oldValues, newValues) {
    try {
      if (!this.db) return;

      await this.db.runAsync(
        `INSERT INTO audit_log (action, table_name, record_id, old_values, new_values)
         VALUES (?, ?, ?, ?, ?)`,
        [
          action,
          tableName,
          recordId,
          oldValues ? JSON.stringify(oldValues) : null,
          newValues ? JSON.stringify(newValues) : null,
        ]
      );
    } catch (error) {
      console.error('Failed to log audit action:', error);
    }
  }

  /**
   * Get database statistics
   * @returns {Promise<Object>} Database statistics
   */
  async getDatabaseStats() {
    try {
      if (!this.db) throw new Error('Database not initialized');

      const passwordCount = await this.db.getFirstAsync(
        'SELECT COUNT(*) as count FROM passwords'
      );
      const categoryCount = await this.db.getFirstAsync(
        'SELECT COUNT(*) as count FROM categories'
      );
      const settingCount = await this.db.getFirstAsync(
        'SELECT COUNT(*) as count FROM settings'
      );

      return {
        passwords: passwordCount.count,
        categories: categoryCount.count,
        settings: settingCount.count,
        isInitialized: this.isInitialized,
      };
    } catch (error) {
      throw new Error(`Failed to get database stats: ${error.message}`);
    }
  }

  /**
   * Close database connection
   * @returns {Promise<void>}
   */
  async close() {
    try {
      if (this.db) {
        console.log('Closing database connection...');
        await this.db.closeAsync();
        this.db = null;
        this.isInitialized = false;
        this.isInitializing = false;
        this.initializationPromise = null;
        console.log('Database connection closed successfully');
      }
    } catch (error) {
      console.error('Failed to close database:', error);
      // Force cleanup even if close failed
      this.db = null;
      this.isInitialized = false;
      this.isInitializing = false;
      this.initializationPromise = null;
    }
  }

  /**
   * Reset database (delete all data)
   * @returns {Promise<boolean>} Reset success status
   */
  async resetDatabase() {
    try {
      if (!this.db) throw new Error('Database not initialized');

      const tables = [
        'passwords',
        'categories',
        'settings',
        'user_auth',
        'password_history',
        'audit_log',
      ];

      for (const table of tables) {
        await this.db.runAsync(`DELETE FROM ${table}`);
      }

      // Reset auto-increment counters
      await this.db.execAsync('DELETE FROM sqlite_sequence');

      // Insert default categories
      await this.insertDefaultCategories();

      console.log('Database reset successfully');
      return true;
    } catch (error) {
      throw new Error(`Failed to reset database: ${error.message}`);
    }
  }

  /**
   * Enhanced settings management
   */

  /**
   * Get multiple settings at once
   * @param {Array<string>} keys - Array of setting keys
   * @returns {Promise<Object>} Object with key-value pairs
   */
  async getSettings(keys) {
    return await this.executeWithRetry(async () => {
      if (!this.db) throw new Error('Database not initialized');

      if (!Array.isArray(keys) || keys.length === 0) {
        return {};
      }

      const placeholders = keys.map(() => '?').join(',');
      const results = await this.db.getAllAsync(
        `SELECT key, value, value_type FROM settings WHERE key IN (${placeholders})`,
        keys
      );

      const settings = {};
      for (const result of results) {
        switch (result.value_type) {
          case 'number':
            settings[result.key] = parseFloat(result.value);
            break;
          case 'boolean':
            settings[result.key] = result.value === 'true';
            break;
          case 'json':
            settings[result.key] = JSON.parse(result.value);
            break;
          default:
            settings[result.key] = result.value;
        }
      }

      return settings;
    }, 'Get settings');
  }

  /**
   * Set multiple settings at once
   * @param {Object} settings - Object with key-value pairs
   * @returns {Promise<boolean>} Success status
   */
  async setSettings(settings) {
    return await this.executeTransaction(async () => {
      const keys = Object.keys(settings);
      for (const key of keys) {
        const value = settings[key];
        let valueType = 'string';

        if (typeof value === 'number') {
          valueType = 'number';
        } else if (typeof value === 'boolean') {
          valueType = 'boolean';
        } else if (typeof value === 'object') {
          valueType = 'json';
        }

        await this.setSetting(key, value, valueType);
      }
      return true;
    });
  }

  /**
   * Delete setting
   * @param {string} key - Setting key to delete
   * @returns {Promise<boolean>} Success status
   */
  async deleteSetting(key) {
    return await this.executeWithRetry(async () => {
      if (!this.db) throw new Error('Database not initialized');

      const result = await this.db.runAsync(
        'DELETE FROM settings WHERE key = ?',
        [key]
      );

      return result.changes > 0;
    }, 'Delete setting');
  }

  /**
   * Database maintenance and utility functions
   */

  /**
   * Vacuum database to reclaim space
   * @returns {Promise<void>}
   */
  async vacuumDatabase() {
    return await this.executeWithRetry(async () => {
      if (!this.db) throw new Error('Database not initialized');

      await this.db.execAsync('VACUUM;');
      console.log('Database vacuum completed');
    }, 'Database vacuum');
  }

  /**
   * Analyze database for query optimization
   * @returns {Promise<void>}
   */
  async analyzeDatabase() {
    return await this.executeWithRetry(async () => {
      if (!this.db) throw new Error('Database not initialized');

      await this.db.execAsync('ANALYZE;');
      console.log('Database analysis completed');
    }, 'Database analysis');
  }

  /**
   * Get database size information
   * @returns {Promise<Object>} Database size information
   */
  async getDatabaseSize() {
    return await this.executeWithRetry(async () => {
      if (!this.db) throw new Error('Database not initialized');

      const pageCount = await this.db.getFirstAsync('PRAGMA page_count;');
      const pageSize = await this.db.getFirstAsync('PRAGMA page_size;');
      const unusedPages = await this.db.getFirstAsync('PRAGMA freelist_count;');

      const totalSize = pageCount.page_count * pageSize.page_size;
      const usedSize =
        totalSize - unusedPages.freelist_count * pageSize.page_size;

      return {
        totalSize,
        usedSize,
        unusedSize: totalSize - usedSize,
        pageCount: pageCount.page_count,
        pageSize: pageSize.page_size,
        unusedPages: unusedPages.freelist_count,
      };
    }, 'Get database size');
  }

  /**
   * Test database connection and basic operations
   * @returns {Promise<Object>} Test results
   */
  async testDatabase() {
    try {
      const results = {
        connection: false,
        read: false,
        write: false,
        transaction: false,
        encryption: false,
        errors: [],
      };

      // Test connection
      if (this.db && this.isInitialized) {
        results.connection = true;
      } else {
        results.errors.push('Database not connected or initialized');
        return results;
      }

      // Test read operation
      try {
        await this.db.getFirstAsync('SELECT 1 as test');
        results.read = true;
      } catch (error) {
        results.errors.push(`Read test failed: ${error.message}`);
      }

      // Test write operation
      try {
        await this.db.runAsync(
          'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
          ['test_key', 'test_value']
        );
        results.write = true;
      } catch (error) {
        results.errors.push(`Write test failed: ${error.message}`);
      }

      // Test transaction
      try {
        await this.executeTransaction(async () => {
          await this.db.runAsync(
            'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
            ['test_transaction', 'test_value']
          );
        });
        results.transaction = true;
      } catch (error) {
        results.errors.push(`Transaction test failed: ${error.message}`);
      }

      // Test encryption integration
      try {
        const testEntry = {
          title: 'Test Entry',
          username: 'test@example.com',
          password: 'testPassword123!',
          categoryId: 1,
        };

        encryptionService.encryptPasswordEntry(testEntry, 'testMasterPassword');
        results.encryption = true;
      } catch (error) {
        results.errors.push(`Encryption test failed: ${error.message}`);
      }

      // Clean up test data
      try {
        await this.db.runAsync('DELETE FROM settings WHERE key LIKE ?', [
          'test_%',
        ]);
      } catch (error) {
        // Ignore cleanup errors
      }

      return results;
    } catch (error) {
      return {
        connection: false,
        read: false,
        write: false,
        transaction: false,
        encryption: false,
        errors: [`Database test failed: ${error.message}`],
      };
    }
  }

  /**
   * Export database data (for backup)
   * Note: Passwords are not exported for security reasons
   * @returns {Promise<Object>} Exported data
   */
  async exportData() {
    return await this.executeWithRetry(async () => {
      if (!this.db) throw new Error('Database not initialized');

      const data = {
        version: this.dbVersion,
        exportDate: new Date().toISOString(),
        categories: await this.getAllCategories(),
        settings: await this.db.getAllAsync('SELECT * FROM settings'),
        passwordCount: 0,
      };

      // Get password count (don't export actual passwords for security)
      const passwordCount = await this.db.getFirstAsync(
        'SELECT COUNT(*) as count FROM passwords'
      );
      data.passwordCount = passwordCount.count;

      return data;
    }, 'Export data');
  }
}

// Export singleton instance
const databaseService = new DatabaseService();
export default databaseService;
