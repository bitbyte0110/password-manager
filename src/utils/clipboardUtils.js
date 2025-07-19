import clipboardService from '../services/clipboardService';

/**
 * Utility function to copy password to clipboard with auto-clear
 * @param {string} password - Password to copy
 * @param {number} timeoutSeconds - Optional custom timeout in seconds
 * @returns {Promise<boolean>} Success status
 */
export const copyPasswordToClipboard = async (password, timeoutSeconds = null) => {
  if (!password) {
    console.warn('No password provided to copy');
    return false;
  }

  try {
    const success = await clipboardService.copyToClipboard(password, true);
    if (success) {
      console.log('Password copied to clipboard with auto-clear enabled');
    }
    return success;
  } catch (error) {
    console.error('Error copying password to clipboard:', error);
    return false;
  }
};

/**
 * Utility function to copy regular text to clipboard (without auto-clear)
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} Success status
 */
export const copyTextToClipboard = async (text) => {
  if (!text) {
    console.warn('No text provided to copy');
    return false;
  }

  try {
    const success = await clipboardService.copyToClipboard(text, false);
    if (success) {
      console.log('Text copied to clipboard');
    }
    return success;
  } catch (error) {
    console.error('Error copying text to clipboard:', error);
    return false;
  }
};

/**
 * Manually clear the clipboard
 * @returns {Promise<boolean>} Success status
 */
export const clearClipboard = async () => {
  try {
    const success = await clipboardService.clearClipboardNow();
    if (success) {
      console.log('Clipboard manually cleared');
    }
    return success;
  } catch (error) {
    console.error('Error clearing clipboard:', error);
    return false;
  }
};

/**
 * Cancel any pending clipboard auto-clear
 */
export const cancelClipboardAutoClear = () => {
  clipboardService.cancelAutoClear();
};

export default {
  copyPasswordToClipboard,
  copyTextToClipboard,
  clearClipboard,
  cancelClipboardAutoClear,
};