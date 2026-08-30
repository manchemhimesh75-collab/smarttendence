# Architecture Documentation

## System Overview

AttendanceApp is a React Native application for secure, offline-first attendance marking using Bluetooth Low Energy (BLE) with cryptographic verification.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AttendanceApp                                │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │
│  │   Faculty   │  │   Student   │  │  Database   │  │  Native   │  │
│  │   Screen    │  │   Screen    │  │  (SQLite)   │  │  Modules  │  │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────┬─────┘  │
│         │                │                │              │        │
│         └────────────────┼────────────────┼──────────────┘        │
│                          ▼                ▼                       │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                    React Native Bridge                       │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                          │                │                       │
│         ┌────────────────┼────────────────┼──────────────┐        │
│         ▼                ▼                ▼                ▼        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │
│  │   Android   │  │     iOS     │  │  Crypto     │  │  Network  │  │
│  │  (Kotlin)   │  │  (Swift)    │  │  (WebCrypto)│  │  (Fetch)  │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └───────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## Module Architecture

### 1. BLE Protocol (`src/ble/`)
```
ble/
├── constants.ts     # Protocol constants, status codes, UUIDs
├── protocol.ts      # TypeScript interfaces for payloads, sessions, proofs
├── encoder.ts       # Payload encoding (JSON → Base64URL)
├── decoder.ts       # Payload decoding (Base64URL → JSON + validation)
├── scanner.ts       # Scanner interface & config
├── broadcaster.ts   # Broadcaster interface & config
└── index.ts         # Barrel exports
```

**Key Design Decisions:**
- Dedicated 128-bit Service UUID (not 0xFFFF manufacturer ID)
- Base64URL-encoded JSON payloads (self-describing, extensible)
- Strict validation at decode time (fail closed)
- Separate encoder/decoder for testability

### 2. Cryptography (`src/crypto/`)
```
crypto/
├── keys.ts           # Key generation, encoding, Web Crypto wrappers
├── signatures.ts     # Ed25519 sign/verify for attendance proofs
├── encryption.ts     # AES-GCM session payload encryption
├── hashing.ts        # Canonicalization, SHA-256, Merkle trees
├── secureStorage.ts  # Platform secure storage abstraction
├── merkle.ts         # Merkle tree construction & proofs
└── index.ts          # Barrel exports
```

**Key Design Decisions:**
- Web Crypto API (standard, audited, hardware-backed where available)
- Platform secure storage (Keychain/Keystore) for private keys
- Deterministic canonicalization for signature verification
- AES-GCM with unique IVs per message
- Merkle trees for batch receipt verification

### 3. Storage (`src/storage/`)
```
storage/
├── database.ts           # SQLite initialization & migration
├── sessionsRepository.ts # Session CRUD
├── attendanceRepository.ts # Attendance record CRUD
├── studentsRepository.ts  # Student identity CRUD
├── syncQueue.ts          # Offline sync queue with retry logic
└── index.ts              # Barrel exports
```

**Key Design Decisions:**
- SQLite via `react-native-quick-sqlite` (fast, synchronous API)
- Separate tables for sessions, attendance, students, sync queue
- Idempotency keys for deduplication
- Status tracking: pending → syncing → synced/failed

### 4. Sessions (`src/sessions/`)
```
sessions/
├── sessionTypes.ts     # TypeScript interfaces
├── sessionManager.ts   # Session lifecycle, PIN rotation, verification
└── index.ts            # Barrel exports
```

**Key Design Decisions:**
- Singleton `sessionManager` with reactive state (pub/sub)
- PIN rotation: time-based windows derived from session start
- Verification pipeline: protocol → session → timestamp → replay → signature → roster
- QR session data for easy joining

### 5. Hooks (`src/hooks/`)
```
hooks/
├── useBleScanner.ts       # Faculty scanning + verification
├── useBleBroadcaster.ts   # Student broadcasting + PIN tracking
├── useAttendanceSession.ts # Session management
└── index.ts               # Barrel exports
```

