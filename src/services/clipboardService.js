import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Clipboard Service for handling password copying and auto-clear functionality
 */
class ClipboardService {
  constructor() {
    this.clearTimer = null;
    this.lastCopiedContent = null;
    this.clearTimeoutHandle = null;
  }

  /**
   * Copy content to clipboard and set up auto-clear timer
   * @param {string} content - Content to copy to clipboard
   * @param {boolean} isPassword - Whether the content is a password (for auto-clear)
   * @returns {Promise<boolean>} Success status
   */
  async copyToClipboard(content, isPassword = false) {
    try {
      // Clear any existing timer
      this.cancelAutoClear();

      // Copy to clipboard
      await Clipboard.setStringAsync(content);
      console.log('Content copied to clipboard');

      // If it's a password, set up auto-clear timer
      if (isPassword) {
        await this.setupAutoClear(content);
      }

      return true;
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      return false;
    }
  }

  /**
   * Set up auto-clear timer based on user preferences
   * @param {string} copiedContent - The content that was copied
   */
  async setupAutoClear(copiedContent) {
    try {
      // Get user's clipboard timeout preference
      const settings = await AsyncStorage.getItem('userSettings');
      if (!settings) {
        console.log('No user settings found, using default timeout');
        this.scheduleClipboardClear(copiedContent, 30); // Default 30 seconds
        return;
      }

      const parsedSettings = JSON.parse(settings);
      const timeout = parsedSettings.clipboardTimeout !== undefined ? parsedSettings.clipboardTimeout : 30;

      console.log(`Setting up clipboard auto-clear with timeout: ${timeout}s`);

      // If timeout is 0, don't auto-clear
      if (timeout === 0) {
        console.log('Clipboard auto-clear is disabled (timeout = 0)');
        return;
      }

      this.scheduleClipboardClear(copiedContent, timeout);
    } catch (error) {
      console.error('Error setting up clipboard auto-clear:', error);
      // Fallback to default timeout on error
      this.scheduleClipboardClear(copiedContent, 30);
    }
  }

  /**
   * Schedule clipboard clearing with timeout
   * @param {string} contentToClear - Content to verify before clearing
   * @param {number} timeoutSeconds - Timeout in seconds
   */
  scheduleClipboardClear(contentToClear, timeoutSeconds) {
    // Store the content we expect to clear
    this.lastCopiedContent = contentToClear;

    // Clear any existing timer
    if (this.clearTimer) {
      clearTimeout(this.clearTimer);
    }

    console.log(`Clipboard will be cleared in ${timeoutSeconds} seconds`);

    // Set up timer to clear clipboard
    this.clearTimer = setTimeout(async () => {
      await this.clearClipboard();
    }, timeoutSeconds * 1000);
  }

  /**
   * Clear clipboard content if it matches the last copied password
   */
  async clearClipboard() {
    try {
      console.log('Attempting to clear clipboard...');
      
      // Get current clipboard content
      const currentContent = await Clipboard.getStringAsync();
      console.log(`Current clipboard content length: ${currentContent?.length || 0}`);
      console.log(`Expected content length: ${this.lastCopiedContent?.length || 0}`);

      // Only clear if it matches what we copied (to avoid clearing user's other content)
      if (currentContent && this.lastCopiedContent && currentContent === this.lastCopiedContent) {
        // Clear clipboard by setting it to empty string
        await Clipboard.setStringAsync('');
        console.log('✅ Clipboard successfully cleared after timeout');
        
        // Verify clearing worked
        const verifyContent = await Clipboard.getStringAsync();
        if (verifyContent === '') {
          console.log('✅ Clipboard clear verification successful');
        } else {
          console.warn('⚠️ Clipboard may not have been cleared properly, trying again...');
          // Try a different approach - set to a single space then empty
          await Clipboard.setStringAsync(' ');
          await new Promise(resolve => setTimeout(resolve, 100));
          await Clipboard.setStringAsync('');
        }
      } else if (!currentContent || currentContent === '') {
        console.log('Clipboard is already empty');
      } else {
        console.log('Clipboard content has changed since copy, not clearing');
      }

      // Reset state
      this.lastCopiedContent = null;
      this.clearTimer = null;
    } catch (error) {
      console.error('Error clearing clipboard:', error);
      // Reset state even on error
      this.lastCopiedContent = null;
      this.clearTimer = null;
    }
  }

  /**
   * Manually clear the clipboard and cancel any pending timers
   */
  async clearClipboardNow() {
    try {
      // Clear any pending timer
      if (this.clearTimer) {
        clearTimeout(this.clearTimer);
        this.clearTimer = null;
      }

      // Clear clipboard
      await Clipboard.setStringAsync('');
      this.lastCopiedContent = null;

      return true;
    } catch (error) {
      console.error('Error manually clearing clipboard:', error);
      return false;
    }
  }

  /**
   * Cancel any pending auto-clear timer
   */
  cancelAutoClear() {
    if (this.clearTimer) {
      clearTimeout(this.clearTimer);
      this.clearTimer = null;
      console.log('Clipboard auto-clear timer cancelled');
    }
    this.lastCopiedContent = null;
  }

  /**
   * Get current clipboard content
   */
  async getClipboardContent() {
    try {
      return await Clipboard.getStringAsync();
    } catch (error) {
      console.error('Error getting clipboard content:', error);
      return '';
    }
  }
}

// Export singleton instance
const clipboardService = new ClipboardService();
export default clipboardService;
