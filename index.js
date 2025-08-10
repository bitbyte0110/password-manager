import { registerRootComponent } from 'expo';

// Ensure secure RNG for bcrypt and polyfills are initialized early
import './src/utils/secureRandomSetup';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
