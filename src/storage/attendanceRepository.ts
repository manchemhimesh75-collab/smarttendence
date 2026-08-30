import { getDatabase } from './database';
import { AttendanceRecord, AttendanceStatus } from '../sessions/sessionTypes';

function recordFromRow(row: Record<string, unknown>): AttendanceRecord {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    studentId: row.student_id as string,
    status: row.status as AttendanceStatus,
    timestamp: row.timestamp as number,
    rssi: row.rssi as number | undefined,
    deviceAddress: row.device_address as string | undefined,
    proof: row.proof ? JSON.parse(row.proof as string) : undefined,
    synced: Boolean(row.synced),
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

export async function saveAttendanceRecord(record: AttendanceRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.transaction(tx => {
      tx.executeSql(
        `INSERT OR REPLACE INTO attendance_records
         (id, session_id, student_id, status, timestamp, rssi, device_address, proof, synced, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.id,
          record.sessionId,
          record.studentId,
          record.status,
          record.timestamp,
          record.rssi || null,
          record.deviceAddress || null,
          record.proof ? JSON.stringify(record.proof) : null,
          record.synced ? 1 : 0,
          record.createdAt,
          Date.now(),
        ],
        () => {},
        (_, error) => { console.error('Save attendance record error:', error); return true; }
      );
    }, error => reject(error), () => resolve());
  });
}

export async function getAttendanceRecord(recordId: string): Promise<AttendanceRecord | null> {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.transaction(tx => {
      tx.executeSql(
        `SELECT * FROM attendance_records WHERE id = ?`,
        [recordId],
        (_, result) => {
          if (result.rows.length > 0) {
            resolve(recordFromRow(result.rows.item(0)));
          } else {
            resolve(null);
          }
        },
        (_, error) => { console.error('Get attendance record error:', error); return true; }
      );
    }, error => reject(error));
  });
}

export async function getAttendanceRecordsBySession(sessionId: string): Promise<AttendanceRecord[]> {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.transaction(tx => {
      tx.executeSql(
        `SELECT * FROM attendance_records WHERE session_id = ? ORDER BY timestamp`,
        [sessionId],
        (_, result) => {
          const records: AttendanceRecord[] = [];
          for (let i = 0; i < result.rows.length; i++) {
            records.push(recordFromRow(result.rows.item(i)));
          }
          resolve(records);
        },
        (_, error) => { console.error('Get attendance records by session error:', error); return true; }
      );
    }, error => reject(error));
  });
}

export async function getAttendanceRecordsByStudent(studentId: string): Promise<AttendanceRecord[]> {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.transaction(tx => {
      tx.executeSql(
        `SELECT * FROM attendance_records WHERE student_id = ? ORDER BY timestamp DESC`,
        [studentId],
        (_, result) => {
          const records: AttendanceRecord[] = [];
          for (let i = 0; i < result.rows.length; i++) {
            records.push(recordFromRow(result.rows.item(i)));
          }
          resolve(records);
        },
        (_, error) => { console.error('Get attendance records by student error:', error); return true; }
      );
    }, error => reject(error));
  });
}

export async function getAllAttendanceRecords(): Promise<AttendanceRecord[]> {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.transaction(tx => {
      tx.executeSql(
        `SELECT * FROM attendance_records ORDER BY timestamp DESC`,
        [],
        (_, result) => {
          const records: AttendanceRecord[] = [];
          for (let i = 0; i < result.rows.length; i++) {
            records.push(recordFromRow(result.rows.item(i)));
          }
          resolve(records);
        },
        (_, error) => { console.error('Get all attendance records error:', error); return true; }
      );
    }, error => reject(error));
  });
}

export async function updateAttendanceRecordSynced(recordId: string, synced: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.transaction(tx => {
      tx.executeSql(
        `UPDATE attendance_records SET synced = ?, updated_at = ? WHERE id = ?`,
        [synced ? 1 : 0, Date.now(), recordId],
        () => {},
        (_, error) => { console.error('Update attendance synced error:', error); return true; }
      );
    }, error => reject(error), () => resolve());
  });
}

export async function getUnsyncedAttendanceRecords(): Promise<AttendanceRecord[]> {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.transaction(tx => {
      tx.executeSql(
        `SELECT * FROM attendance_records WHERE synced = 0 ORDER BY timestamp`,
        [],
        (_, result) => {
          const records: AttendanceRecord[] = [];
          for (let i = 0; i < result.rows.length; i++) {
            records.push(recordFromRow(result.rows.item(i)));
          }
          resolve(records);
        },
        (_, error) => { console.error('Get unsynced records error:', error); return true; }
      );
    }, error => reject(error));
  });
}

export async function deleteAttendanceRecord(recordId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.transaction(tx => {
      tx.executeSql(`DELETE FROM attendance_records WHERE id = ?`, [recordId], () => {}, (_, error) => { console.error('Delete attendance record error:', error); return true; });
    }, error => reject(error), () => resolve());
  });
}