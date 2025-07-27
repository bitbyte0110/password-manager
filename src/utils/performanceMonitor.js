/**
 * Performance Monitor - Track and measure performance improvements
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

class PerformanceMonitor {
  constructor() {
    this.measurements = new Map();
    this.isEnabled = __DEV__; // Only track in development
  }

  /**
   * Start performance measurement
   * @param {string} operation - Operation name
   * @returns {string} Measurement ID
   */
  start(operation) {
    if (!this.isEnabled) return null;

    const measurementId = `${operation}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    this.measurements.set(measurementId, {
      operation,
      startTime: performance.now(),
      timestamp: new Date().toISOString(),
    });

    console.log(`🚀 Performance: Started measuring ${operation}`);
    return measurementId;
  }

  /**
   * End performance measurement
   * @param {string} measurementId - Measurement ID from start()
   * @param {Object} metadata - Additional data to store
   * @returns {Object} Performance result
   */
  end(measurementId, metadata = {}) {
    if (!this.isEnabled || !measurementId) return null;

    const measurement = this.measurements.get(measurementId);
    if (!measurement) {
      console.warn(`Performance: Measurement ${measurementId} not found`);
      return null;
    }

    const endTime = performance.now();
    const duration = endTime - measurement.startTime;

    const result = {
      ...measurement,
      endTime,
      duration,
      metadata,
      success: true,
    };

    // Remove from active measurements
    this.measurements.delete(measurementId);

    // Store result
    this.storeResult(result);

    console.log(
      `✅ Performance: ${measurement.operation} completed in ${duration.toFixed(2)}ms`
    );
    return result;
  }

  /**
   * Mark measurement as failed
   * @param {string} measurementId - Measurement ID
   * @param {Error} error - Error that occurred
   */
  fail(measurementId, error) {
    if (!this.isEnabled || !measurementId) return;

    const measurement = this.measurements.get(measurementId);
    if (!measurement) return;

    const endTime = performance.now();
    const duration = endTime - measurement.startTime;

    const result = {
      ...measurement,
      endTime,
      duration,
      success: false,
      error: error.message,
    };

    this.measurements.delete(measurementId);
    this.storeResult(result);

    console.log(
      `❌ Performance: ${measurement.operation} failed after ${duration.toFixed(2)}ms - ${error.message}`
    );
  }

  /**
   * Store performance result
   * @param {Object} result - Performance result
   */
  async storeResult(result) {
    try {
      const key = `perf_${result.operation}_${Date.now()}`;
      await AsyncStorage.setItem(key, JSON.stringify(result));

      // Clean up old results (keep last 50 per operation)
      this.cleanupOldResults(result.operation);
    } catch (error) {
      console.warn('Performance: Failed to store result:', error);
    }
  }

  /**
   * Clean up old performance results
   * @param {string} operation - Operation name
   */
  async cleanupOldResults(operation) {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const perfKeys = allKeys
        .filter(key => key.startsWith(`perf_${operation}_`))
        .sort()
        .reverse();

      // Keep only the last 50 results
      if (perfKeys.length > 50) {
        const keysToDelete = perfKeys.slice(50);
        await AsyncStorage.multiRemove(keysToDelete);
        console.log(
          `Performance: Cleaned up ${keysToDelete.length} old results for ${operation}`
        );
      }
    } catch (error) {
      console.warn('Performance: Cleanup failed:', error);
    }
  }

  /**
   * Get performance summary for an operation
   * @param {string} operation - Operation name
   * @returns {Promise<Object>} Performance summary
   */
  async getSummary(operation) {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const perfKeys = allKeys.filter(key =>
        key.startsWith(`perf_${operation}_`)
      );

      if (perfKeys.length === 0) {
        return { operation, count: 0, averageTime: 0, successRate: 0 };
      }

      const results = await AsyncStorage.multiGet(perfKeys);
      const measurements = results
        .map(([, value]) => JSON.parse(value))
        .filter(result => result.success)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      const recentMeasurements = measurements.slice(0, 20); // Last 20 measurements
      const totalDuration = recentMeasurements.reduce(
        (sum, m) => sum + m.duration,
        0
      );
      const averageTime = totalDuration / recentMeasurements.length;
      const successCount = measurements.filter(m => m.success).length;
      const successRate = (successCount / measurements.length) * 100;

      return {
        operation,
        count: measurements.length,
        averageTime: averageTime.toFixed(2),
        successRate: successRate.toFixed(1),
        recentMeasurements: recentMeasurements.slice(0, 5), // Last 5 for details
      };
    } catch (error) {
      console.error('Performance: Failed to get summary:', error);
      return { operation, count: 0, averageTime: 0, successRate: 0 };
    }
  }

  /**
   * Track password reset performance
   * @param {Function} operation - Operation to measure
   * @returns {Promise<any>} Operation result
   */
  async trackPasswordReset(operation) {
    const measurementId = this.start('password_reset');

    try {
      const result = await operation();
      this.end(measurementId, { success: true });
      return result;
    } catch (error) {
      this.fail(measurementId, error);
      throw error;
    }
  }

  /**
   * Track login performance
   * @param {Function} operation - Operation to measure
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<any>} Operation result
   */
  async trackLogin(operation, metadata = {}) {
    const measurementId = this.start('login');

    try {
      const result = await operation();
      this.end(measurementId, { ...metadata, success: true });
      return result;
    } catch (error) {
      this.fail(measurementId, error);
      throw error;
    }
  }

  /**
   * Track vault loading performance
   * @param {Function} operation - Operation to measure
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<any>} Operation result
   */
  async trackVaultLoading(operation, metadata = {}) {
    const measurementId = this.start('vault_loading');

    try {
      const result = await operation();
      this.end(measurementId, {
        ...metadata,
        entryCount: result?.length || 0,
        success: true,
      });
      return result;
    } catch (error) {
      this.fail(measurementId, error);
      throw error;
    }
  }

  /**
   * Track encryption/decryption performance
   * @param {Function} operation - Operation to measure
   * @param {string} type - 'encrypt' or 'decrypt'
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<any>} Operation result
   */
  async trackEncryption(operation, type = 'encrypt', metadata = {}) {
    const measurementId = this.start(`encryption_${type}`);

    try {
      const result = await operation();
      this.end(measurementId, { ...metadata, type, success: true });
      return result;
    } catch (error) {
      this.fail(measurementId, error);
      throw error;
    }
  }

  /**
   * Get all performance summaries
   * @returns {Promise<Object>} All performance summaries
   */
  async getAllSummaries() {
    const operations = [
      'password_reset',
      'login',
      'vault_loading',
      'encryption_encrypt',
      'encryption_decrypt',
    ];

    const summaries = {};
    for (const operation of operations) {
      summaries[operation] = await this.getSummary(operation);
    }

    return summaries;
  }

  /**
   * Clear all performance data
   */
  async clearAllData() {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const perfKeys = allKeys.filter(key => key.startsWith('perf_'));

      if (perfKeys.length > 0) {
        await AsyncStorage.multiRemove(perfKeys);
        console.log(
          `Performance: Cleared ${perfKeys.length} performance records`
        );
      }
    } catch (error) {
      console.error('Performance: Failed to clear data:', error);
    }
  }
}

// Export singleton instance
const performanceMonitor = new PerformanceMonitor();
export default performanceMonitor;
