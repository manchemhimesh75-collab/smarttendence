import { BleAdvertisementPayload } from './protocol';

export interface BleBroadcaster {
  startBroadcasting(payload: BleAdvertisementPayload): Promise<void>;
  stopBroadcasting(): Promise<void>;
}

export interface BroadcastConfig {
  serviceUUID: string;
  advertisingIntervalMs: number;
  txPowerLevel: 'high' | 'medium' | 'low';
}

export const DEFAULT_BROADCAST_CONFIG: BroadcastConfig = {
  serviceUUID: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  advertisingIntervalMs: 100,
  txPowerLevel: 'high',
};