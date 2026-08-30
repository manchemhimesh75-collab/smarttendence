import { sessionManager } from '../src/sessions/sessionManager';
import { generateSecureRandom } from '../src/crypto/keys';
import { signAttendancePayload, verifyAttendanceSignature, generateStudentKeyPair } from '../src/crypto/signatures';
import { canonicalizeAttendancePayload } from '../src/crypto/hashing';
import { AttendanceStatus, VERIFICATION_RESULT } from '../src/ble/constants';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  multiSet: jest.fn(),
  multiGet: jest.fn(),
  removeItem: jest.fn(),
}));

describe('Session Manager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear any stored data
    (sessionManager as any).state = {
      currentSession: null,
      sessionState: 'idle',
      error: null,
      pinWindows: [],
      currentPinWindow: -1,
    };
  });

  describe('Session Creation', () => {
    it('should create a session with valid input', async () => {
      const session = await sessionManager.createSession({
        courseId: 'CS101',
        courseName: 'Intro to CS',
        facultyId: 'faculty_001',
        pinRotationSec: 30,
        roster: ['9240118001', '9240118002'],
      });

      expect(session).toBeDefined();
      expect(session.courseId).toBe('CS101');
      expect(session.courseName).toBe('Intro to CS');
      expect(session.roster.length).toBe(2);
      expect(session.status).toBe('active');
      expect(session.pinRotationSec).toBe(30);
    });

    it('should generate PIN windows', async () => {
      const session = await sessionManager.createSession({
        courseId: 'CS101',
        facultyId: 'faculty_001',
        pinRotationSec: 30,
        roster: ['9240118001'],
      });

      const pinWindow = sessionManager.getCurrentPin();
      expect(pinWindow).not.toBeNull();
      expect(pinWindow?.pin.length).toBe(6);
      expect(pinWindow?.window).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Attendance Verification', () => {
    let keyPair: { publicKey: string; privateKey: string };
    let session: Awaited<ReturnType<typeof sessionManager.createSession>>;

    beforeEach(async () => {
      keyPair = await generateStudentKeyPair();
      session = await sessionManager.createSession({
        courseId: 'CS101',
        facultyId: 'faculty_001',
        pinRotationSec: 30,
        roster: ['9240118001'],
      });
      await sessionManager.registerStudentIdentity({
        studentId: '9240118001',
        publicKey: keyPair.publicKey,
        keyAlgorithm: 'Ed25519',
        createdAt: Date.now(),
      });
    });

    it('should verify valid attendance proof', async () => {
      const pinWindow = sessionManager.getCurrentPin();
      const proof = await sessionManager.createStudentAttendanceProof(
        session.id,
        '9240118001',
        pinWindow!.window,
        keyPair.privateKey,
        keyPair.publicKey
      );

      const result = await sessionManager.verifyAttendance(proof, -50, 'aa:bb:cc:dd:ee:ff');
      expect(result.result).toBe(VERIFICATION_RESULT.VERIFIED);
      expect(result.record).toBeDefined();
      expect(result.record?.studentId).toBe('9240118001');
      expect(result.record?.status).toBe('present');
    });

    it('should reject proof with wrong session ID', async () => {
      const pinWindow = sessionManager.getCurrentPin();
      const proof = await sessionManager.createStudentAttendanceProof(
        'wrong-session-id',
        '9240118001',
        pinWindow!.window,
        keyPair.privateKey,
        keyPair.publicKey
      );

      const result = await sessionManager.verifyAttendance(proof, -50, 'aa:bb:cc:dd:ee:ff');
      expect(result.result).toBe(VERIFICATION_RESULT.WRONG_SESSION);
    });

    it('should reject proof with unknown student', async () => {
      const pinWindow = sessionManager.getCurrentPin();
      const proof = await sessionManager.createStudentAttendanceProof(
        session.id,
        'unknown_student',
        pinWindow!.window,
        keyPair.privateKey,
        keyPair.publicKey
      );

      const result = await sessionManager.verifyAttendance(proof, -50, 'aa:bb:cc:dd:ee:ff');
      expect(result.result).toBe(VERIFICATION_RESULT.UNREGISTERED_STUDENT);
    });

    it('should reject replay attack (duplicate nonce)', async () => {
      const pinWindow = sessionManager.getCurrentPin();
      const proof = await sessionManager.createStudentAttendanceProof(
        session.id,
        '9240118001',
        pinWindow!.window,
        keyPair.privateKey,
        keyPair.publicKey
      );

      // First verification should succeed
      const result1 = await sessionManager.verifyAttendance(proof, -50, 'aa:bb:cc:dd:ee:ff');
      expect(result1.result).toBe(VERIFICATION_RESULT.VERIFIED);

      // Second verification with same nonce should fail
      const result2 = await sessionManager.verifyAttendance(proof, -50, 'aa:bb:cc:dd:ee:ff');
      expect(result2.result).toBe(VERIFICATION_RESULT.REPLAY_DETECTED);
    });

    it('should reject expired timestamp', async () => {
      const pinWindow = sessionManager.getCurrentPin();
      const oldTimestamp = Date.now() - 60000; // 60 seconds ago
      
      // Create proof with old timestamp (bypass sessionManager.createStudentAttendanceProof)
      const payload = {
        protocolVersion: 1,
        payloadVersion: 1,
        sessionId: session.id,
        studentId: '9240118001',
        pinWindow: pinWindow!.window,
        timestamp: oldTimestamp,
        nonce: generateSecureRandom(16).toString('hex'),
      };
      const canonical = canonicalizeAttendancePayload(payload);
      const signature = await signAttendancePayload(canonical, keyPair.privateKey);

      const proof = { ...payload, signature, publicKey: keyPair.publicKey };
      const result = await sessionManager.verifyAttendance(proof, -50, 'aa:bb:cc:dd:ee:ff');
      expect(result.result).toBe(VERIFICATION_RESULT.EXPIRED_PROOF);
    });

    it('should reject wrong PIN window', async () => {
      const pinWindow = sessionManager.getCurrentPin();
      const proof = await sessionManager.createStudentAttendanceProof(
        session.id,
        '9240118001',
        pinWindow!.window + 5, // Wrong window
        keyPair.privateKey,
        keyPair.publicKey
      );

      const result = await sessionManager.verifyAttendance(proof, -50, 'aa:bb:cc:dd:ee:ff');
      expect(result.result).toBe(VERIFICATION_RESULT.EXPIRED_PROOF);
    });

    it('should reject invalid signature', async () => {
      const pinWindow = sessionManager.getCurrentPin();
      const proof = await sessionManager.createStudentAttendanceProof(
        session.id,
        '9240118001',
        pinWindow!.window,
        keyPair.privateKey,
        keyPair.publicKey
      );

      // Tamper with signature
      const tamperedProof = { ...proof, signature: 'tampered'.padEnd(86, 'x') };
      const result = await sessionManager.verifyAttendance(tamperedProof, -50, 'aa:bb:cc:dd:ee:ff');
      expect(result.result).toBe(VERIFICATION_RESULT.INVALID_SIGNATURE);
    });

    it('should determine late status correctly', async () => {
      // Create session with start time 20 minutes ago
      const oldSession = await sessionManager.createSession({
        courseId: 'CS101',
        facultyId: 'faculty_001',
        pinRotationSec: 30,
        roster: ['9240118001'],
      });
      // Manually adjust start time
      (oldSession as any).startTime = Date.now() - 20 * 60 * 1000;

      const pinWindow = sessionManager.getCurrentPin();
      const proof = await sessionManager.createStudentAttendanceProof(
        oldSession.id,
        '9240118001',
        pinWindow!.window,
        keyPair.privateKey,
        keyPair.publicKey
      );

      const result = await sessionManager.verifyAttendance(proof, -50, 'aa:bb:cc:dd:ee:ff');
      expect(result.record?.status).toBe('late');
    });
  });

  describe('Session Lifecycle', () => {
    it('should end session and mark completed', async () => {
      const session = await sessionManager.createSession({
        courseId: 'CS101',
        facultyId: 'faculty_001',
        pinRotationSec: 30,
        roster: ['9240118001'],
      });

      await sessionManager.endSession();
      const state = sessionManager.getState();
      expect(state.currentSession?.status).toBe('completed');
      expect(state.currentSession?.endTime).toBeDefined();
    });

    it('should cancel session', async () => {
      const session = await sessionManager.createSession({
        courseId: 'CS101',
        facultyId: 'faculty_001',
        pinRotationSec: 30,
        roster: ['9240118001'],
      });

      await sessionManager.cancelSession();
      const state = sessionManager.getState();
      expect(state.currentSession).toBeNull();
      expect(state.sessionState).toBe('idle');
    });
  });
});