import { useState, useEffect, useCallback } from 'react';
import { sessionManager, SessionManagerState, SessionInfo, CreateSessionInput, SessionWithAttendance, StudentIdentity } from '../sessions';
import { AttendanceRecord, AttendanceStatus } from '../sessions/sessionTypes';

export interface UseAttendanceSessionReturn {
  state: SessionManagerState;
  createSession: (input: CreateSessionInput) => Promise<SessionInfo>;
  loadSession: (sessionId: string) => Promise<SessionInfo | null>;
  endSession: () => Promise<void>;
  cancelSession: () => Promise<void>;
  getAllSessions: () => Promise<SessionInfo[]>;
  getSessionWithAttendance: (sessionId: string) => Promise<SessionWithAttendance | null>;
  registerStudent: (identity: StudentIdentity) => Promise<void>;
  getStudentIdentity: (studentId: string) => Promise<StudentIdentity | null>;
  getAllStudents: () => Promise<StudentIdentity[]>;
  createSignedReceipt: (sessionId: string) => Promise<import('../sessions/sessionTypes').SignedAttendanceReceipt>;
  refreshState: () => void;
}

export function useAttendanceSession(): UseAttendanceSessionReturn {
  const [state, setState] = useState<SessionManagerState>(sessionManager.getState());

  useEffect(() => {
    return sessionManager.subscribe(setState);
  }, []);

  const refreshState = useCallback(() => {
    setState(sessionManager.getState());
  }, []);

  const createSession = useCallback(async (input: CreateSessionInput) => {
    return sessionManager.createSession(input);
  }, []);

  const loadSession = useCallback(async (sessionId: string) => {
    return sessionManager.loadSession(sessionId);
  }, []);

  const endSession = useCallback(async () => {
    return sessionManager.endSession();
  }, []);

  const cancelSession = useCallback(async () => {
    return sessionManager.cancelSession();
  }, []);

  const getAllSessions = useCallback(async () => {
    return sessionManager.getAllSessions();
  }, []);

  const getSessionWithAttendance = useCallback(async (sessionId: string) => {
    return sessionManager.getSessionWithAttendance(sessionId);
  }, []);

  const registerStudent = useCallback(async (identity: StudentIdentity) => {
    return sessionManager.registerStudentIdentity(identity);
  }, []);

  const getStudentIdentity = useCallback(async (studentId: string) => {
    return sessionManager.getStudentIdentity(studentId);
  }, []);

  const getAllStudents = useCallback(async () => {
    return sessionManager.getAllStudentIdentities();
  }, []);

  const createSignedReceipt = useCallback(async (sessionId: string) => {
    return sessionManager.createSignedReceipt(sessionId);
  }, []);

  return {
    state,
    createSession,
    loadSession,
    endSession,
    cancelSession,
    getAllSessions,
    getSessionWithAttendance,
    registerStudent,
    getStudentIdentity,
    getAllStudents,
    createSignedReceipt,
    refreshState,
  };
}