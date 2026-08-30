import {
  BLE_CONSTANTS,
  AttendanceStatus,
  VerificationResult,
} from './constants';

export interface SessionInfo {
  id: string;
  courseId: string;
  courseName?: string;
  facultyId: string;
  startTime: number;
  endTime?: number;
  status: 'active' | 'completed' | 'cancelled';
  pinRotationSec: number;
  roster: string[];
}

export interface StudentIdentity {
  studentId: string;
  publicKey: string;
  keyAlgorithm: 'Ed25519';
  createdAt: number;
}

export interface AttendanceRecord {
  id: string;
  sessionId: string;
  studentId: string;
  status: AttendanceStatus;
  timestamp: number;
  rssi?: number;
  deviceAddress?: string;
  proof?: AttendanceProof;
  synced: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AttendanceProof {
  protocolVersion: number;
  payloadVersion: number;
  sessionId: string;
  studentId: string;
  pinWindow: number;
  timestamp: number;
  nonce: string;
  signature: string;
  publicKey: string;
}

export interface BleAdvertisementPayload {
  protocolVersion: number;
  payloadVersion: number;
  sessionId: string;
  studentId: string;
  pinWindow: number;
  timestamp: number;
  nonce: string;
  signature: string;
  encryptedData?: string;
}

export interface BleScanResult {
  payload: BleAdvertisementPayload;
  rssi: number;
  deviceAddress: string;
  timestamp: number;
}

export interface VerificationContext {
  session: SessionInfo;
  studentIdentity: StudentIdentity;
  currentTime: number;
  seenNonces: Set<string>;
}

export interface VerificationResultDetail {
  result: VerificationResult;
  record?: AttendanceRecord;
  error?: string;
}

export interface QrSessionData {
  version: number;
  sessionId: string;
  sessionToken: string;
  expiresAt: number;
}

export interface FacultySigningKey {
  publicKey: string;
  privateKey: string;
  keyAlgorithm: 'Ed25519';
  createdAt: number;
}

export interface SignedAttendanceReceipt {
  version: number;
  sessionId: string;
  courseId: string;
  date: string;
  attendance: AttendanceRecord[];
  issuedAt: number;
  facultyPublicKey: string;
  signature: string;
  merkleRoot?: string;
}