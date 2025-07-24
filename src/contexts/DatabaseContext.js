import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import databaseService from '../services/databaseService';

// Database initialization states
export const DB_STATES = {
  UNINITIALIZED: 'uninitialized',
  INITIALIZING: 'initializing',
  READY: 'ready',
  ERROR: 'error',
};

// Context for database initialization state
const DatabaseContext = createContext();

export const useDatabase = () => {
  const context = useContext(DatabaseContext);
  if (!context) {
    throw new Error('useDatabase must be used within a DatabaseProvider');
  }
  return context;
};

export const DatabaseProvider = ({ children }) => {
  const [dbState, setDbState] = useState(DB_STATES.UNINITIALIZED);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  // Use refs to prevent multiple initialization attempts
  const initializationInProgress = useRef(false);
  const initializationCompleted = useRef(false);

  // Initialize database on mount
  const initializeDatabase = useCallback(async () => {
    // Prevent multiple initialization attempts
    if (initializationInProgress.current || initializationCompleted.current) {
      console.log(
        'DatabaseContext: Initialization already in progress or completed'
      );
      return;
    }

    try {
      console.log('DatabaseContext: Starting database initialization...');
      initializationInProgress.current = true;
      setDbState(DB_STATES.INITIALIZING);
      setError(null);

      // Initialize the database service
      const success = await databaseService.initialize();

      if (success) {
        console.log('DatabaseContext: Database initialized successfully');
        setDbState(DB_STATES.READY);
        initializationCompleted.current = true;
      } else {
        throw new Error('Database initialization returned false');
      }
    } catch (err) {
      console.error('DatabaseContext: Database initialization failed:', err);
      setError(err);
      setDbState(DB_STATES.ERROR);

      // Allow retry attempts
      initializationInProgress.current = false;
    } finally {
      if (dbState !== DB_STATES.ERROR) {
        initializationInProgress.current = false;
      }
    }
  }, [dbState]);

  // Retry database initialization
  const retryInitialization = useCallback(async () => {
    console.log(
      `DatabaseContext: Retrying database initialization (attempt ${retryCount + 1})`
    );
    setRetryCount(prev => prev + 1);

    // Reset state for retry
    initializationInProgress.current = false;
    initializationCompleted.current = false;

    // Wait a bit before retrying
    await new Promise(resolve => setTimeout(resolve, 1000));

    await initializeDatabase();
  }, [initializeDatabase, retryCount]);

  // Auto-initialize on mount
  useEffect(() => {
    initializeDatabase();
  }, [initializeDatabase]);

  // Check if database is ready for operations
  const isDatabaseReady = useMemo(() => {
    return dbState === DB_STATES.READY && databaseService.isInitialized;
  }, [dbState]);

  // Wait for database to be ready (used by components)
  const waitForDatabase = useCallback(async () => {
    return new Promise((resolve, reject) => {
      // If already ready, resolve immediately
      if (isDatabaseReady) {
        resolve();
        return;
      }

      // If in error state, reject
      if (dbState === DB_STATES.ERROR) {
        reject(error || new Error('Database initialization failed'));
        return;
      }

      // Wait for state change
      const checkState = () => {
        if (dbState === DB_STATES.READY && databaseService.isInitialized) {
          resolve();
        } else if (dbState === DB_STATES.ERROR) {
          reject(error || new Error('Database initialization failed'));
        } else {
          // Still initializing, check again in 100ms
          setTimeout(checkState, 100);
        }
      };

      checkState();
    });
  }, [isDatabaseReady, dbState, error]);

  // Execute database operation safely (waits for DB to be ready)
  const executeWithDatabase = useCallback(
    async (operation, operationName = 'Database operation') => {
      try {
        // Wait for database to be ready
        await waitForDatabase();

        // Execute the operation
        return await operation();
      } catch (err) {
        console.error(`DatabaseContext: ${operationName} failed:`, err);

        // If database is not initialized, try to reinitialize
        if (err.message.includes('Database not initialized')) {
          console.log(
            'DatabaseContext: Database not initialized, attempting to reinitialize...'
          );
          await retryInitialization();

          // Try the operation again after reinitialization
          await waitForDatabase();
          return await operation();
        }

        throw err;
      }
    },
    [waitForDatabase, retryInitialization]
  );

  // Get database service instance (only when ready)
  const getDatabaseService = useCallback(() => {
    if (!isDatabaseReady) {
      throw new Error(
        'Database is not ready yet. Use waitForDatabase() first.'
      );
    }
    return databaseService;
  }, [isDatabaseReady]);

  // Reset database (for testing or error recovery)
  const resetDatabase = useCallback(async () => {
    try {
      console.log('DatabaseContext: Resetting database...');
      setDbState(DB_STATES.INITIALIZING);
      setError(null);

      // Reset initialization flags
      initializationInProgress.current = false;
      initializationCompleted.current = false;

      // Close and reinitialize
      if (databaseService.db) {
        await databaseService.db.closeAsync();
        databaseService.db = null;
        databaseService.isInitialized = false;
      }

      await initializeDatabase();
    } catch (err) {
      console.error('DatabaseContext: Failed to reset database:', err);
      setError(err);
      setDbState(DB_STATES.ERROR);
    }
  }, [initializeDatabase]);

  // Context value
  const contextValue = useMemo(
    () => ({
      dbState,
      error,
      retryCount,
      isDatabaseReady,
      isInitializing: dbState === DB_STATES.INITIALIZING,
      hasError: dbState === DB_STATES.ERROR,
      initializeDatabase,
      retryInitialization,
      waitForDatabase,
      executeWithDatabase,
      getDatabaseService,
      resetDatabase,
    }),
    [
      dbState,
      error,
      retryCount,
      isDatabaseReady,
      initializeDatabase,
      retryInitialization,
      waitForDatabase,
      executeWithDatabase,
      getDatabaseService,
      resetDatabase,
    ]
  );

  return (
    <DatabaseContext.Provider value={contextValue}>
      {children}
    </DatabaseContext.Provider>
  );
};
