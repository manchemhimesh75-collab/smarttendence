import { getDatabase } from './database';
import { StudentIdentity } from '../sessions/sessionTypes';

function identityFromRow(row: Record<string, unknown>): StudentIdentity {
  return {
    studentId: row.student_id as string,
    publicKey: row.public_key as string,
    keyAlgorithm: row.key_algorithm as 'Ed25519',
    createdAt: row.created_at as number,
  };
}

export async function saveStudentIdentity(identity: StudentIdentity): Promise<void> {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.transaction(tx => {
      tx.executeSql(
        `INSERT OR REPLACE INTO student_identities (student_id, public_key, key_algorithm, created_at)
         VALUES (?, ?, ?, ?)`,
        [identity.studentId, identity.publicKey, identity.keyAlgorithm, identity.createdAt],
        () => {},
        (_, error) => { console.error('Save student identity error:', error); return true; }
      );
    }, error => reject(error), () => resolve());
  });
}

export async function getStudentIdentity(studentId: string): Promise<StudentIdentity | null> {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.transaction(tx => {
      tx.executeSql(
        `SELECT * FROM student_identities WHERE student_id = ?`,
        [studentId],
        (_, result) => {
          if (result.rows.length > 0) {
            resolve(identityFromRow(result.rows.item(0)));
          } else {
            resolve(null);
          }
        },
        (_, error) => { console.error('Get student identity error:', error); return true; }
      );
    }, error => reject(error));
  });
}

export async function getAllStudentIdentities(): Promise<StudentIdentity[]> {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.transaction(tx => {
      tx.executeSql(
        `SELECT * FROM student_identities ORDER BY created_at DESC`,
        [],
        (_, result) => {
          const identities: StudentIdentity[] = [];
          for (let i = 0; i < result.rows.length; i++) {
            identities.push(identityFromRow(result.rows.item(i)));
          }
          resolve(identities);
        },
        (_, error) => { console.error('Get all student identities error:', error); return true; }
      );
    }, error => reject(error));
  });
}

export async function deleteStudentIdentity(studentId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.transaction(tx => {
      tx.executeSql(`DELETE FROM student_identities WHERE student_id = ?`, [studentId], () => {}, (_, error) => { console.error('Delete student identity error:', error); return true; });
    }, error => reject(error), () => resolve());
  });
}

export async function studentExists(studentId: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.transaction(tx => {
      tx.executeSql(
        `SELECT 1 FROM student_identities WHERE student_id = ? LIMIT 1`,
        [studentId],
        (_, result) => {
          resolve(result.rows.length > 0);
        },
        (_, error) => { console.error('Student exists error:', error); return true; }
      );
    }, error => reject(error));
  });
}