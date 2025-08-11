import 'react-native-get-random-values';
let bcryptModule = null;
try {
  // Lazy require to avoid startup crashes if native module is unavailable
  // eslint-disable-next-line no-undef
  bcryptModule = require('react-native-bcrypt');
} catch (e) {
  // Module may not be available in certain environments; proceed without it
  bcryptModule = null;
}

// Ensure bcrypt uses a secure RNG instead of Math.random when available
try {
  const hasCrypto =
    typeof global !== 'undefined' &&
    global.crypto &&
    typeof global.crypto.getRandomValues === 'function';

  if (
    hasCrypto &&
    bcryptModule &&
    typeof bcryptModule.setRandomFallback === 'function'
  ) {
    bcryptModule.setRandomFallback(length => {
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
