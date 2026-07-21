# SecureVault 🔐

> **An offline-first Android password manager built on a defense-in-depth security architecture to eliminate server-side vulnerabilities.**

Recent research shows that even "Zero Knowledge" cloud password managers can be compromised if their servers are breached. **SecureVault** eliminates server-side risks entirely by keeping all your sensitive data strictly on your local device—encrypted, isolated, and completely offline.

---

##  Core Security Architecture

SecureVault implements a multi-layered defense strategy to protect your credentials at rest, in transit (locally), and in memory.

### Hardened Encryption & Key Derivation
* **AES-256-CBC Encryption:** Encrypts vault payload using unique 128-bit Initialization Vectors (IVs) for every entry.
* **Single Payload Encryption:** Conceals individual item structures to prevent metadata leakage.
* **Layered Master Key Defense:** 
  * `bcrypt` for high-work-factor local authentication.
  * `PBKDF2-SHA-256` key derivation to maximize computational work factor against brute-force attacks.

---

## Leak Prevention & Recovery

* **Auto-Clear Clipboard:** Automatically clears copied credentials after a user-defined timeout (e.g., 30s) to prevent cross-app clipboard sniffing.
* **Inactivity Auto-Lock:** Secures the vault after a designated period of idle time to mitigate physical access risks.
* **Brute-Force Protection:** Triggers an automatic lock out after 3 consecutive failed login attempts.
* **12-Word Recovery Phrase:** BIP-39 style deterministic safety net allowing full vault recovery if the master password is forgotten.

---

##  Key Features

* **Biometric & Multi-Factor Authentication:** Seamless access via Fingerprint or Secure Face Unlock.
* **Productivity Suite:** 
  * Customizable, high-entropy password generator.
  * Real-time password strength and entropy analysis.
  * Quick search and one-tap credential retrieval.
* **Categorized Storage:** Organize entries by custom tags and categories (e.g., *Banking*, *Social*, *Work*).
* **Hardened Import/Export:** Secure device-to-device migration using AES-256 encrypted backup files.
* **Intelligent Trash Bin:** Prevents permanent accidental deletions with customizable retention policies.

---

## Quick Start

### Prerequisites
* [Node.js](https://nodejs.org/) (v16 or higher)
* Android Studio / Android SDK (for mobile emulation or physical device testing)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/bitbyte0110/password-manager.git
   cd password-manager
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run start
   ```

---

## 🤝 Contributing

Feedback and security audits are welcome! Feel free to open an issue or submit a pull request if you spot any potential optimizations or security enhancements.
