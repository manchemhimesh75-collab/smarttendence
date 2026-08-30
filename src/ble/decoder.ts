import { BleAdvertisementPayload } from './protocol';
import { decodePayload } from './encoder';

export { decodePayload };

export function parseManufacturerData(data: Uint8Array): BleAdvertisementPayload | null {
  try {
    const decoder = new TextDecoder();
    const str = decoder.decode(data);
    return decodePayload(str);
  } catch {
    return null;
  }
}

export function parseIosLocalName(localName: string): BleAdvertisementPayload | null {
  return decodePayload(localName);
}