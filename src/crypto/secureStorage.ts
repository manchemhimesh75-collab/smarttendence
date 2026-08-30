import { AsyncStorage } from '@react-native-async-storage/async-storage';

const SECURE_STORAGE_PREFIX = 'secure_';

export interface SecureStorageItem {
  key: string;
  value: string;
  createdAt: number;
  accessControl?: 'biometry' | 'device_passcode' | 'none';
}

async function getSecureKey(key: string): Promise<string | null> {
  try {
    const item = await AsyncStorage.getItem(`${SECURE_STORAGE_PREFIX}${key}`);
    if (!item) return null;
    const parsed = JSON.parse(item) as SecureStorageItem;
    return parsed.value;
  } catch {
    return null;
  }
}

async function setSecureKey(key: string, value: string, accessControl?: 'biometry' | 'device_passcode' | 'none'): Promise<void> {
  const item: SecureStorageItem = {
    key,
    value,
    createdAt: Date.now(),
    accessControl,
  };
  await AsyncStorage.setItem(`${SECURE_STORAGE_PREFIX}${key}`, JSON.stringify(item));
}

async function removeSecureKey(key: string): Promise<void> {
  await AsyncStorage.removeItem(`${SECURE_STORAGE_PREFIX}${key}`);
}

export async function storeStudentPrivateKey(studentId: string, privateKey: string): Promise<void> {
  await setSecureKey(`student_private_${studentId}`, privateKey, 'biometry');
}

export async function getStudentPrivateKey(studentId: string): Promise<string | null> {
  return getSecureKey(`student_private_${studentId}`);
}

export async function removeStudentPrivateKey(studentId: string): Promise<void> {
  await removeSecureKey(`student_private_${studentId}`);
}

export async function storeFacultySigningKey(keyPair: {
  publicKey: string;
  privateKey: string;
}): Promise<void> {
  await setSecureKey('faculty_signing_keypair', JSON.stringify(keyPair), 'biometry');
}

export async function getFacultySigningKey(): Promise<{
  publicKey: string;
  privateKey: string;
} | null> {
  const data = await getSecureKey('faculty_signing_keypair');
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export async function storeSessionKey(sessionId: string, sessionKey: string): Promise<void> {
  await setSecureKey(`session_key_${sessionId}`, sessionKey, 'device_passcode');
}

export async function getSessionKey(sessionId: string): Promise<string | null> {
  return getSecureKey(`session_key_${sessionId}`);
}

export async function removeSessionKey(sessionId: string): Promise<void> {
  await removeSecureKey(`session_key_${sessionId}`);
}

export async function storeMasterSecret(masterSecret: string): Promise<void> {
  await setSecureKey('master_secret', masterSecret, 'biometry');
}

export async function getMasterSecret(): Promise<string | null> {
  return getSecureKey('master_secret');
}

export async function generateAndStoreMasterSecret(): Promise<string> {
  const array = new Uint8Array(32);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array);
  } else {
    for (let i = 0; i < 32; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
  }
  const secret = Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
  await storeMasterSecret(secret);
  return secret;
}

export async function getOrCreateMasterSecret(): Promise<string> {
  let secret = await getMasterSecret();
  if (!secret) {
    secret = await generateAndStoreMasterSecret();
  }
  return secret;
}

export async function clearAllSecureData(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const secureKeys = keys.filter(k => k.startsWith(SECURE_STORAGE_PREFIX));
  await AsyncStorage.multiRemove(secureKeys);
}