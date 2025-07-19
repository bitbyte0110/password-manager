import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Clipboard Service for handling password copying and auto-clear functionality
 */
class ClipboardService {
  constructor() {
    this.clearTimer = null;
    this.lastCopiedContent = null;
  }

  /**
   * Copy content to clipboard and set up auto-clear timer
   * @param {string} content - Content to copy to clipboard
   * @param {boolean} isPassword - Whether the content is a password (for auto-clear)
   */
  async copyToClipboard(content, isPassword = false) {
    try {
      // Clear any existing timer
      this.cancelAutoClear();

      // Copy to clipboard
      await Clipboard.setStringAsync(content);

      // If it's a password, set up auto-clear timer
      if (isPassword) {
        await this.setupAutoClear();
      }

      return true;
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      return false;
    }
  }

  /**
   * Set up auto-clear timer based on user preferences
   */
  async setupAutoClear() {
    try {
      // Get user's clipboard timeout preference
      const settings = await AsyncStorage.getItem('userSettings');
      if (!settings) return;

      const parsedSettings = JSON.parse(settings);
      const timeout = parsedSettings.clipboardTimeout || 30; // Default 30 seconds

      // If timeout is 0, don't auto-clear
      if (timeout === 0) return;

      // Store the current clipboard content for verification
      this.lastCopiedContent = await Clipboard.getStringAsync();

      // Set up timer to clear clipboard
      this.clearTimer = setTimeout(async () => {
        await this.clearClipboard();
      }, timeout * 1000);
    } catch (error) {
      console.error('Error setting up clipboard auto-clear:', error);
    }
  }

  /**
   * Clear clipboard content if it matches the last copied password
   */
  async clearClipboard() {
    try {
      // Get current clipboard content
      const currentContent = await Clipboard.getStringAsync();

      // Only clear if it matches what we copied (to avoid clearing user's other content)
      if (currentContent === this.lastCopiedContent) {
        await Clipboard.setStringAsync('');
        console.log('Clipboard auto-cleared after timeout');
      }

      // Reset state
      this.lastCopiedContent = null;
      this.clearTimer = null;
    } catch (error) {
      console.error('Error clearing clipboard:', error);
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
