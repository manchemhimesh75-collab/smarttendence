import {
  generateAesGcmKey,
  importAesGcmKey,
  encryptAesGcm,
  decryptAesGcm,
  generateSecureRandom,
  toBase64Url,
  fromBase64Url,
  toBase64,
  fromBase64,
} from './keys';

export interface EncryptedPayload {
  version: number;
  iv: string;
  ciphertext: string;
  tag: string;
}

export const ENCRYPTION_VERSION = 1;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export async function generateSessionKey(): Promise<string> {
  const key = await generateAesGcmKey();
  const raw = await crypto.subtle.exportKey('raw', key);
  return toBase64Url(new Uint8Array(raw));
}

export async function deriveSessionKey(
  sessionId: string,
  pinWindow: number,
  masterSecret: string
): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${sessionId}:${pinWindow}:${masterSecret}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return toBase64Url(new Uint8Array(hash));
}

export async function encryptPayload(
  plaintext: Uint8Array,
  sessionKeyB64: string
): Promise<EncryptedPayload> {
  const key = await importAesGcmKey(fromBase64Url(sessionKeyB64));
  const iv = generateSecureRandom(IV_LENGTH);
  
  const { ciphertext, tag } = await encryptAesGcm(key, plaintext, iv);
  
  return {
    version: ENCRYPTION_VERSION,
    iv: toBase64Url(iv),
    ciphertext: toBase64Url(ciphertext),
    tag: toBase64Url(tag),
  };
}

export async function decryptPayload(
  encrypted: EncryptedPayload,
  sessionKeyB64: string
): Promise<Uint8Array> {
  if (encrypted.version !== ENCRYPTION_VERSION) {
    throw new Error(`Unsupported encryption version: ${encrypted.version}`);
  }
  
  const key = await importAesGcmKey(fromBase64Url(sessionKeyB64));
  const iv = fromBase64Url(encrypted.iv);
  const ciphertext = fromBase64Url(encrypted.ciphertext);
  const tag = fromBase64Url(encrypted.tag);
  
  return decryptAesGcm(key, ciphertext, tag, iv);
}

export async function encryptString(
  plaintext: string,
  sessionKeyB64: string
): Promise<EncryptedPayload> {
  const encoder = new TextEncoder();
  return encryptPayload(encoder.encode(plaintext), sessionKeyB64);
}

export async function decryptToString(
  encrypted: EncryptedPayload,
  sessionKeyB64: string
): Promise<string> {
  const bytes = await decryptPayload(encrypted, sessionKeyB64);
  const decoder = new TextDecoder();
  return decoder.decode(bytes);
}

export function serializeEncryptedPayload(encrypted: EncryptedPayload): string {
  return JSON.stringify(encrypted);
}

export function deserializeEncryptedPayload(json: string): EncryptedPayload {
  const parsed = JSON.parse(json);
  if (!parsed.version || !parsed.iv || !parsed.ciphertext || !parsed.tag) {
    throw new Error('Invalid encrypted payload format');
  }
  return parsed;
}