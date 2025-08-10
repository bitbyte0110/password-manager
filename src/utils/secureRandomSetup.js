import 'react-native-get-random-values';
import bcrypt from 'react-native-bcrypt';

// Ensure bcrypt uses a secure RNG instead of Math.random
try {
  const hasCrypto =
    typeof global !== 'undefined' &&
    global.crypto &&
    typeof global.crypto.getRandomValues === 'function';

  if (hasCrypto && typeof bcrypt?.setRandomFallback === 'function') {
    bcrypt.setRandomFallback(length => {
      const array = new Uint8Array(length);
      global.crypto.getRandomValues(array);
      return array;
    });
  }
} catch (error) {
  // Non-fatal: leave default behavior but log once for diagnostics
  // eslint-disable-next-line no-console
  console.warn('Secure RNG setup for bcrypt failed:', error);
}

export {};
