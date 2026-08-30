import { BleAdvertisementPayload, BleScanResult } from '../ble';

export interface BleBroadcasterNative {
  startBroadcasting(payload: string): Promise<void>;
  stopBroadcasting(): Promise<void>;
}

export interface BleScannerNative {
  startScanning(): Promise<void>;
  stopScanning(): Promise<void>;
}

export interface BleEventEmitter {
  addListener(eventName: 'onAttendanceReceived', listener: (event: BleScanResult) => void): { remove: () => void };
  addListener(eventName: 'onScanError', listener: (event: { message: string; code?: string }) => void): { remove: () => void };
  addListener(eventName: 'onBluetoothStateChange', listener: (event: { state: string }) => void): { remove: () => void };
  removeListeners(count: number): void;
}

export interface NativeModuleExports {
  BLEBroadcasterModule: BleBroadcasterNative & BleScannerNative;
}