import { AttendanceStatus, VerificationResult } from '../ble/constants';

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

export interface CreateSessionInput {
  courseId: string;
  courseName?: string;
  facultyId: string;
  pinRotationSec?: number;
  roster: string[];
}

export interface SessionWithAttendance extends SessionInfo {
  attendance: AttendanceRecord[];
  presentCount: number;
  absentCount: number;
  lateCount: number;
  invalidCount: number;
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

export interface StudentIdentity {
  studentId: string;
  publicKey: string;
  keyAlgorithm: 'Ed25519';
  createdAt: number;
}

export interface SessionStatus {
  session: SessionInfo;
  currentPin: string;
  pinExpiresAt: number;
  timeRemaining: number;
  attendanceCounts: {
    present: number;
    absent: number;
    late: number;
    invalid: number;
  };
}

export interface PinWindow {
  window: number;
  pin: string;
  startsAt: number;
  expiresAt: number;
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

export type SessionState = 'idle' | 'creating' | 'active' | 'completed' | 'cancelled' | 'error';

export interface SessionManagerState {
  currentSession: SessionInfo | null;
  sessionState: SessionState;
  error: string | null;
  pinWindows: PinWindow[];
  currentPinWindow: number;
}