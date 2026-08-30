import { useEffect, useRef, useState, useCallback } from 'react';
import { BleScanResult } from '../ble';
import { addBleAttendanceListener, addBleErrorListener, BLEScanner } from '../native';
import { sessionManager } from '../sessions';
import { VerificationResult } from '../ble/constants';

export interface UseBleScannerReturn {
  isScanning: boolean;
  startScanning: () => Promise<void>;
  stopScanning: () => Promise<void>;
  lastResult: BleScanResult | null;
  error: string | null;
  verificationResults: VerificationEvent[];
}

export interface VerificationEvent {
  id: string;
  timestamp: number;
  studentId: string;
  result: VerificationResult;
  rssi: number;
  deviceAddress: string;
}

export function useBleScanner(): UseBleScannerReturn {
  const [isScanning, setIsScanning] = useState(false);
  const [lastResult, setLastResult] = useState<BleScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verificationResults, setVerificationResults] = useState<VerificationEvent[]>([]);
  const seenResults = useRef<Set<string>>(new Set());

  const handleAttendanceReceived = useCallback((event: BleScanResult) => {
    const key = `${event.payload.sessionId}:${event.payload.studentId}:${event.payload.nonce}`;
    if (seenResults.current.has(key)) return;
    seenResults.current.add(key);

    setLastResult(event);

    sessionManager.verifyAttendance(event.payload, event.rssi, event.deviceAddress)
      .then(detail => {
        const verificationEvent: VerificationEvent = {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          studentId: event.payload.studentId,
          result: detail.result,
          rssi: event.rssi,
          deviceAddress: event.deviceAddress,
        };
        setVerificationResults(prev => [verificationEvent, ...prev.slice(0, 49)]);
      })
      .catch(err => {
        console.error('Verification error:', err);
      });
  }, []);

  const handleError = useCallback((event: { message: string; code?: string }) => {
    setError(event.message);
  }, []);

  useEffect(() => {
    const removeAttendance = addBleAttendanceListener(handleAttendanceReceived);
    const removeError = addBleErrorListener(handleError);
    return () => {
      removeAttendance();
      removeError();
    };
  }, [handleAttendanceReceived, handleError]);

  const startScanning = async () => {
    setError(null);
    seenResults.current.clear();
    try {
      await BLEScanner.startScanning();
      setIsScanning(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start scanning');
      throw err;
    }
  };

  const stopScanning = async () => {
    try {
      await BLEScanner.stopScanning();
      setIsScanning(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop scanning');
      throw err;
    }
  };

  return {
    isScanning,
    startScanning,
    stopScanning,
    lastResult,
    error,
    verificationResults,
  };
}