**Key Design Decisions:**
- Encapsulate native module complexity
- Reactive state via sessionManager subscription
- Automatic PIN window tracking
- Error handling with user-friendly messages

### 6. UI Components (`src/ui/`)
```
ui/
├── PinCard.tsx           # Rotating PIN display with progress bar
├── StudentList.tsx       # Attendance records with status badges
├── SessionCard.tsx       # Session summary card
├── AttendanceStatus.tsx  # Student status with animations
└── index.ts              # Barrel exports
```

### 7. Integrations (`src/integrations/`)
```
integrations/
├── lms.ts      # LMS sync abstraction (Canvas, Moodle, etc.)
├── webhook.ts  # Webhook delivery with retries & signatures
└── index.ts    # Barrel exports
```

### 8. Native Modules (`src/native/`)
```
native/
├── NativeModules.ts  # JS bridge to native BLE modules
├── types.ts          # TypeScript interfaces for native methods
└── index.ts          # Barrel exports
```

## Data Flow

### Faculty Creates Session
```
1. User enters course info + roster
2. sessionManager.createSession() 
   → Generates sessionId, startTime, PIN windows
   → Stores in SQLite
   → Starts PIN rotation timer
3. Faculty UI shows PinCard with current PIN + QR code
4. useBleScanner.startScanning() → Native module starts BLE scan
```

### Student Marks Attendance
```
1. Student registers (first time):
   → generateStudentKeyPair() → Ed25519 keypair
   → Private key → secure storage
   → Public key → local DB + QR code for faculty
2. Student joins session:
   → Scan QR (gets sessionId + sessionToken) OR enter PIN manually
3. Student taps "Mark Attendance":
   → getCurrentPin() → pinWindow
   → getStudentPrivateKey() → privateKey
   → createStudentAttendanceProof() → signs canonical payload
   → useBleBroadcaster.startBroadcasting() → Native module advertises
```

### Faculty Receives Attendance
```
1. Native scanner receives advertisement
2. Decodes service data (Base64URL JSON)
3. Validates payload structure
4. Deduplicates by nonce
5. Emits onAttendanceReceived event
6. useBleScanner listener:
   → sessionManager.verifyAttendance()
   → Full verification pipeline
   → Saves AttendanceRecord to SQLite
   → Updates UI with verification result
```

### Session End & Export
```
1. Faculty taps "End Session"
2. sessionManager.endSession() → status = 'completed'
3. Export options:
   a) CSV: Direct share
   b) Signed Receipt: 
      → createSignedReceipt()
      → Canonicalize attendance records
      → Faculty Ed25519 sign
      → Share JSON
```

## Native Module Interface

### Android (Kotlin)
```kotlin
// BLEBroadcasterModule
startBroadcasting(payloadJson: String): Promise
stopBroadcasting(): Promise
startScanning(): Promise
stopScanning(): Promise

// Events emitted:
onAttendanceReceived(JSONObject)  // Enriched with rssi, deviceAddress
onScanError({error, code})
onBluetoothStateChange({state})
```

### iOS (Swift)
```swift
// BLEBroadcasterModule
startBroadcasting(payloadJson: String, resolve, reject)
stopBroadcasting(resolve, reject)
startScanning(resolve, reject)
stopScanning(resolve, reject)

// Events emitted:
onAttendanceReceived([String: Any])
onScanError([String: Any])
onBluetoothStateChange([String: Any])
```

## State Management

```
sessionManager (singleton)
├── currentSession: SessionInfo | null
├── sessionState: 'idle' | 'creating' | 'active' | 'completed' | 'cancelled' | 'error'
├── pinWindows: PinWindow[]
├── currentPinWindow: number
├── seenNonces: Set<string>
└── subscribers: Set<(state) => void>
```

React components subscribe via `useAttendanceSession()` hook.

## Security Boundaries

