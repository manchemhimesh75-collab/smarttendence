import { openDatabase } from 'react-native-quick-sqlite';

const DB_NAME = 'attendance.db';
const DB_VERSION = 1;

let db: ReturnType<typeof openDatabase> | null = null;

export function getDatabase() {
  if (!db) {
    db = openDatabase({ name: DB_NAME, location: 'default' });
  }
  return db;
}

export function initializeDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const database = getDatabase();
    database.transaction(tx => {
      tx.executeSql(
        `CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          course_id TEXT NOT NULL,
          course_name TEXT,
          faculty_id TEXT NOT NULL,
          start_time INTEGER NOT NULL,
          end_time INTEGER,
          status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'cancelled')),
          pin_rotation_sec INTEGER NOT NULL,
          roster TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )`,
        [],
        () => {},
        (_, error) => {
          console.error('Error creating sessions table:', error);
          return true;
        }
      );

      tx.executeSql(
        `CREATE TABLE IF NOT EXISTS attendance_records (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          student_id TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late', 'invalid')),
          timestamp INTEGER NOT NULL,
          rssi INTEGER,
          device_address TEXT,
          proof TEXT,
          synced INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (session_id) REFERENCES sessions (id)
        )`,
        [],
        () => {},
        (_, error) => {
          console.error('Error creating attendance_records table:', error);
          return true;
        }
      );

      tx.executeSql(
        `CREATE TABLE IF NOT EXISTS student_identities (
          student_id TEXT PRIMARY KEY,
          public_key TEXT NOT NULL,
          key_algorithm TEXT NOT NULL,
          created_at INTEGER NOT NULL
        )`,
        [],
        () => {},
        (_, error) => {
          console.error('Error creating student_identities table:', error);
          return true;
        }
      );

      tx.executeSql(
        `CREATE TABLE IF NOT EXISTS sync_queue (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          payload TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('pending', 'syncing', 'synced', 'failed')),
          retry_count INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )`,
        [],
        () => {},
        (_, error) => {
          console.error('Error creating sync_queue table:', error);
          return true;
        }
      );

      tx.executeSql(
        `CREATE INDEX IF NOT EXISTS idx_attendance_session ON attendance_records(session_id)`,
        [],
        () => {},
        (_, error) => { console.error('Index error:', error); return true; }
      );

      tx.executeSql(
        `CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance_records(student_id)`,
        [],
        () => {},
        (_, error) => { console.error('Index error:', error); return true; }
      );

      tx.executeSql(
        `CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status)`,
        [],
        () => {},
        (_, error) => { console.error('Index error:', error); return true; }
      );
    }, error => {
      console.error('Transaction error:', error);
      reject(error);
      return true;
    }, () => {
      resolve();
    });
  });
}

export function closeDatabase(): Promise<void> {
  return new Promise((resolve) => {
    if (db) {
      db.close();
      db = null;
    }
    resolve();
  });
}

export async function runMigration(): Promise<void> {
  const database = getDatabase();
  return new Promise((resolve, reject) => {
    database.transaction(tx => {
      tx.executeSql(
        `PRAGMA user_version`,
        [],
        (_, result) => {
          const currentVersion = result.rows.item(0)['user_version'] as number;
          if (currentVersion < DB_VERSION) {
            tx.executeSql(`PRAGMA user_version = ${DB_VERSION}`, [], () => {}, () => true);
          }
        },
        (_, error) => { console.error('Migration error:', error); return true; }
      );
    }, error => reject(error), () => resolve());
  });
}