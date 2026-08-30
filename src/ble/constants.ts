export const BLE_CONSTANTS = {
  SERVICE_UUID: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' as const,
  CHARACTERISTIC_UUID: 'f0e1d2c3-b4a5-9678-89ab-cdef01234567' as const,
  PROTOCOL_VERSION: 1 as const,
  PAYLOAD_VERSION: 1 as const,
  MAX_PAYLOAD_SIZE: 512 as const,
  DEFAULT_PIN_ROTATION_SEC: 30 as const,
  TIMESTAMP_FRESHNESS_WINDOW_MS: 30000 as const,
  ADVERTISING_INTERVAL_MS: 100 as const,
} as const;

export const ATTENDANCE_STATUS = {
  PRESENT: 'present' as const,
  ABSENT: 'absent' as const,
  LATE: 'late' as const,
  INVALID: 'invalid' as const,
} as const;

export type AttendanceStatus = typeof ATTENDANCE_STATUS[keyof typeof ATTENDANCE_STATUS];

export const VERIFICATION_RESULT = {
  VERIFIED: 'verified' as const,
  INVALID_SIGNATURE: 'invalid_signature' as const,
  REPLAY_DETECTED: 'replay_detected' as const,
  UNKNOWN_STUDENT: 'unknown_student' as const,
  EXPIRED_PROOF: 'expired_proof' as const,
  INVALID_NONCE: 'invalid_nonce' as const,
  MODIFIED_PAYLOAD: 'modified_payload' as const,
  WRONG_SESSION: 'wrong_session' as const,
  UNREGISTERED_STUDENT: 'unregistered_student' as const,
} as const;

export type VerificationResult = typeof VERIFICATION_RESULT[keyof typeof VERIFICATION_RESULT];