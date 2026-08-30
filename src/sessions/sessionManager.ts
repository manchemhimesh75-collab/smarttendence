import {
  SessionInfo,
  CreateSessionInput,
  SessionWithAttendance,
  AttendanceRecord,
  AttendanceProof,
  StudentIdentity,
  PinWindow,
  SessionState,
  SessionManagerState,
  QrSessionData,
  VerificationContext,
  VerificationResultDetail,
  AttendanceStatus,
} from './sessionTypes';
import { BLE_CONSTANTS, VERIFICATION_RESULT } from '../ble/constants';
import { generateSecureRandom, generatePin } from '../crypto/keys';
import { signAttendancePayload, verifyAttendanceSignature } from '../crypto/signatures';
import { encryptPayload, decryptPayload } from '../crypto/encryption';
import { canonicalizeAttendancePayload } from '../crypto/hashing';
import { v4 as uuidv4 } from 'uuid';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY_SESSIONS = 'attendance_sessions';
const STORAGE_KEY_ATTENDANCE = 'attendance_records';
const STORAGE_KEY_STUDENTS = 'student_identities';
const STORAGE_KEY_FACULTY_KEY = 'faculty_signing_key';

class SessionManager {
  private state: SessionManagerState = {
    currentSession: null,
    sessionState: 'idle',
    error: null,
    pinWindows: [],
    currentPinWindow: -1,
  };

  private listeners: Set<(state: SessionManagerState) => void> = new Set();
  private pinRotationInterval: ReturnType<typeof setInterval> | null = null;
  private seenNonces: Set<string> = new Set();

  getState(): SessionManagerState {
    return { ...this.state };
  }

  subscribe(listener: (state: SessionManagerState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach(l => l(this.getState()));
  }

  private setState(partial: Partial<SessionManagerState>): void {
    this.state = { ...this.state, ...partial };
    this.notify();
  }

  async createSession(input: CreateSessionInput): Promise<SessionInfo> {
    this.setState({ sessionState: 'creating', error: null });

    try {
      const sessionId = uuidv4();
      const now = Date.now();
      const pinRotationSec = input.pinRotationSec || BLE_CONSTANTS.DEFAULT_PIN_ROTATION_SEC;

      const session: SessionInfo = {
        id: sessionId,
        courseId: input.courseId,
        courseName: input.courseName,
        facultyId: input.facultyId,
        startTime: now,
        status: 'active',
        pinRotationSec,
        roster: input.roster,
      };

      await this.saveSession(session);
      this.generatePinWindows(session);
      this.setState({
        currentSession: session,
        sessionState: 'active',
        currentPinWindow: 0,
      });
      this.startPinRotation(session);

      return session;
    } catch (error) {
      this.setState({
        sessionState: 'error',
        error: error instanceof Error ? error.message : 'Failed to create session',
      });
      throw error;
    }
  }

  async loadSession(sessionId: string): Promise<SessionInfo | null> {
    const sessions = await this.getAllSessions();
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      this.generatePinWindows(session);
      this.setState({
        currentSession: session,
        sessionState: session.status === 'active' ? 'active' : 'idle',
        currentPinWindow: this.getCurrentPinWindowIndex(session),
      });
      if (session.status === 'active') {
        this.startPinRotation(session);
      }
    }
    return session || null;
  }

