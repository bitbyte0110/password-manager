Project overview
i am building a proect that is a secure password manager application for mobile devices that stores the data on the device n is not linked to the cloud

i will be using:

react native for Cross‑platform mobile framework for Android development, 

expo for React Native toolchain with security modules and faster iteration,

visual studio code for IDE for writing, refactoring, and debugging code,

Javascript as Primary language for application logic,

JSX as Syntax for defining React Native component structure,

SQL for Querying and managing the encrypted SQLite database,

React‑native-crypto-js for AES‑256 encryption for stored credentials,

bcrypt.js for Secure hashing of the master password,

Expo SecureStore for Secure key/value storage for encryption keys and sensitive data,

Expo LocalAuthentication for Fingerprint/biometric authentication with master password fallback,

zxcvbn.js for Real‑time password strength estimation and feedback,

AsyncStorage for Lightweight local storage for non‑sensitive caching,

SQLite as On‑device encrypted database for credential storage,

npm audit for Dependency vulnerability scanning,

ESLint with security rules for Static code analysis to enforce secure coding practices, 

Redux or Context API (for state management across UI components)

React Native Paper / Native Base (UI component libraries)

React Navigation (for screen navigation and routing)

React Native Vector Icons (for UI icons including password visibility toggle)

Custom timeout handlers (for auto-logout functionality)
 



core functionalities

Set Master Password = Show form to set/confirm new master password; validate strength and match before secure storage.

Lockout Protection = After 3 failed master password attempts, the app locks login access and prompts the user to either recover the vault using their 12-word recovery phrase or perform a full data reset. This prevents brute-force attacks and enhances recovery security.
Forgot Master Password – Recovery Phrase Option= Lets users reset their master password using a secure 12-word recovery phrase created during setup. The phrase is hashed using SHA-256 and verified locally without cloud access.
Reset Vault= Allows users to permanently erase all stored data if the master password is forgotten and no recovery phrase is available. Ensures data privacy through full local wipe.
Login = Allow users to log in via master password, biometric, or MFA.

Multi‑Factor Authentication = Upon MFA enabled, require both master password and biometric (or second factor) before granting access.

Lock Vault = Let logged‑in users manually lock vault; confirm action, update last‑access timestamp, then logout.

Add Password Entry = Display entry form (title, username, password, URL, notes); validate and encrypt‑store new entry.

View Password Entry = List stored entries; on toggle, decrypt and show password temporarily.

Edit Password Entry = Pre‑fill form for selected entry; validate changes and update encrypted entry.

Delete Password Entry = Confirm deletion; remove selected entry and update storage.

Search Passwords = Filter stored entries by keyword or account name in real‑time.

Copy Password to Clipboard = Decrypt selected password and copy to clipboard; handle timeout/clear.

Add Category = Input category name, description, icon, color; validate and save new category.

View Category = Display list of categories; on selection, show entries under that category.

Edit Category = Pre‑fill form for selected category; validate and save changes.

Delete Category = Confirm deletion; prevent if in use, otherwise remove category.

Generate Password = Allow users to set criteria (length, charset); generate and display new password.

Change Master Password = Authenticate, then prompt for old and new passwords; validate and update securely.

Configure Auto‑Lock = Authenticate, then enable/disable and set timeout for auto‑lock.

Configure MFA = Authenticate, then enable/disable multi‑factor authentication.

Configure Biometric Login = Authenticate, then enable/disable device‑supported biometric login.

Configure Clipboard Auto‑Clear = Authenticate, then enable/disable and set timeout for clipboard clear.

Change Theme Mode (Dark/Light) = Toggle between dark and light theme; persist user preference.

non-functional requirement
AES‑256 Encryption = Encrypt all vault data at rest and in transit.

MFA + Biometric = Require a second factor (e.g. device biometric) after master password.

Auto‑logout = Automatically sign out users after a short period of inactivity.

 Clipboard Auto‑clear = Clear copied passwords from the clipboard after a brief delay.

 Responsive UI = UI interactions (toggles, taps, modals) should feel instantaneous and snappy.

Smooth List Updates = Filtering and updating lists should feel seamless, even with large datasets.

 Modular Codebase = Separate concerns; use clear naming and documentation.

Accessible Design = Support light/dark themes and ensure UI elements remain legible under typical conditions.

Real‑time Feedback = Provide inline validation and progress indicators where appropriate.


is this work as the intrustion.md in cursor ?or any repeat I can delete, is the non functional request I need to delete