# Security Documentation

## Threat Model

### Assets to Protect
1. **Student Private Keys** - Ed25519 signing keys for attendance proofs
2. **Faculty Signing Key** - Ed25519 key for signing attendance receipts
3. **Attendance Integrity** - Preventing fake/modified attendance records
3. **Session Authentication** - Preventing unauthorized session joining
4. **Anti-Proxy** - Preventing one student marking attendance for another

### Adversaries
- **Malicious Student**: Attempts to mark attendance for another student
- **Replay Attacker**: Records and replays valid attendance proofs
- **Man-in-the-Middle**: Attempts to modify BLE advertisements in transit
- **Device Compromise**: Rooted/jailbroken device extracting keys
- **Malicious Faculty**: Attempts to forge attendance records

## Cryptographic Design

### Student Identity (Ed25519)
- **Key Generation**: Web Crypto API `crypto.subtle.generateKey({ name: 'Ed25519' })`
- **Private Key Storage**: iOS Keychain / Android Keystore (biometry-protected)
- **Public Key Distribution**: Via QR code during registration
- **Registration**: Faculty scans student's public key QR → stores in local database

### Attendance Proof Structure
```
Canonical Payload (deterministic JSON):
{
  "protocolVersion": 1,
  "payloadVersion": 1,
  "sessionId": "uuid",
  "studentId": "9240118001",
  "pinWindow": 5,
  "timestamp": 1234567890000,
  "nonce": "32-char-hex"
}

Signature = Ed25519_sign(privateKey, canonicalPayload)
```

### Verification Pipeline (Faculty Side)
1. **Protocol Validation** - Correct version, all required fields present
2. **Session Validation** - Session exists, is active, PIN window matches
3. **Timestamp Freshness** - |now - timestamp| ≤ 30 seconds
4. **Replay Protection** - Nonce not seen in current scan session
5. **Student Lookup** - Student ID in roster, public key matches registered key
6. **Signature Verification** - Ed25519_verify(publicKey, canonicalPayload, signature)
7. **Roster Check** - Student is in session roster
8. **Status Determination** - Present/Late/Absent based on timestamp vs session start

### Session Key Derivation
```
sessionKey = SHA-256(sessionId || pinWindow || masterSecret)
masterSecret = 32-byte random (generated once, stored in secure storage)
```

### Payload Encryption (AES-GCM)
- **Key**: Session-derived key (256-bit)
- **IV**: 12-byte random per message
- **Tag**: 16-byte authentication tag
- **Format**: `{ version, iv, ciphertext, tag }` (all base64url)

### Signed Attendance Receipt
```
Receipt Data (canonicalized):
{
  "version": 1,
  "sessionId": "uuid",
  "courseId": "CS101",
  "date": "2024-01-15",
  "attendance": [...],
  "issuedAt": 1234567890000,
  "facultyPublicKey": "base64url"
}

Signature = Ed25519_sign(facultyPrivateKey, canonicalReceipt)
```

### Merkle Tree Receipts
- **Leaves**: SHA-255(canonicalized attendance record)
- **Root**: Stored in signed receipt
- **Proofs**: Generated per-student for inclusion verification

## Key Storage Security

### iOS
- Student private keys: Keychain with `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` + biometry
- Faculty signing key: Same protection
- Session keys: Keychain with device passcode protection

### Android
- Student private keys: Android Keystore (StrongBox if available) + biometry
- Faculty signing key: Same protection
- Session keys: Android Keystore with device credential protection

### Fallback (Development)
- AsyncStorage with `secure_` prefix (NOT for production)

## BLE Security Considerations

### Advertising Data
- Service UUID: `a1b2c3d4-e5f6-7890-abcd-ef1234567890` (dedicated 128-bit UUID)
- Service Data: Encrypted JSON payload
- No manufacturer-specific data (avoids 0xFFFF test ID)

### Scanning
- Filter by service UUID (hardware filtering where available)
- Allow duplicates for RSSI tracking
- Deduplication by nonce in software

### Limitations
- **No Pairing**: BLE advertising is connectionless; no authentication at link layer
- **Relay Attacks**: Possible to relay BLE signals over distance (mitigated by short range + rotating PINs)
- **RSSI Spoofing**: Signal strength can be manipulated; not used for security decisions
- **MAC Randomization**: Device addresses may be randomized; not relied upon for identity

