import {
  generateEd25519KeyPair,
  importEd25519PublicKey,
  importEd25519PrivateKey,
  signEd25519,
  verifyEd25519,
  toBase64Url,
  fromBase64Url,
} from './keys';

export interface KeyPair {
  publicKey: string;
  privateKey: string;
  keyAlgorithm: 'Ed25519';
  createdAt: number;
}

export async function generateStudentKeyPair(): Promise<KeyPair> {
  const { publicKey, privateKey } = await generateEd25519KeyPair();
  return {
    publicKey: toBase64Url(publicKey),
    privateKey: toBase64Url(privateKey),
    keyAlgorithm: 'Ed25519',
    createdAt: Date.now(),
  };
}

export async function signAttendancePayload(
  canonicalData: Uint8Array,
  privateKeyB64: string
): Promise<string> {
  const privateKey = await importEd25519PrivateKey(fromBase64Url(privateKeyB64));
  const signature = await signEd25519(privateKey, canonicalData);
  return toBase64Url(signature);
}

export async function verifyAttendanceSignature(
  canonicalData: Uint8Array,
  signatureB64: string,
  publicKeyB64: string
): Promise<boolean> {
  const publicKey = await importEd25519PublicKey(fromBase64Url(publicKeyB64));
  const signature = fromBase64Url(signatureB64);
  return verifyEd25519(publicKey, canonicalData, signature);
}

export async function signReceipt(
  canonicalData: Uint8Array,
  privateKeyB64: string
): Promise<string> {
  return signAttendancePayload(canonicalData, privateKeyB64);
}

export async function verifyReceipt(
  canonicalData: Uint8Array,
  signatureB64: string,
  publicKeyB64: string
): Promise<boolean> {
  return verifyAttendanceSignature(canonicalData, signatureB64, publicKeyB64);
}

export function getPublicKeyFromKeyPair(keyPair: KeyPair): string {
  return keyPair.publicKey;
}

export function getPrivateKeyFromKeyPair(keyPair: KeyPair): string {
  return keyPair.privateKey;
}