import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  SafeAreaView, View, Text, TouchableOpacity, StyleSheet, Alert,
  TextInput, ScrollView, PermissionsAndroid, Platform, Share,
  StatusBar, Animated, Dimensions, FlatList,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import QRCode from 'react-native-qrcode-svg';
import HapticFeedback from 'react-native-haptic-feedback';
import NetInfo from '@react-native-community/netinfo';

import { sessionManager, useAttendanceSession } from './src/sessions';
import { useBleScanner } from './src/hooks/useBleScanner';
import { useBleBroadcaster } from './src/hooks/useBleBroadcaster';
import { generateStudentKeyPair, getStudentPrivateKey, storeStudentPrivateKey, getOrCreateMasterSecret } from './src/crypto';
import { PinCard } from './src/ui/PinCard';
import { StudentList } from './src/ui/StudentList';
import { SessionCard } from './src/ui/SessionCard';
import { AttendanceStatus } from './src/ui/AttendanceStatus';
import { SessionInfo, CreateSessionInput, StudentIdentity, AttendanceRecord } from './src/sessions/sessionTypes';
import { VerificationResult } from './src/ble/constants';

const { width } = Dimensions.get('window');

const C = {
  bg: '#0f172a', bgCard: '#1e293b', teal: '#14b8a6', tealDark: '#0d9488',
  purple: '#a78bfa', purpleDark: '#7c3aed', white: '#ffffff', offWhite: '#f1f599',
  lightGray: '#94a3b8', midGray: '#64748b', dark: '#0f172a', red: '#ef4444',
  redBg: '#2d1a1a', green: '#22c55e', greenBg: '#143a24', greenBorder: '#86efac',
  border: '#334155', inputBg: '#1e293b', inputBorder: '#334155', shadow: '#000000',
};

const hapticsOptions = { enableVibrateFallback: true, ignoreAndroidSystemSettings: false };