## Anti-Proxy Measures

1. **Cryptographic Identity**: Each student has unique Ed25519 keypair
2. **Signature Verification**: Faculty verifies proof signed by registered public key
3. **Nonce Uniqueness**: Each proof contains fresh nonce; duplicates rejected
4. **Timestamp Freshness**: Old proofs rejected (±30s window)
5. **PIN Window Binding**: Proof tied to current 30-second PIN window
5. **Session Binding**: Proof includes session ID; cross-session replay fails
6. **Roster Enforcement**: Only rostered students can be marked present

## Replay Protection Details

### Nonce Generation
- 16 bytes (128 bits) cryptographically secure random
- Encoded as 32-char hex string
- Generated per attendance attempt

### Faculty-Side Tracking
- In-memory `Set<string>` of seen nonces per scan session
- Cleared on `stopScanning()` / session end
- Persistent storage not needed (replay only relevant within active session)

### Timestamp Window
- Configurable: `BLE_CONSTANTS.TIMESTAMP_FRESHNESS_WINDOW_MS = 30000` (30s)
- Clock drift tolerance: ±30s
- Rejects proofs outside window

## Encryption Key Management

### Master Secret
- Generated once on first app launch: 32 bytes (256 bits)
- Stored in platform secure storage
- Never exported or transmitted

### Session Key Derivation
```
sessionKey = HKDF-SHA256(masterSecret, salt=sessionId, info="attendance-session")
```
Currently using simple SHA-256 concatenation; HKDF recommended for production.

### Key Rotation
- Master secret: Never rotated (would invalidate all past sessions)
- Session keys: Derived per session + PIN window
- Faculty signing key: Long-term; rotate only if compromised

## Secure Storage API

```typescript
// Student keys
await storeStudentPrivateKey(studentId, privateKey);
const privateKey = await getStudentPrivateKey(studentId);

// Faculty keys
await storeFacultySigningKey({ publicKey, privateKey });
const facultyKey = await getFacultySigningKey();

// Session keys
await storeSessionKey(sessionId, sessionKey);
const sessionKey = await getSessionKey(sessionId);
```

## Verification Result Codes

| Code | Meaning |
|------|---------|
| `verified` | All checks passed |
| `invalid_signature` | Ed25519 verification failed |
| `replay_detected` | Nonce already seen |
| `unknown_student` | Student ID not in roster |
| `expired_proof` | Timestamp or PIN window expired |
| `invalid_nonce` | Nonce format invalid |
| `modified_payload` | AES-GCM authentication failed |
| `wrong_session` | Session ID mismatch |
| `unregistered_student` | No public key registered |

## Security Checklist for Deployment

- [ ] Replace fallback AsyncStorage with platform secure storage
- [ ] Use HKDF for session key derivation
- [ ] Implement faculty key rotation procedure
- [ ] Add certificate pinning for LMS/webhook integrations
- [ ] Conduct third-party security audit
- [ ] Implement secure key backup/recovery for students
- [ ] Add rate limiting on verification endpoint
- [ ] Monitor for anomalous verification patterns

## Known Limitations

1. **BLE Relay Attacks**: An attacker with two phones can relay BLE signals between distant locations. Mitigated by short PIN windows (30s) and proximity expectation.

2. **Device Compromise**: If student device is rooted/jailbroken, private key can be extracted. No software-only mitigation.

3. **Clock Dependency**: Requires reasonably synchronized clocks. NTP-synchronized devices recommended.

4. **iOS Background Limits**: iOS may terminate background BLE operations. App designed for foreground use.

5. **No Server-Side Verification**: Current design is offline-first. Server-side verification requires trusting faculty public key distribution.

6. **Denial of Service**: Malicious broadcaster can flood scanner. Mitigated by nonce deduplication and scan session limits.

## Incident Response

### Suspected Key Compromise
1. Student: Re-register identity (generates new keypair)
2. Faculty: Rotate signing key, re-sign historical receipts
3. Notify affected parties

### Suspected Relay Attack
1. Reduce PIN rotation interval (e.g., 15s)
2. Add physical presence verification (manual check)
3. Log anomalous RSSI patterns

### Data Breach
1. No sensitive data transmitted over network (offline-first)
2. Local database encrypted by OS
3. Private keys in hardware-backed keystore