```
┌──────────────────────────────────────────────────────────────┐
│                      Trusted Code Base                        │
├──────────────────────────────────────────────────────────────┤
│  React Native JS Bundle (signed, integrity-checked)          │
│  ├── Session Manager (verification logic)                    │
│  ├── Crypto Module (sign/verify/encrypt)                     │
│  └── Storage Layer (SQLite + secure storage)                 │
├──────────────────────────────────────────────────────────────┤
│  Native Modules (Kotlin/Swift)                               │
│  ├── BLE Advertising (untrusted radio)                       │
│  ├── BLE Scanning (untrusted radio)                          │
│  └── Secure Storage (Keychain/Keystore)                      │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                      Untrusted Environment                    │
├──────────────────────────────────────────────────────────────┤
│  BLE Radio (2.4 GHz ISM band)                                │
│  - Advertisements can be spoofed, relayed, jammed            │
│  - RSSI cannot be trusted for distance                       │
│  - Device addresses can be randomized/spoofed                │
└──────────────────────────────────────────────────────────────┘
```

## Offline-First Design

### Local-First Operations
- All attendance operations work offline
- SQLite database persists everything locally
- No network required for core functionality

### Sync Queue
```
Attendance Record Created
         │
         ▼
┌─────────────────┐
│  SQLite         │
│  attendance_    │
│  records        │
│  (synced=0)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  sync_queue     │
│  (pending)      │
└────────┬────────┘
         │
         ▼ (when online)
┌─────────────────┐
│  Background     │
│  Sync Worker    │
│  - LMS API      │
│  - Webhook      │
│  - Idempotent   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Mark synced=1  │
│  Cleanup old    │
└─────────────────┘
```

### Conflict Resolution
- Attendance identified by `sessionId + studentId` (stable composite key)
- Duplicate submissions: first wins, subsequent rejected by nonce tracking
- Sync retries: exponential backoff, max 5 retries
- Idempotency keys prevent duplicate server-side records

## Deployment Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Student   │     │   Faculty   │     │   Faculty   │
│   Device    │     │   Device    │     │   Backend   │
│  (Android/  │     │  (Android/  │     │  (Optional) │
│   iOS)      │     │   iOS)      │     │             │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       │  BLE Advertising  │                   │
       │◀─────────────────▶│                   │
       │                   │                   │
       │                   │  HTTPS (when     │
       │                   │  online)          │
       │                   │◀─────────────────▶│
       │                   │                   │
       │  Local SQLite     │  Local SQLite     │
       │  (attendance)     │  (attendance)     │
       │                   │                   │
```

## Scalability Considerations

### BLE Capacity
- Theoretical: Unlimited broadcasters (connectionless)
- Practical: 20-50 concurrent in dense environment
- Mitigation: Short advertising interval (100ms), frequency hopping

### Database Growth
- Attendance records: ~500 bytes each
- 100 students × 180 days = ~9MB/year
- Sync queue cleanup after 30 days synced

### Network Sync
- Batch size: 50 records per sync cycle
- Exponential backoff on failure
- Parallel LMS + webhook delivery

## Testing Strategy

### Unit Tests (Jest)
- BLE encoder/decoder
- Crypto utilities (canonicalization, hashing, base64url)
- Session manager logic (PIN rotation, verification pipeline)
- Sync queue state machine

### Integration Tests
- Create session → Student joins → Verify → Export
- Offline → Online sync flow
- Replay attack rejection

### E2E Tests (Detox)
- Real BLE hardware required
- Android emulator + physical device
- iOS simulator + physical device

### Security Tests
- Invalid signature rejection
- Replay detection
- Timestamp expiration
- Cross-session replay
- Encryption tampering
- Merkle proof verification

## Future Extensibility

### Planned Features
1. **Multi-faculty sessions** - Co-teaching support
2. **Geofencing** - GPS + BLE hybrid presence
3. **Biometric attendance** - Face ID / fingerprint as second factor
4. **Blockchain anchoring** - Merkle root to public ledger
5. **Federated identity** - University SSO integration

### Extension Points
- `src/integrations/lms.ts` - New LMS adapters
- `src/integrations/webhook.ts` - Custom webhook formats
- `src/crypto/merkle.ts` - Alternative tree structures
- `src/ble/protocol.ts` - Protocol version negotiation