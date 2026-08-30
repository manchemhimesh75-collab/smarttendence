import { BleScanResult } from './protocol';

export interface BleScanner {
  startScanning(): Promise<void>;
  stopScanning(): Promise<void>;
  addListener(eventName: 'onAttendanceReceived', listener: (event: BleScanResult) => void): void;
  removeListeners(count: number): void;
}

export interface ScanConfig {
  serviceUUID: string;
  scanMode: 'low_latency' | 'balanced' | 'low_power';
  allowDuplicates: boolean;
}

export const DEFAULT_SCAN_CONFIG: ScanConfig = {
  serviceUUID: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  scanMode: 'low_latency',
  allowDuplicates: true,
};