  async getAllSessions(): Promise<SessionInfo[]> {
    try {
      const data = await this.getStorageItem(STORAGE_KEY_SESSIONS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  async getSessionWithAttendance(sessionId: string): Promise<SessionWithAttendance | null> {
    const session = await this.loadSession(sessionId);
    if (!session) return null;

    const records = await this.getAttendanceRecords(sessionId);
    const presentCount = records.filter(r => r.status === 'present').length;
    const absentCount = records.filter(r => r.status === 'absent').length;
    const lateCount = records.filter(r => r.status === 'late').length;
    const invalidCount = records.filter(r => r.status === 'invalid').length;

    return {
      ...session,
      attendance: records,
      presentCount,
      absentCount,
      lateCount,
      invalidCount,
    };
  }

  private generatePinWindows(session: SessionInfo): void {
    const windows: PinWindow[] = [];
    const windowCount = Math.ceil((Date.now() - session.startTime) / 1000 / session.pinRotationSec) + 10;
    
    for (let i = 0; i < windowCount; i++) {
      const startsAt = session.startTime + i * session.pinRotationSec * 1000;
      const expiresAt = startsAt + session.pinRotationSec * 1000;
      const pin = generatePin(6);
      windows.push({ window: i, pin, startsAt, expiresAt });
    }
    
    this.state.pinWindows = windows;
  }

  private getCurrentPinWindowIndex(session: SessionInfo): number {
    const now = Date.now();
    const elapsed = now - session.startTime;
    return Math.max(0, Math.floor(elapsed / (session.pinRotationSec * 1000)));
  }

  getCurrentPin(): PinWindow | null {
    const { pinWindows, currentPinWindow } = this.state;
    if (currentPinWindow < 0 || currentPinWindow >= pinWindows.length) return null;
    return pinWindows[currentPinWindow];
  }

  getCurrentPinWindow(): number {
    return this.state.currentPinWindow;
  }

  getPinTimeRemaining(): number {
    const current = this.getCurrentPin();
    if (!current) return 0;
    return Math.max(0, current.expiresAt - Date.now());
  }

  private startPinRotation(session: SessionInfo): void {
    if (this.pinRotationInterval) {
      clearInterval(this.pinRotationInterval);
    }

    const checkInterval = () => {
      const newIndex = this.getCurrentPinWindowIndex(session);
      if (newIndex !== this.state.currentPinWindow) {
        this.setState({ currentPinWindow: newIndex });
      }
    };

    checkInterval();
    this.pinRotationInterval = setInterval(checkInterval, 1000);
  }

  private stopPinRotation(): void {
    if (this.pinRotationInterval) {
      clearInterval(this.pinRotationInterval);
      this.pinRotationInterval = null;
    }
  }

  async endSession(): Promise<void> {
    const { currentSession } = this.state;
    if (!currentSession) return;

    this.stopPinRotation();

    const updatedSession: SessionInfo = {
      ...currentSession,
      status: 'completed',
      endTime: Date.now(),
    };

    await this.saveSession(updatedSession);
    this.setState({
      currentSession: updatedSession,
      sessionState: 'idle',
      currentPinWindow: -1,
    });
    this.seenNonces.clear();
  }

  async cancelSession(): Promise<void> {
    const { currentSession } = this.state;
    if (!currentSession) return;

    this.stopPinRotation();

    const updatedSession: SessionInfo = {
      ...currentSession,
      status: 'cancelled',
      endTime: Date.now(),
    };

    await this.saveSession(updatedSession);
    this.setState({
      currentSession: null,
      sessionState: 'idle',
      currentPinWindow: -1,
    });
    this.seenNonces.clear();
  }

  async verifyAttendance(
    proof: AttendanceProof,
    rssi: number,
    deviceAddress: string
  ): Promise<VerificationResultDetail> {
    const { currentSession } = this.state;
    if (!currentSession) {
      return { result: VERIFICATION_RESULT.WRONG_SESSION, error: 'No active session' };
    }

    if (proof.sessionId !== currentSession.id) {
      return { result: VERIFICATION_RESULT.WRONG_SESSION, error: 'Wrong session ID' };
    }

    const studentIdentity = await this.getStudentIdentity(proof.studentId);
    if (!studentIdentity) {
      return { result: VERIFICATION_RESULT.UNREGISTERED_STUDENT, error: 'Student not registered' };
    }

    if (studentIdentity.publicKey !== proof.publicKey) {
      return { result: VERIFICATION_RESULT.INVALID_SIGNATURE, error: 'Public key mismatch' };
    }

    const now = Date.now();
    if (Math.abs(now - proof.timestamp) > BLE_CONSTANTS.TIMESTAMP_FRESHNESS_WINDOW_MS) {
      return { result: VERIFICATION_RESULT.EXPIRED_PROOF, error: 'Proof timestamp expired' };
    }

    const expectedWindow = this.getCurrentPinWindowIndex(currentSession);
    if (proof.pinWindow !== expectedWindow && proof.pinWindow !== expectedWindow - 1) {
      return { result: VERIFICATION_RESULT.EXPIRED_PROOF, error: 'PIN window expired' };
    }

    const nonceKey = `${proof.sessionId}:${proof.nonce}`;
    if (this.seenNonces.has(nonceKey)) {
      return { result: VERIFICATION_RESULT.REPLAY_DETECTED, error: 'Replay attack detected' };
    }

    const canonical = canonicalizeAttendancePayload({
      protocolVersion: proof.protocolVersion,
      payloadVersion: proof.payloadVersion,
      sessionId: proof.sessionId,
      studentId: proof.studentId,
      pinWindow: proof.pinWindow,
      timestamp: proof.timestamp,
      nonce: proof.nonce,
    });

    const isValid = await verifyAttendanceSignature(
      canonical,
      proof.signature,
      proof.publicKey
    );

    if (!isValid) {
      return { result: VERIFICATION_RESULT.INVALID_SIGNATURE, error: 'Invalid signature' };
    }

    this.seenNonces.add(nonceKey);

    const status = this.determineAttendanceStatus(currentSession, proof.timestamp);
    const record: AttendanceRecord = {
      id: uuidv4(),
      sessionId: currentSession.id,
      studentId: proof.studentId,
      status,
      timestamp: proof.timestamp,
      rssi,
      deviceAddress,
      proof,
      synced: false,
      createdAt: now,
      updatedAt: now,
    };

    await this.saveAttendanceRecord(record);

    return { result: VERIFICATION_RESULT.VERIFIED, record };
  }

  private determineAttendanceStatus(session: SessionInfo, timestamp: number): AttendanceStatus {
    const sessionStart = session.startTime;
    const lateThreshold = 15 * 60 * 1000; // 15 minutes

    if (timestamp <= sessionStart + lateThreshold) {
      return 'present';
    } else if (timestamp <= sessionStart + lateThreshold * 2) {
      return 'late';
    } else {
      return 'absent';
    }
  }

  async createStudentAttendanceProof(
    sessionId: string,
    studentId: string,
    pinWindow: number,
    privateKey: string,
    publicKey: string
  ): Promise<AttendanceProof> {
    const timestamp = Date.now();
    const nonce = generateSecureRandom(16).toString('hex');

    const payload = {
      protocolVersion: BLE_CONSTANTS.PROTOCOL_VERSION,
      payloadVersion: BLE_CONSTANTS.PAYLOAD_VERSION,
      sessionId,
      studentId,
      pinWindow,
      timestamp,
      nonce,
    };

    const canonical = canonicalizeAttendancePayload(payload);
    const signature = await signAttendancePayload(canonical, privateKey);

    return {
      ...payload,
      signature,
      publicKey,
    };
  }

  async generateQrSessionData(sessionId: string): Promise<QrSessionData> {
    const session = await this.loadSession(sessionId);
    if (!session) throw new Error('Session not found');

    const sessionToken = generateSecureRandom(32).toString('hex');
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

    return {
      version: 1,
      sessionId,
      sessionToken,
      expiresAt,
    };
  }

  async registerStudentIdentity(identity: StudentIdentity): Promise<void> {
    const students = await this.getAllStudentIdentities();
    const existing = students.find(s => s.studentId === identity.studentId);
    if (existing) {
      throw new Error(`Student ${identity.studentId} already registered`);
    }
    students.push(identity);
    await this.setStorageItem(STORAGE_KEY_STUDENTS, JSON.stringify(students));
  }

  async getStudentIdentity(studentId: string): Promise<StudentIdentity | null> {
    const students = await this.getAllStudentIdentities();
    return students.find(s => s.studentId === studentId) || null;
  }

  async getAllStudentIdentities(): Promise<StudentIdentity[]> {
    try {
      const data = await this.getStorageItem(STORAGE_KEY_STUDENTS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  async saveAttendanceRecord(record: AttendanceRecord): Promise<void> {
    const records = await this.getAllAttendanceRecords();
    records.push(record);
    await this.setStorageItem(STORAGE_KEY_ATTENDANCE, JSON.stringify(records));
  }

  async getAttendanceRecords(sessionId: string): Promise<AttendanceRecord[]> {
    const records = await this.getAllAttendanceRecords();
    return records.filter(r => r.sessionId === sessionId);
  }

  async getAllAttendanceRecords(): Promise<AttendanceRecord[]> {
    try {
      const data = await this.getStorageItem(STORAGE_KEY_ATTENDANCE);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private async saveSession(session: SessionInfo): Promise<void> {
    const sessions = await this.getAllSessions();
    const index = sessions.findIndex(s => s.id === session.id);
    if (index >= 0) {
      sessions[index] = session;
    } else {
      sessions.push(session);
    }
    await this.setStorageItem(STORAGE_KEY_SESSIONS, JSON.stringify(sessions));
  }

  async getFacultySigningKey(): Promise<FacultySigningKey | null> {
    try {
      const data = await this.getStorageItem(STORAGE_KEY_FACULTY_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  async setFacultySigningKey(key: FacultySigningKey): Promise<void> {
    await this.setStorageItem(STORAGE_KEY_FACULTY_KEY, JSON.stringify(key));
  }

  async createSignedReceipt(sessionId: string): Promise<SignedAttendanceReceipt> {
    const session = await this.loadSession(sessionId);
    if (!session) throw new Error('Session not found');

    const records = await this.getAttendanceRecords(sessionId);
    const facultyKey = await this.getFacultySigningKey();
    if (!facultyKey) throw new Error('Faculty signing key not configured');

    const receiptData = {
      version: 1,
      sessionId,
      courseId: session.courseId,
      date: new Date(session.startTime).toISOString().split('T')[0],
      attendance: records,
      issuedAt: Date.now(),
      facultyPublicKey: facultyKey.publicKey,
    };

    const canonical = canonicalizeAttendancePayload(receiptData);
    const signature = await signAttendancePayload(canonical, facultyKey.privateKey);

    return {
      ...receiptData,
      signature,
    };
  }

  private async getStorageItem(key: string): Promise<string | null> {
    return AsyncStorage.getItem(key);
  }

  private async setStorageItem(key: string, value: string): Promise<void> {
    return AsyncStorage.setItem(key, value);
  }
}

export const sessionManager = new SessionManager();