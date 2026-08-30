import { encodePayload, decodePayload, createEmptyPayload } from '../src/ble/encoder';
import { BleAdvertisementPayload } from '../src/ble/protocol';
import { BLE_CONSTANTS } from '../src/ble/constants';

describe('BLE Protocol Encoder/Decoder', () => {
  const validPayload: BleAdvertisementPayload = {
    protocolVersion: 1,
    payloadVersion: 1,
    sessionId: 'test-session-123',
    studentId: '9240118001',
    pinWindow: 5,
    timestamp: Date.now(),
    nonce: 'a'.repeat(32),
    signature: 'b'.repeat(86),
    publicKey: 'c'.repeat(86),
  };

  it('should encode and decode a valid payload', () => {
    const encoded = encodePayload(validPayload);
    expect(typeof encoded).toBe('string');
    expect(encoded.length).toBeGreaterThan(0);

    const decoded = decodePayload(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded?.sessionId).toBe(validPayload.sessionId);
    expect(decoded?.studentId).toBe(validPayload.studentId);
    expect(decoded?.pinWindow).toBe(validPayload.pinWindow);
    expect(decoded?.nonce).toBe(validPayload.nonce);
  });

  it('should reject invalid protocol version', () => {
    const invalidPayload = { ...validPayload, protocolVersion: 2 };
    const encoded = encodePayload(invalidPayload);
    const decoded = decodePayload(encoded);
    expect(decoded).toBeNull();
  });

  it('should reject invalid payload version', () => {
    const invalidPayload = { ...validPayload, payloadVersion: 2 };
    const encoded = encodePayload(invalidPayload);
    const decoded = decodePayload(encoded);
    expect(decoded).toBeNull();
  });

  it('should reject empty sessionId', () => {
    const invalidPayload = { ...validPayload, sessionId: '' };
    const encoded = encodePayload(invalidPayload);
    const decoded = decodePayload(encoded);
    expect(decoded).toBeNull();
  });

  it('should reject empty studentId', () => {
    const invalidPayload = { ...validPayload, studentId: '' };
    const encoded = encodePayload(invalidPayload);
    const decoded = decodePayload(encoded);
    expect(decoded).toBeNull();
  });

  it('should reject invalid nonce length', () => {
    const invalidPayload = { ...validPayload, nonce: 'short' };
    const encoded = encodePayload(invalidPayload);
    const decoded = decodePayload(encoded);
    expect(decoded).toBeNull();
  });

  it('should reject missing signature', () => {
    const invalidPayload = { ...validPayload, signature: '' };
    const encoded = encodePayload(invalidPayload);
    const decoded = decodePayload(encoded);
    expect(decoded).toBeNull();
  });

  it('should reject missing publicKey', () => {
    const invalidPayload = { ...validPayload, publicKey: '' };
    const encoded = encodePayload(invalidPayload);
    const decoded = decodePayload(encoded);
    expect(decoded).toBeNull();
  });

  it('should reject payload exceeding max size', () => {
    const largePayload = { ...validPayload, signature: 'x'.repeat(10000) };
    expect(() => encodePayload(largePayload)).toThrow('Payload too large');
  });

  it('should create empty payload with correct defaults', () => {
    const empty = createEmptyPayload();
    expect(empty.protocolVersion).toBe(BLE_CONSTANTS.PROTOCOL_VERSION);
    expect(empty.payloadVersion).toBe(BLE_CONSTANTS.PAYLOAD_VERSION);
    expect(empty.sessionId).toBe('');
    expect(empty.studentId).toBe('');
    expect(empty.pinWindow).toBe(0);
    expect(empty.timestamp).toBe(0);
    expect(empty.nonce).toBe('');
    expect(empty.signature).toBe('');
  });
});