import { 
  generateSecureRandom, 
  generatePin, 
  toBase64Url, 
  fromBase64Url,
  toHex,
  fromHex,
  constantTimeEqual,
} from '../src/crypto/keys';
import { canonicalizeAttendancePayload, hashSha256, toBase64Url as hashToBase64Url } from '../src/crypto/hashing';

describe('Crypto Utilities', () => {
  describe('generateSecureRandom', () => {
    it('should generate random bytes of correct length', () => {
      const bytes = generateSecureRandom(32);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBe(32);
    });

    it('should generate different values on each call', () => {
      const bytes1 = generateSecureRandom(32);
      const bytes2 = generateSecureRandom(32);
      expect(bytes1).not.toEqual(bytes2);
    });
  });

  describe('generatePin', () => {
    it('should generate PIN of correct length', () => {
      const pin = generatePin(6);
      expect(pin.length).toBe(6);
      expect(/^\d+$/.test(pin)).toBe(true);
    });

    it('should generate different PINs', () => {
      const pins = new Set<string>();
      for (let i = 0; i < 100; i++) {
        pins.add(generatePin(6));
      }
      expect(pins.size).toBeGreaterThan(90); // High entropy
    });
  });

  describe('Base64URL encoding', () => {
    it('should encode and decode correctly', () => {
      const data = new Uint8Array([0x00, 0xff, 0x7f, 0x80, 0x12, 0x34, 0x56, 0x78]);
      const encoded = toBase64Url(data);
      const decoded = fromBase64Url(encoded);
      expect(decoded).toEqual(data);
    });

    it('should not contain + or / or =', () => {
      const data = generateSecureRandom(32);
      const encoded = toBase64Url(data);
      expect(encoded).not.toMatch(/[\+\/=]/);
    });
  });

  describe('Hex encoding', () => {
    it('should encode and decode correctly', () => {
      const data = new Uint8Array([0x00, 0xff, 0x7f, 0x80]);
      const encoded = toHex(data);
      expect(encoded).toBe('00ff7f80');
      const decoded = fromHex(encoded);
      expect(decoded).toEqual(data);
    });
  });

  describe('constantTimeEqual', () => {
    it('should return true for equal arrays', () => {
      const a = new Uint8Array([1, 2, 3, 4]);
      const b = new Uint8Array([1, 2, 3, 4]);
      expect(constantTimeEqual(a, b)).toBe(true);
    });

    it('should return false for different arrays', () => {
      const a = new Uint8Array([1, 2, 3, 4]);
      const b = new Uint8Array([1, 2, 3, 5]);
      expect(constantTimeEqual(a, b)).toBe(false);
    });

    it('should return false for different lengths', () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([1, 2, 3, 4]);
      expect(constantTimeEqual(a, b)).toBe(false);
    });
  });

  describe('canonicalizeAttendancePayload', () => {
    it('should produce deterministic output for same input', () => {
      const payload = {
        sessionId: 'test-session',
        studentId: '9240118001',
        timestamp: 1234567890,
        nonce: 'a'.repeat(32),
      };
      const canon1 = canonicalizeAttendancePayload(payload);
      const canon2 = canonicalizeAttendancePayload(payload);
      expect(canon1).toEqual(canon2);
    });

    it('should sort keys alphabetically', () => {
      const payload = {
        z: 1,
        a: 2,
        m: 3,
      };
      const canon = canonicalizeAttendancePayload(payload);
      const str = new TextDecoder().decode(canon);
      expect(str).toBe('{"a":2,"m":3,"z":1}');
    });

    it('should handle nested objects', () => {
      const payload = {
        outer: {
          inner: 'value',
        },
      };
      const canon = canonicalizeAttendancePayload(payload);
      const str = new TextDecoder().decode(canon);
      expect(str).toBe('{"outer":{"inner":"value"}}');
    });
  });

  describe('hashSha256', () => {
    it('should produce consistent hash for same input', async () => {
      const data = new TextEncoder().encode('test data');
      const hash1 = await hashSha256(data);
      const hash2 = await hashSha256(data);
      expect(hash1).toEqual(hash2);
    });

    it('should produce different hashes for different input', async () => {
      const hash1 = await hashSha256(new TextEncoder().encode('data1'));
      const hash2 = await hashSha256(new TextEncoder().encode('data2'));
      expect(hash1).not.toEqual(hash2);
    });

    it('should produce 32-byte output', async () => {
      const hash = await hashSha256(new TextEncoder().encode('test'));
      expect(hash.length).toBe(32);
    });
  });
});