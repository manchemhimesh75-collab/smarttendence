import { v4 as uuidv4 } from 'uuid';

export function generateSecureRandom(byteLength: number): Uint8Array {
  const array = new Uint8Array(byteLength);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array);
  } else {
    for (let i = 0; i < byteLength; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
  }
  return array;
}

export function generatePin(length: number = 6): string {
  const array = generateSecureRandom(length);
  let pin = '';
  for (let i = 0; i < length; i++) {
    pin += (array[i] % 10).toString();
  }
  return pin;
}

export function generateSessionToken(): string {
  return generateSecureRandom(32).toString('hex');
}

export function generateNonce(): string {
  return generateSecureRandom(16).toString('hex');
}

export function uuid(): string {
  return uuidv4();
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

export function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

export function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export function fromBase64Url(base64url: string): Uint8Array {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padding = base64.length % 4;
  if (padding) {
    base64 += '='.repeat(4 - padding);
  }
  return fromBase64(base64);
}

export async function generateEd25519KeyPair(): Promise<{
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const keyPair = await crypto.subtle.generateKey(
      { name: 'Ed25519' },
      true,
      ['sign', 'verify']
    );
    
    const publicKeyRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
    const privateKeyRaw = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
    
    return {
      publicKey: new Uint8Array(publicKeyRaw),
      privateKey: new Uint8Array(privateKeyRaw),
    };
  }
  
  throw new Error('Web Crypto API not available for Ed25519');
}

export async function importEd25519PublicKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, { name: 'Ed25519' }, true, ['verify']);
}

export async function importEd25519PrivateKey(pkcs8: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('pkcs8', pkcs8, { name: 'Ed25519' }, true, ['sign']);
}

export async function signEd25519(privateKey: CryptoKey, data: Uint8Array): Promise<Uint8Array> {
  const signature = await crypto.subtle.sign('Ed25519', privateKey, data);
  return new Uint8Array(signature);
}

export async function verifyEd25519(publicKey: CryptoKey, data: Uint8Array, signature: Uint8Array): Promise<boolean> {
  return crypto.subtle.verify('Ed25519', publicKey, signature, data);
}

export async function generateAesGcmKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function importAesGcmKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
}

export async function encryptAesGcm(
  key: CryptoKey,
  data: Uint8Array,
  iv: Uint8Array
): Promise<{ ciphertext: Uint8Array; tag: Uint8Array }> {
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  
  const encryptedBytes = new Uint8Array(encrypted);
  const ciphertext = encryptedBytes.slice(0, -16);
  const tag = encryptedBytes.slice(-16);
  
  return { ciphertext, tag };
}

export async function decryptAesGcm(
  key: CryptoKey,
  ciphertext: Uint8Array,
  tag: Uint8Array,
  iv: Uint8Array
): Promise<Uint8Array> {
  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext);
  combined.set(tag, ciphertext.length);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    combined
  );
  
  return new Uint8Array(decrypted);
}

export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}