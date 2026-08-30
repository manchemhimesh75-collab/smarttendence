import { NativeModules, NativeEventEmitter } from 'react-native';
import { BleAdvertisementPayload, BleScanResult } from '../ble';

const { BLEBroadcasterModule } = NativeModules;

export interface BleBroadcasterNative {
  startBroadcasting(payload: string): Promise<void>;
  stopBroadcasting(): Promise<void>;
  startScanning(): Promise<void>;
  stopScanning(): Promise<void>;
}

export interface BleScannerNative {
  startScanning(): Promise<void>;
  stopScanning(): Promise<void>;
}

export const BLEBroadcaster = {
  startBroadcasting: async (payload: BleAdvertisementPayload): Promise<void> => {
    const encoded = JSON.stringify(payload);
    return BLEBroadcasterModule.startBroadcasting(encoded);
  },
  stopBroadcasting: async (): Promise<void> => {
    return BLEBroadcasterModule.stopBroadcasting();
  },
};

export const BLEScanner = {
  startScanning: async (): Promise<void> => {
    return BLEBroadcasterModule.startScanning();
  },
  stopScanning: async (): Promise<void> => {
    return BLEBroadcasterModule.stopScanning();
  },
};

export const bleEmitter = new NativeEventEmitter(BLEBroadcasterModule);

export function addBleAttendanceListener(
  listener: (event: BleScanResult) => void
): () => void {
  const subscription = bleEmitter.addListener('onAttendanceReceived', (event: BleScanResult) => {
    listener(event);
  });
  return () => subscription.remove();
}

export function addBleErrorListener(
  listener: (error: { message: string; code?: string }) => void
): () => void {
  const subscription = bleEmitter.addListener('onScanError', (event: { message: string; code?: string }) => {
    listener(event);
  });
  return () => subscription.remove();
}

export function addBleStateListener(
  listener: (state: { state: string }) => void
): () => void {
  const subscription = bleEmitter.addListener('onBluetoothStateChange', (event: { state: string }) => {
    listener(event);
  });
  return () => subscription.remove();
}