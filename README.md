# AttendanceApp - Secure Offline Attendance System

A React Native application for secure, offline-first attendance marking using Bluetooth Low Energy (BLE) with cryptographic verification.

## Features

- **Offline-First**: Works completely without internet connectivity
- **BLE-Based**: Uses Bluetooth Low Energy for proximity-based attendance
- **Cryptographically Secure**: Ed25519 signatures, AES-GCM encryption, replay protection
- **Rotating PINs**: 30-second rotating PINs prevent credential sharing
- **QR Code Support**: Join sessions by scanning QR codes
- **Anti-Proxy Detection**: Cryptographic verification prevents proxy attendance
- **Signed Receipts**: Faculty-signed attendance receipts with Merkle tree support
- **Cross-Platform**: iOS and Android support

## Architecture

```
AttendanceApp/
├── src/
│   ├── ble/           # BLE protocol (constants, encoder, decoder, scanner, broadcaster)
│   ├── crypto/        # Cryptography (Ed25519, AES-GCM, hashing, Merkle trees, secure storage)
│   ├── storage/       # SQLite database (sessions, attendance, students, sync queue)
│   ├── sessions/      # Session management (creation, PIN rotation, verification)
│   ├── hooks/         # React hooks (useBleScanner, useBleBroadcaster, useAttendanceSession)
│   ├── ui/            # Reusable UI components
│   ├── integrations/  # LMS & Webhook abstractions
│   └── native/        # Native module bridge
├── android/           # Android native module (Kotlin)
├── ios/               # iOS native module (Swift)
└── App.tsx            # Main application
```

## Security Model

### Threat Model
- **Adversary**: Student attempting to mark attendance for another student (proxy attendance)
- **Adversary**: Replaying old attendance proofs
- **Adversary**: Modifying attendance data in transit
- **Adversary**: Impersonating faculty or students

### Protections
1. **Student Identity**: Each student generates an Ed25519 keypair. Private key stored in platform secure storage (iOS Keychain / Android Keystore).
2. **Attendance Proof**: Student signs canonicalized payload containing session ID, student ID, timestamp, nonce, and PIN window.
3. **Replay Protection**: Nonce + timestamp freshness window (±30s) + faculty-side nonce tracking.
4. **Session Authentication**: Rotating 6-digit PINs every 30 seconds, derived from session secret.
5. **Payload Encryption**: Sensitive data encrypted with AES-GCM using session-derived keys.
5. **Faculty Verification**: Full verification pipeline (protocol → session → timestamp → replay → signature → roster).
6. **Signed Receipts**: Faculty signs attendance receipts with their Ed25519 key.

### Limitations
- **BLE Proximity**: BLE signal strength (RSSI) is NOT a reliable physical presence proof. It can be spoofed or relayed.
- **Device Compromise**: If a student's device is compromised (rooted/jailbroken), private keys could be extracted.
- **Clock Synchronization**: Relies on device clocks being roughly synchronized (±30s window).
- **iOS Background**: iOS restricts background BLE operations; app works best in foreground.
- **No Server Trust**: Server-side verification requires trusting the faculty's public key.

## Setup

### Prerequisites
- Node.js >= 22.11.0
- React Native 0.86.2 development environment
- Android Studio / Xcode for native builds

### Installation

```bash
npm install
cd ios && pod install && cd ..
```

### Android Permissions
The app requires:
- `BLUETOOTH_SCAN` (Android 12+)
- `BLUETOOTH_ADVERTISE` (Android 12+)
- `BLUETOOTH_CONNECT` (Android 12+)
- `ACCESS_FINE_LOCATION` (Android < 12)

### iOS Permissions
The app requires:
- `NSBluetoothAlwaysUsageDescription`
- `NSBluetoothPeripheralUsageDescription`
- Background modes: `bluetooth-central`, `bluetooth-peripheral`

## Usage

### Faculty Flow
1. Open app → Select "Faculty"
2. Enter Course ID, Course Name, and Student Roster (one per line)
3. Tap "Start Session" → Generates rotating PIN + QR code
4. Share PIN/QR with students
5. Monitor live verification results
6. Tap "End Session" → Export CSV or Signed Receipt

### Student Flow
1. Open app → Select "Student"
2. First time: Enter Enrollment Number → "Register Identity" (generates Ed25519 keypair)
3. Join session: Scan faculty's QR code OR enter PIN manually
4. Tap "Mark Attendance" → Broadcasts signed attendance proof via BLE
5. Wait for verification confirmation

## BLE Protocol v2

### Service UUID
```
a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

### Advertising Payload (Base64-encoded JSON)
```json
{
  "protocolVersion": 1,
  "payloadVersion": 1,
  "sessionId": "uuid-v4",
  "studentId": "9240118001",
  "pinWindow": 5,
  "timestamp": 1234567890000,
  "nonce": "32-char-hex",
  "signature": "base64url-ed25519-signature",
  "publicKey": "base64url-ed25519-public-key"
}
```

### Scanning
- Filter by service UUID
- Deduplicate by nonce per scan session
- Emit `onAttendanceReceived` with enriched data (RSSI, device address)

## Data Export

### CSV Export
```
Enrollment Number,Status,Timestamp,RSSI,Device Address,Verified
9240118001,present,2024-01-15T10:00:00.000Z,-52,aa:bb:cc:dd:ee:ff,Yes
```

### Signed JSON Receipt
```json
{
  "version": 1,
  "sessionId": "uuid",
  "courseId": "CS101",
  "date": "2024-01-15",
  "attendance": [...],
  "issuedAt": 1234567890000,
  "facultyPublicKey": "base64url",
  "signature": "base64url"
}
```

## Development

### Run Tests
```bash
npm test
```

### Lint
```bash
npm run lint
```

### TypeScript Check
```bash
npx tsc --noEmit
```

### Android Build
```bash
npm run android
```

### iOS Build
```bash
npm run ios
```

## Environment Variables

Create `.env` file (not committed):
```
LMS_BASE_URL=https://lms.example.com
LMS_API_KEY=your-api-key
WEBHOOK_URL=https://your-webhook.com/attendance
WEBHOOK_SECRET=your-webhook-secret
```

## License

MIT License - See LICENSE file for details.