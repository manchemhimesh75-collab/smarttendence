import { useState, useCallback, useRef, useEffect } from 'react';
import { BleAdvertisementPayload } from '../ble';
import { BLEBroadcaster } from '../native';
import { sessionManager } from '../sessions';
import { getStudentPrivateKey } from '../crypto/secureStorage';
import { createStudentAttendanceProof } from '../sessions/sessionManager';

export interface UseBleBroadcasterReturn {
  isBroadcasting: boolean;
  startBroadcasting: (sessionId: string, studentId: string) => Promise<void>;
  stopBroadcasting: () => Promise<void>;
  error: string | null;
  currentPin: string | null;
  pinTimeRemaining: number;
}

export function useBleBroadcaster(): UseBleBroadcasterReturn {
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPin, setCurrentPin] = useState<string | null>(null);
  const [pinTimeRemaining, setPinTimeRemaining] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionRef = useRef<{ sessionId: string; studentId: string } | null>(null);

  const updatePinInfo = useCallback(() => {
    const pinWindow = sessionManager.getCurrentPin();
    if (pinWindow) {
      setCurrentPin(pinWindow.pin);
      setPinTimeRemaining(Math.max(0, pinWindow.expiresAt - Date.now()));
    } else {
      setCurrentPin(null);
      setPinTimeRemaining(0);
    }
  }, []);

  useEffect(() => {
    updatePinInfo();
    intervalRef.current = setInterval(updatePinInfo, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [updatePinInfo]);

  const startBroadcasting = async (sessionId: string, studentId: string) => {
    setError(null);
    sessionRef.current = { sessionId, studentId };

    try {
      const privateKey = await getStudentPrivateKey(studentId);
      if (!privateKey) {
        throw new Error('Student private key not found. Please register first.');
      }

      const pinWindow = sessionManager.getCurrentPin();
      if (!pinWindow) {
        throw new Error('No active PIN window');
      }

      const proof = await createStudentAttendanceProof(
        sessionId,
        studentId,
        pinWindow.window,
        privateKey,
        pinWindow.pin
      );

      const payload: BleAdvertisementPayload = {
        protocolVersion: proof.protocolVersion,
        payloadVersion: proof.payloadVersion,
        sessionId: proof.sessionId,
        studentId: proof.studentId,
        pinWindow: proof.pinWindow,
        timestamp: proof.timestamp,
        nonce: proof.nonce,
        signature: proof.signature,
        publicKey: proof.publicKey,
      };

      await BLEBroadcaster.startBroadcasting(payload);
      setIsBroadcasting(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start broadcasting');
      throw err;
    }
  };

  const stopBroadcasting = async () => {
    try {
      await BLEBroadcaster.stopBroadcasting();
      setIsBroadcasting(false);
      sessionRef.current = null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop broadcasting');
      throw err;
    }
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return {
    isBroadcasting,
    startBroadcasting,
    stopBroadcasting,
    error,
    currentPin,
    pinTimeRemaining,
  };
}