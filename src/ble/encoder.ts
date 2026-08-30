import { BleAdvertisementPayload, BLE_CONSTANTS } from './constants';
import { BleAdvertisementPayload as BlePayloadType } from './protocol';

function toBase64Url(bytes: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function fromBase64Url(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function encodePayload(payload: BleAdvertisementPayload): string {
  const json = JSON.stringify(payload);
  const encoder = new TextEncoder();
  const bytes = encoder.encode(json);
  
  if (bytes.length > BLE_CONSTANTS.MAX_PAYLOAD_SIZE) {
    throw new Error(`Payload too large: ${bytes.length} bytes (max ${BLE_CONSTANTS.MAX_PAYLOAD_SIZE})`);
  }
  
  return toBase64Url(bytes);
}

export function decodePayload(encoded: string): BleAdvertisementPayload | null {
  try {
    const bytes = fromBase64Url(encoded);
    const decoder = new TextDecoder();
    const json = decoder.decode(bytes);
    const payload = JSON.parse(json) as BleAdvertisementPayload;
    
    if (!validatePayload(payload)) {
      return null;
    }
    
    return payload;
  } catch {
    return null;
  }
}

function validatePayload(payload: unknown): payload is BleAdvertisementPayload {
  if (!payload || typeof payload !== 'object') return false;
  
  const p = payload as Record<string, unknown>;
  
  if (p.protocolVersion !== BLE_CONSTANTS.PROTOCOL_VERSION) return false;
  if (p.payloadVersion !== BLE_CONSTANTS.PAYLOAD_VERSION) return false;
  if (typeof p.sessionId !== 'string' || p.sessionId.length === 0) return false;
  if (typeof p.studentId !== 'string' || p.studentId.length === 0) return false;
  if (typeof p.pinWindow !== 'number' || p.pinWindow < 0) return false;
  if (typeof p.timestamp !== 'number' || p.timestamp <= 0) return false;
  if (typeof p.nonce !== 'string' || p.nonce.length !== 32) return false;
  if (typeof p.signature !== 'string' || p.signature.length === 0) return false;
  if (typeof p.publicKey !== 'string' || p.publicKey.length === 0) return false;
  if (p.encryptedData !== undefined && typeof p.encryptedData !== 'string') return false;
  
  return true;
}

export function createEmptyPayload(): BleAdvertisementPayload {
  return {
    protocolVersion: BLE_CONSTANTS.PROTOCOL_VERSION,
    payloadVersion: BLE_CONSTANTS.PAYLOAD_VERSION,
    sessionId: '',
    studentId: '',
    pinWindow: 0,
    timestamp: 0,
    nonce: '',
    signature: '',
  };
}