// ═══════════════════════════════════════════════════════════════════
//  HOME SCREEN
// ═══════════════════════════════════════════════════════════════════
function HomeScreen({ onSelectMode, fadeAnim, slideAnim, isOnline }: {
  onSelectMode: (mode: 'FACULTY' | 'STUDENT') => void;
  fadeAnim: Animated.Value;
  slideAnim: Animated.Value;
  isOnline: boolean;
}) {
  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <Animated.View style={[styles.homeScreen, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <View style={{ flex: 1 }}>
          <View style={styles.logoArea}>
            <Text style={styles.appName}>Attendance Secure System</Text>
            <Text style={styles.appTagline}>Offline • Cryptographic • Instant</Text>
          </View>

          <View style={[styles.networkBadge, isOnline ? styles.networkOnline : styles.networkOffline]}>
            <Text style={styles.networkText}>{isOnline ? '🟢 Online' : '🔴 Offline (local only)'}</Text>
          </View>

          <View style={styles.roleButtons}>
            <TouchableOpacity
              style={styles.roleBtnFaculty}
              onPress={() => onSelectMode('FACULTY')}
              activeOpacity={0.85}
            >
              <View>
                <Text style={styles.roleBtnTitle}>Faculty</Text>
                <Text style={styles.roleBtnSub}>Start session & collect attendance</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.roleBtnStudent}
              onPress={() => onSelectMode('STUDENT')}
              activeOpacity={0.85}
            >
              <View>
                <Text style={styles.roleBtnTitle}>Student</Text>
                <Text style={styles.roleBtnSub}>Mark attendance via BLE</Text>
              </View>
            </TouchableOpacity>
          </View>

          <Text style={styles.footerNote}>No internet required • BLE proximity • Ed25519 signatures</Text>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  FACULTY SCREEN
// ═══════════════════════════════════════════════════════════════════
function FacultyScreen({ 
  goBack, fadeAnim, slideAnim, 
  sessionState, createSession, loadSession, endSession, getAllSessions, getSessionWithAttendance, createSignedReceipt, refreshState,
  startScanning, stopScanning, verificationResults,
}: {
  goBack: () => void;
  fadeAnim: Animated.Value;
  slideAnim: Animated.Value;
  sessionState: ReturnType<typeof sessionManager.getState>;
  createSession: (input: CreateSessionInput) => Promise<SessionInfo>;
  endSession: () => Promise<void>;
  getAllSessions: () => Promise<SessionInfo[]>;
  getSessionWithAttendance: (sessionId: string) => Promise<{session: SessionInfo, attendance: AttendanceRecord[]} | null>;
  createSignedReceipt: (sessionId: string) => Promise<any>;
  refreshState: () => void;
  startScanning: () => Promise<void>;
  stopScanning: () => Promise<void>;
  verificationResults: any[];
}) {
  const currentSession = sessionState.currentSession;
  const isSessionActive = currentSession?.status === 'active';
  const pinWindow = sessionManager.getCurrentPin();
  const pinTimeRemaining = sessionManager.getPinTimeRemaining();
  
  const [facultyState, setFacultyState] = useState({ courseId: '', courseName: '', roster: '' });

  const handleCreateSession = async () => {
    if (!facultyState.courseId.trim()) { Alert.alert('Required', 'Please enter a Course ID'); return; }
    const roster = facultyState.roster.split('\n').map(s => s.trim()).filter(Boolean);
    if (roster.length === 0) { Alert.alert('Required', 'Please add at least one student to the roster'); return; }
    try {
      await createSession({ courseId: facultyState.courseId.trim(), courseName: facultyState.courseName.trim() || undefined, facultyId: 'faculty_001', pinRotationSec: 30, roster });
      HapticFeedback.trigger('impactHeavy', hapticsOptions);
    } catch (err) { Alert.alert('Error', err instanceof Error ? err.message : 'Failed to create session'); }
  };

  const handleEndSession = async () => {
    try { await endSession(); HapticFeedback.trigger('notificationSuccess', hapticsOptions); Alert.alert('Session Ended', 'Attendance session completed. Export results.'); }
    catch (err) { Alert.alert('Error', err instanceof Error ? err.message : 'Failed to end session'); }
  };

  const handleExportAttendance = async () => {
    if (!currentSession) return;
    try {
      const sessionWithAttendance = await getSessionWithAttendance(currentSession.id);
      if (!sessionWithAttendance || sessionWithAttendance.attendance.length === 0) { Alert.alert('Info', 'No attendance records to export.'); return; }
      const csvHeader = 'Enrollment Number,Status,Timestamp,RSSI,Device Address,Verified\n';
      const csvRows = sessionWithAttendance.attendance.map(r => `${r.studentId},${r.status},${new Date(r.timestamp).toISOString()},${r.rssi || ''},${r.deviceAddress || ''},${r.proof ? 'Yes' : 'No'}`).join('\n');
      await Share.share({ message: csvHeader + csvRows, title: `Export Attendance - ${currentSession.courseName || currentSession.courseId}` });
    } catch (e: any) { Alert.alert('Export Error', e.message); }
  };

  const handleExportReceipt = async () => {
    if (!currentSession) return;
    try { const receipt = await createSignedReceipt(currentSession.id); await Share.share({ message: JSON.stringify(receipt, null, 2), title: `Signed Receipt - ${currentSession.courseName || currentSession.courseId}` }); }
    catch (e: any) { Alert.alert('Export Error', e.message); }
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <Animated.View style={[styles.screen, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.8}><Text style={styles.backIcon}>←</Text></TouchableOpacity>
          <Text style={styles.topTitle}>Faculty Dashboard</Text>
          <View style={{ width: 44 }} />
        </View>

        {(!isSessionActive ? (
          <View style={styles.sessionSetup}>
            <Text style={styles.sectionTitle}>Create New Session</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Course ID *</Text>
              <TextInput style={styles.inputField} placeholder="e.g. CS101" value={facultyState.courseId} onChangeText={text => setFacultyState(s => ({ ...s, courseId: text }))} />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Course Name</Text>
              <TextInput style={styles.inputField} placeholder="e.g. Introduction to Computer Science" value={facultyState.courseName} onChangeText={text => setFacultyState(s => ({ ...s, courseName: text }))} />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Student Roster (one per line) *</Text>
              <TextInput style={[styles.inputField, styles.textArea]} placeholder="9240118001\n9240118002\n9240118003" value={facultyState.roster} onChangeText={text => setFacultyState(s => ({ ...s, roster: text }))} multiline />
            </View>
            <TouchableOpacity style={styles.btnPrimary} onPress={handleCreateSession} activeOpacity={0.85}><Text style={styles.btnPrimaryText}>▶  Start Session</Text></TouchableOpacity>
            <TouchableOpacity style={styles.btnSecondary} onPress={() => goBack()} activeOpacity={0.85}><Text style={styles.btnSecondaryText}>← Back</Text></TouchableOpacity>
          </View>
        ) : (
          <View style={styles.activeSession}>
            <PinCard pin={pinWindow?.pin || '----'} timeRemaining={pinTimeRemaining} isActive={isSessionActive} rotationSec={currentSession?.pinRotationSec || 30} />
            <View style={styles.counterRow}>
              <View style={styles.counterCard}><Text style={styles.counterNum}>{verificationResults.filter(v => v.result === VerificationResult.VERIFIED).length}</Text><Text style={styles.counterLabel}>Verified</Text></View>
              <View style={styles.counterCard}><Text style={[styles.counterNum, { color: C.purple }]}>{verificationResults.filter(v => v.result === VerificationResult.REPLAY_DETECTED).length}</Text><Text style={styles.counterLabel}>Replay Blocked</Text></View>
              <View style={styles.counterCard}><Text style={[styles.counterNum, { color: C.red }]}>{verificationResults.filter(v => v.result !== VerificationResult.VERIFIED && v.result !== VerificationResult.REPLAY_DETECTED).length}</Text><Text style={styles.counterLabel}>Invalid</Text></View>
            </View>
            <View style={styles.actionButtons}>
              <TouchableOpacity style={styles.btnDanger} onPress={handleEndSession} activeOpacity={0.85}><Text style={styles.btnDangerText}>■  End Session</Text></TouchableOpacity>
              <TouchableOpacity style={styles.btnSecondary} onPress={handleExportAttendance} activeOpacity={0.85}><Text style={styles.btnSecondaryText}>📊 Export CSV</Text></TouchableOpacity>
              <TouchableOpacity style={styles.btnSecondary} onPress={handleExportReceipt} activeOpacity={0.85}><Text style={styles.btnSecondaryText}>📝 Signed Receipt</Text></TouchableOpacity>
            </View>
            <View style={styles.resultsSection}>
              <Text style={styles.sectionTitle}>Live Verification</Text>
              <FlatList data={verificationResults.slice(0, 20)} renderItem={({ item }) => (
                <View style={[styles.resultItem, item.result === VerificationResult.VERIFIED ? styles.resultSuccess : item.result === VerificationResult.REPLAY_DETECTED ? styles.resultWarning : styles.resultError]}>
                  <Text style={styles.resultStudentId}>{item.studentId}</Text>
                  <View style={styles.resultMeta}>
                    <Text style={[styles.resultStatus, { color: item.result === VerificationResult.VERIFIED ? C.green : item.result === VerificationResult.REPLAY_DETECTED ? C.purple : C.red }]}>{item.result.replace('_', ' ')}</Text>
                    <Text style={styles.resultRssi}>{item.rssi} dBm</Text>
                  </View>
                </View>
              )} keyExtractor={item => item.id} contentContainerStyle={styles.resultsList} />
            </View>
          </View>
        ))}
      </Animated.View>
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  STUDENT SCREEN
// ═══════════════════════════════════════════════════════════════════
function StudentScreen({ 
  goBack, fadeAnim, slideAnim,
  startBroadcasting, stopBroadcasting, isBroadcasting, currentPin, pinTimeRemaining, broadcastError,
  studentState, setStudentState, hasRegistered, hasAttempted,
  registerStudent, saveStudentData, saveUsedPin,
}: {
  goBack: () => void;
  fadeAnim: Animated.Value;
  slideAnim: Animated.Value;
  startBroadcasting: (sessionId: string, studentId: string) => Promise<void>;
  stopBroadcasting: () => Promise<void>;
  isBroadcasting: boolean;
  currentPin: string | null;
  pinTimeRemaining: number;
  broadcastError: string | null;
  studentState: { studentId: string; hasAttempted: boolean; usedPins: string[]; isRegistered: boolean; publicKey: string };
  setStudentState: React.Dispatch<React.SetStateAction<{ studentId: string; hasAttempted: boolean; usedPins: string[]; isRegistered: boolean; publicKey: string }>>;
  hasRegistered: boolean;
  hasAttempted: boolean;
  registerStudent: (identity: StudentIdentity) => Promise<void>;
  saveStudentData: (studentId: string, publicKey: string) => Promise<void>;
  saveUsedPin: (pin: string) => Promise<void>;
}) {
  const handleRegister = async () => {
    if (!studentState.studentId.trim()) { Alert.alert('Required', 'Please enter your Enrollment Number'); return; }
    try {
      const keyPair = await generateStudentKeyPair();
      await storeStudentPrivateKey(studentState.studentId.trim(), keyPair.privateKey);
      await saveStudentData(studentState.studentId.trim(), keyPair.publicKey);
      const identity: StudentIdentity = { studentId: studentState.studentId.trim(), publicKey: keyPair.publicKey, keyAlgorithm: 'Ed25519', createdAt: Date.now() };
      await registerStudent(identity);
      HapticFeedback.trigger('notificationSuccess', hapticsOptions);
      Alert.alert('Registered!', 'Your cryptographic identity has been created and stored securely.');
    } catch (err) { Alert.alert('Error', err instanceof Error ? err.message : 'Registration failed'); }
  };

  const handleMarkAttendance = async () => {
    if (hasAttempted) { Alert.alert('Notice', 'Only one attempt allowed per session'); return; }
    if (!studentState.studentId.trim()) { Alert.alert('Required', 'Please enter your Enrollment Number'); return; }
    if (!currentPin) { Alert.alert('Error', 'No active PIN. Please wait for the session to start.'); return; }
    if (studentState.usedPins.includes(currentPin)) { Alert.alert('Notice', 'You have already used this PIN'); setStudentState(s => ({ ...s, hasAttempted: true })); await saveUsedPin(currentPin); return; }
    try { HapticFeedback.trigger('impactMedium', hapticsOptions); await startBroadcasting('current_session_id', studentState.studentId.trim()); } catch (err) { Alert.alert('Error', err instanceof Error ? err.message : 'Failed to mark attendance'); }
  };

  const statusType = broadcastError ? 'error' : isBroadcasting ? 'broadcasting' : hasAttempted ? 'success' : 'idle';
  const statusMessage = broadcastError ? broadcastError : isBroadcasting ? 'Broadcasting attendance...' : hasAttempted ? 'Attendance marked successfully!' : hasRegistered ? 'Ready to mark attendance' : 'Please register first';

return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <Animated.View style={[styles.screen, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.8}><Text style={styles.backIcon}>←</Text></TouchableOpacity>
          <Text style={styles.topTitle}>Mark Attendance</Text>
          <View style={{ width: 44 }} />
        </View>

        {(!hasRegistered ? (
          <View style={styles.registrationCard}>
            <Text style={styles.regTitle}>🔐 Secure Registration</Text>
            <Text style={styles.regText}>First-time setup: Generate your cryptographic identity. This creates a private key stored securely on your device.</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Enrollment Number</Text>
              <TextInput style={styles.inputField} placeholder="e.g. 9240118001" keyboardType="number-pad" value={studentState.studentId} onChangeText={text => setStudentState(s => ({ ...s, studentId: text }))} />
            </View>
            <TouchableOpacity style={styles.btnPrimary} onPress={handleRegister} activeOpacity={0.85}><Text style={styles.btnPrimaryText}>Register Identity</Text></TouchableOpacity>
          </View>
        ) : (
          <View>
            <View style={styles.statusCard}><AttendanceStatus type={statusType} message={statusMessage} pinTimeRemaining={pinTimeRemaining} onRetry={handleMarkAttendance} /></View>
            {isBroadcasting && currentPin && (
              <View style={styles.pinDisplay}><Text style={styles.pinLabel}>Current PIN</Text><Text style={styles.pinValue}>{currentPin}</Text><Text style={styles.pinHint}>Enter this on faculty device if needed</Text></View>
            )}
            {!isBroadcasting && !hasAttempted && (
              <TouchableOpacity style={styles.btnPrimary} onPress={handleMarkAttendance} activeOpacity={0.85} disabled={!currentPin}><Text style={styles.btnPrimaryText}>{currentPin ? '📡  Mark Attendance' : 'Waiting for session...'}</Text></TouchableOpacity>
            )}
            {hasAttempted && <Text style={styles.oneChanceNote}>Only one attempt allowed per session</Text>}
          </View>
        ))}
      </Animated.View>
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  SESSION HISTORY SCREEN
// ═══════════════════════════════════════════════════════════════════
function SessionHistoryScreen({ 
  goBack, fadeAnim, slideAnim,
  getAllSessions, getSessionWithAttendance, createSignedReceipt,
}: {
  goBack: () => void;
  fadeAnim: Animated.Value;
  slideAnim: Animated.Value;
  getAllSessions: () => Promise<SessionInfo[]>;
  getSessionWithAttendance: (sessionId: string) => Promise<{session: SessionInfo, attendance: AttendanceRecord[]} | null>;
  createSignedReceipt: (sessionId: string) => Promise<any>;
}) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [selectedSession, setSelectedSession] = useState<SessionInfo | null>(null);
  const [sessionDetails, setSessionDetails] = useState<{session: SessionInfo, attendance: AttendanceRecord[]} | null>(null);

  useEffect(() => { getAllSessions().then(setSessions); }, [getAllSessions]);

  const handleSessionPress = async (session: SessionInfo) => {
    const details = await getSessionWithAttendance(session.id);
    if (details) { setSelectedSession(session); setSessionDetails({ session: details, attendance: details.attendance }); }
  };

  const handleExportSession = async (session: SessionInfo) => {
    try { const receipt = await createSignedReceipt(session.id); await Share.share({ message: JSON.stringify(receipt, null, 2), title: `Signed Receipt - ${session.courseName || session.courseId}` }); }
    catch (e: any) { Alert.alert('Export Error', e.message); }
  };

  if (sessionDetails && selectedSession) {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
        <Animated.View style={[styles.screen, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.topBar}>
            <TouchableOpacity onPress={() => { setSelectedSession(null); setSessionDetails(null); }} style={styles.backBtn} activeOpacity={0.8}><Text style={styles.backIcon}>←</Text></TouchableOpacity>
            <Text style={styles.topTitle}>{selectedSession.courseName || selectedSession.courseId}</Text>
            <View style={{ width: 44 }} />
          </View>
          <ScrollView contentContainerStyle={styles.detailContent}>
            <View style={styles.detailCard}><Text style={styles.detailLabel}>Session ID</Text><Text style={styles.detailValue}>{selectedSession.id}</Text></View>
            <View style={styles.detailCard}><Text style={styles.detailLabel}>Date</Text><Text style={styles.detailValue}>{new Date(selectedSession.startTime).toLocaleDateString()}</Text></View>
            <View style={styles.detailCard}><Text style={styles.detailLabel}>Time</Text><Text style={styles.detailValue}>{new Date(selectedSession.startTime).toLocaleTimeString()}{selectedSession.endTime && ` - ${new Date(selectedSession.endTime).toLocaleTimeString()}`}</Text></View>
            <View style={styles.detailCard}><Text style={styles.detailLabel}>Status</Text><Text style={styles.detailValue}>{selectedSession.status}</Text></View>
            <View style={styles.detailCard}>
              <Text style={styles.detailLabel}>Attendance Summary</Text>
              <View style={styles.summaryRow}>
                <View style={styles.summaryItem}><Text style={[styles.summaryCount, { color: C.green }]}>{sessionDetails.attendance.filter(r => r.status === 'present').length}</Text><Text style={styles.summaryLabel}>Present</Text></View>
                <View style={styles.summaryItem}><Text style={[styles.summaryCount, { color: C.red }]}>{sessionDetails.attendance.filter(r => r.status === 'absent').length}</Text><Text style={styles.summaryLabel}>Absent</Text></View>
                <View style={styles.summaryItem}><Text style={[styles.summaryCount, { color: C.purple }]}>{sessionDetails.attendance.filter(r => r.status === 'late').length}</Text><Text style={styles.summaryLabel}>Late</Text></View>
                <View style={styles.summaryItem}><Text style={[styles.summaryCount, { color: C.red }]}>{sessionDetails.attendance.filter(r => r.status === 'invalid').length}</Text><Text style={styles.summaryLabel}>Invalid</Text></View>
              </View>
            </View>
            <TouchableOpacity style={styles.btnSecondary} onPress={() => handleExportSession(selectedSession)} activeOpacity={0.85}><Text style={styles.btnSecondaryText}>📝 Export Signed Receipt</Text></TouchableOpacity>
            <Text style={styles.sectionTitle}>Student Records</Text>
            <FlatList data={sessionDetails.attendance} renderItem={({ item }) => (
              <View style={[styles.recordItem, item.status === 'present' ? styles.recordPresent : item.status === 'late' ? styles.recordLate : styles.recordAbsent]}>
                <Text style={styles.recordStudentId}>{item.studentId}</Text>
                <View style={styles.recordMeta}>
                  <Text style={[styles.recordStatus, item.status === 'present' && { color: C.green }, item.status === 'late' && { color: C.purple }, item.status === 'absent' && { color: C.red }, item.status === 'invalid' && { color: C.red }]}>{item.status}</Text>
                  <Text style={styles.recordTime}>{new Date(item.timestamp).toLocaleTimeString()}</Text>
                  {item.rssi && <Text style={styles.recordRssi}>{item.rssi} dBm</Text>}
                </View>
              </View>
            )} keyExtractor={item => item.id} contentContainerStyle={styles.recordsList} />
          </ScrollView>
        </Animated.View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <Animated.View style={[styles.screen, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.8}><Text style={styles.backIcon}>←</Text></TouchableOpacity>
          <Text style={styles.topTitle}>Session History</Text>
          <View style={{ width: 44 }} />
        </View>
        <FlatList data={sessions} renderItem={({ item }) => (
          <SessionCard session={item} onPress={() => handleSessionPress(item)} />
        )} keyExtractor={item => item.id} contentContainerStyle={styles.sessionList} ItemSeparatorComponent={() => <View style={styles.separator} />} />
      </Animated.View>
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN APP
// ═══════════════════════════════════════════════════════════════════
export default function App() {
  const [mode, setMode] = useState<'IDLE' | 'FACULTY' | 'STUDENT' | 'SESSION_HISTORY'>('IDLE');
  const [studentState, setStudentState] = useState({ studentId: '', hasAttempted: false, usedPins: [] as string[], isRegistered: false, publicKey: '' });
  const [isOnline, setIsOnline] = useState(true);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  const { state: sessionState, createSession, loadSession, endSession, cancelSession, getAllSessions, getSessionWithAttendance, registerStudent, getStudentIdentity, getAllStudents, createSignedReceipt, refreshState } = useAttendanceSession();
  const { isScanning, startScanning, stopScanning, verificationResults } = useBleScanner();
  const { isBroadcasting, startBroadcasting, stopBroadcasting, currentPin, pinTimeRemaining, error: broadcastError } = useBleBroadcaster();

  useEffect(() => {
    Animated.parallel([ Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }), Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }) ]).start();
  }, [mode]);

  useEffect(() => { const unsub = NetInfo.addEventListener(s => setIsOnline(s.isConnected ?? false)); return () => unsub(); }, []);

  useEffect(() => {
    loadPersistedData();
    requestPermissions();
    initializeCrypto();
  }, []);

  useEffect(() => {
    if (sessionState.currentSession?.status === 'active') { startScanning().catch(() => {}); }
    return () => { stopScanning().catch(() => {}); stopBroadcasting().catch(() => {}); };
  }, [sessionState.currentSession?.status]);

  const loadPersistedData = async () => {
    try {
      const usedPinsData = await AsyncStorage.getItem('usedPins');
      if (usedPinsData) { const pins = JSON.parse(usedPinsData); if (Array.isArray(pins)) setStudentState(s => ({ ...s, usedPins: pins })); }
      const studentIdData = await AsyncStorage.getItem('studentId'); if (studentIdData) setStudentState(s => ({ ...s, studentId: studentIdData }));
      const regData = await AsyncStorage.getItem('isRegistered'); if (regData) setStudentState(s => ({ ...s, isRegistered: regData === 'true' }));
      const pubKeyData = await AsyncStorage.getItem('studentPublicKey'); if (pubKeyData) setStudentState(s => ({ ...s, publicKey: pubKeyData }));
    } catch (e) { console.warn('Failed to load persisted data:', e); }
  };

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      try { const perms = [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]; if (Number(Platform.Version) >= 31) { perms.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN); perms.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE); perms.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT); } await PermissionsAndroid.requestMultiple(perms); } catch (err) { console.warn('Permission request failed:', err); }
    }
  };

  const initializeCrypto = async () => { await getOrCreateMasterSecret(); };

  const saveStudentData = async (studentId: string, publicKey: string) => {
    await AsyncStorage.multiSet([['studentId', studentId], ['studentPublicKey', publicKey], ['isRegistered', 'true']]);
    setStudentState(s => ({ ...s, studentId, publicKey, isRegistered: true }));
  };

  const saveUsedPin = async (pin: string) => { const updated = [...studentState.usedPins, pin]; setStudentState(s => ({ ...s, usedPins: updated })); await AsyncStorage.setItem('usedPins', JSON.stringify(updated)); };

  const goBack = useCallback(() => {
    if (mode === 'STUDENT') { stopBroadcasting().catch(() => {}); setStudentState(s => ({ ...s, hasAttempted: false })); }
    else if (mode === 'FACULTY' || mode === 'SESSION_HISTORY') { stopScanning().catch(() => {}); }
    fadeAnim.setValue(0); slideAnim.setValue(30); setTimeout(() => setMode('IDLE'), 300);
  }, [mode, stopBroadcasting, stopScanning]);

  const handleSelectMode = useCallback((newMode: 'FACULTY' | 'STUDENT') => { fadeAnim.setValue(0); slideAnim.setValue(30); setTimeout(() => setMode(newMode), 300); }, []);

  // Render based on mode
  if (mode === 'IDLE') {
    return <HomeScreen onSelectMode={handleSelectMode} fadeAnim={fadeAnim} slideAnim={slideAnim} isOnline={isOnline} />;
  }
  if (mode === 'FACULTY') {
    return <FacultyScreen goBack={goBack} fadeAnim={fadeAnim} slideAnim={slideAnim} sessionState={sessionState} createSession={createSession} endSession={endSession} getAllSessions={getAllSessions} getSessionWithAttendance={getSessionWithAttendance} createSignedReceipt={createSignedReceipt} refreshState={refreshState} startScanning={startScanning} stopScanning={stopScanning} verificationResults={verificationResults} />;
  }
  if (mode === 'STUDENT') {
    return <StudentScreen goBack={goBack} fadeAnim={fadeAnim} slideAnim={slideAnim} startBroadcasting={startBroadcasting} stopBroadcasting={stopBroadcasting} isBroadcasting={isBroadcasting} currentPin={currentPin} pinTimeRemaining={pinTimeRemaining} broadcastError={broadcastError} studentState={studentState} setStudentState={setStudentState} hasRegistered={studentState.isRegistered} hasAttempted={studentState.hasAttempted} registerStudent={registerStudent} saveStudentData={saveStudentData} saveUsedPin={saveUsedPin} />;
  }
  if (mode === 'SESSION_HISTORY') {
    return <SessionHistoryScreen goBack={goBack} fadeAnim={fadeAnim} slideAnim={slideAnim} getAllSessions={getAllSessions} getSessionWithAttendance={getSessionWithAttendance} createSignedReceipt={createSignedReceipt} />;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════
//  STYLES
// ═══════════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  screen: { flex: 1, padding: 20 },
  homeScreen: { flex: 1, padding: 24, justifyContent: 'center' },
  detailContent: { padding: 20, paddingBottom: 40 },
  topBar: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, marginTop: 40 },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.bgCard, alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: C.white, fontSize: 22, fontWeight: '600' },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 20, fontWeight: '700', color: C.white, letterSpacing: 0.3 },
  networkBadge: { alignSelf: 'center', marginBottom: 24, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  networkOnline: { backgroundColor: C.greenBg, borderWidth: 1, borderColor: C.green },
  networkOffline: { backgroundColor: C.redBg, borderWidth: 1, borderColor: C.red },
  networkText: { fontSize: 12, fontWeight: '600' },
  logoArea: { alignItems: 'center', marginBottom: 48 },
  appName: { fontSize: 32, fontWeight: '800', color: C.white, letterSpacing: 0.5, textAlign: 'center' },
  appTagline: { fontSize: 14, color: C.lightGray, marginTop: 6, letterSpacing: 1 },
  roleButtons: { gap: 14, marginBottom: 40 },
  roleBtnFaculty: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.teal, borderRadius: 18, paddingVertical: 20, paddingHorizontal: 20, gap: 16, elevation: 6, shadowColor: C.teal, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, justifyContent: 'center' },
  roleBtnStudent: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.purpleDark, borderRadius: 18, paddingVertical: 20, paddingHorizontal: 20, gap: 16, elevation: 6, shadowColor: C.purpleDark, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, justifyContent: 'center' },
  roleBtnTitle: { fontSize: 18, fontWeight: '700', color: C.white, textAlign: 'center' },
  roleBtnSub: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2, textAlign: 'center' },
  footerNote: { textAlign: 'center', fontSize: 12, color: C.midGray, marginTop: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: C.white, marginBottom: 16, marginTop: 8 },
  inputGroup: { marginBottom: 18 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: C.lightGray, marginBottom: 8, letterSpacing: 0.2 },
  inputField: { backgroundColor: C.inputBg, borderRadius: 14, borderWidth: 1.5, borderColor: C.inputBorder, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: C.white, elevation: 1 },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  btnPrimary: { backgroundColor: C.teal, borderRadius: 16, paddingVertical: 18, alignItems: 'center', elevation: 4, shadowColor: C.teal, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, marginBottom: 12 },
  btnPrimaryText: { color: C.white, fontSize: 17, fontWeight: '700', letterSpacing: 0.3 },
  btnSecondary: { backgroundColor: C.bgCard, borderRadius: 16, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: C.border, marginBottom: 12 },
  btnSecondaryText: { color: C.teal, fontSize: 16, fontWeight: '600' },
  btnDanger: { backgroundColor: C.red, borderRadius: 16, paddingVertical: 18, alignItems: 'center', elevation: 4, shadowColor: C.red, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, marginBottom: 12 },
  btnDangerText: { color: C.white, fontSize: 17, fontWeight: '700', letterSpacing: 0.3 },
  actionButtons: { flexDirection: 'row', gap: 10, marginBottom: 16, flexWrap: 'wrap' },
  sessionSetup: { gap: 16 },
  activeSession: { flex: 1 },
  resultsSection: { flex: 1, marginTop: 16 },
  resultsList: { paddingBottom: 20 },
  resultItem: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, borderRadius: 10, marginBottom: 6, borderWidth: 1 },
  resultSuccess: { backgroundColor: C.greenBg, borderColor: C.green },
  resultWarning: { backgroundColor: '#2d2a1a', borderColor: C.purple },
  resultError: { backgroundColor: C.redBg, borderColor: C.red },
  resultStudentId: { fontSize: 14, fontWeight: '600', color: C.white },
  resultMeta: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  resultStatus: { fontSize: 12, fontWeight: '600' },
  resultRssi: { fontSize: 11, color: C.midGray, fontFamily: 'monospace' },
  counterRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  counterCard: { flex: 1, backgroundColor: C.bgCard, borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  counterNum: { fontSize: 28, fontWeight: '800', color: C.green },
  counterLabel: { fontSize: 12, color: C.lightGray, marginTop: 2, fontWeight: '500' },
  regTitle: { fontSize: 22, fontWeight: '800', color: C.white, textAlign: 'center', marginBottom: 8 },
  regText: { fontSize: 14, color: C.lightGray, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  registrationCard: { padding: 24, backgroundColor: C.bgCard, borderRadius: 20, borderWidth: 1, borderColor: C.border },
  statusCard: { marginBottom: 16 },
  pinDisplay: { backgroundColor: C.teal, borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 16 },
  pinLabel: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.8)', letterSpacing: 2, marginBottom: 4 },
  pinValue: { fontSize: 48, fontWeight: '900', color: C.white, letterSpacing: 16, fontFamily: 'monospace' },
  pinHint: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 8 },
  oneChanceNote: { textAlign: 'center', fontSize: 12, color: C.midGray, marginTop: 10 },
  detailCard: { backgroundColor: C.bgCard, borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  detailLabel: { fontSize: 12, fontWeight: '600', color: C.midGray, marginBottom: 4 },
  detailValue: { fontSize: 14, color: C.white, fontWeight: '500' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 12 },
  summaryItem: { alignItems: 'center' },
  summaryCount: { fontSize: 28, fontWeight: '800' },
  summaryLabel: { fontSize: 11, color: C.lightGray, marginTop: 2 },
  recordItem: { flexDirection: 'row', justifyContent: 'space-between', padding: 14, backgroundColor: C.bgCard, borderRadius: 10, marginBottom: 8, borderWidth: 1, borderColor: C.border },
  recordPresent: { borderColor: C.green },
  recordLate: { borderColor: C.purple },
  recordAbsent: { borderColor: C.red },
  recordStudentId: { fontSize: 15, fontWeight: '600', color: C.white },
  recordMeta: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  recordStatus: { fontSize: 12, fontWeight: '600' },
  recordTime: { fontSize: 11, color: C.midGray },
  recordRssi: { fontSize: 11, color: C.midGray, fontFamily: 'monospace' },
  recordsList: { paddingBottom: 20 },
  sessionList: { paddingBottom: 40 },
  separator: { height: 8 },
});