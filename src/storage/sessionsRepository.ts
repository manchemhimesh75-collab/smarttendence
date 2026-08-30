import { getDatabase } from './database';
import { SessionInfo, CreateSessionInput } from '../sessions/sessionTypes';

function sessionFromRow(row: Record<string, unknown>): SessionInfo {
  return {
    id: row.id as string,
    courseId: row.course_id as string,
    courseName: row.course_name as string | undefined,
    facultyId: row.faculty_id as string,
    startTime: row.start_time as number,
    endTime: row.end_time as number | undefined,
    status: row.status as 'active' | 'completed' | 'cancelled',
    pinRotationSec: row.pin_rotation_sec as number,
    roster: JSON.parse(row.roster as string),
  };
}

function sessionToRow(session: SessionInfo): (string | number)[] {
  return [
    session.id,
    session.courseId,
    session.courseName || null,
    session.facultyId,
    session.startTime,
    session.endTime || null,
    session.status,
    session.pinRotationSec,
    JSON.stringify(session.roster),
    Date.now(),
    Date.now(),
  ];
}

export async function saveSession(session: SessionInfo): Promise<void> {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.transaction(tx => {
      tx.executeSql(
        `INSERT OR REPLACE INTO sessions 
         (id, course_id, course_name, faculty_id, start_time, end_time, status, pin_rotation_sec, roster, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 
           COALESCE((SELECT created_at FROM sessions WHERE id = ?), ?),
           ?)`,
        [...sessionToRow(session), session.id, Date.now(), Date.now()],
        () => {},
        (_, error) => { console.error('Save session error:', error); return true; }
      );
    }, error => reject(error), () => resolve());
  });
}

export async function getSession(sessionId: string): Promise<SessionInfo | null> {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.transaction(tx => {
      tx.executeSql(
        `SELECT * FROM sessions WHERE id = ?`,
        [sessionId],
        (_, result) => {
          if (result.rows.length > 0) {
            resolve(sessionFromRow(result.rows.item(0)));
          } else {
            resolve(null);
          }
        },
        (_, error) => { console.error('Get session error:', error); return true; }
      );
    }, error => reject(error));
  });
}

export async function getAllSessions(): Promise<SessionInfo[]> {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.transaction(tx => {
      tx.executeSql(
        `SELECT * FROM sessions ORDER BY start_time DESC`,
        [],
        (_, result) => {
          const sessions: SessionInfo[] = [];
          for (let i = 0; i < result.rows.length; i++) {
            sessions.push(sessionFromRow(result.rows.item(i)));
          }
          resolve(sessions);
        },
        (_, error) => { console.error('Get all sessions error:', error); return true; }
      );
    }, error => reject(error));
  });
}

export async function updateSessionStatus(
  sessionId: string,
  status: 'active' | 'completed' | 'cancelled',
  endTime?: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.transaction(tx => {
      tx.executeSql(
        `UPDATE sessions SET status = ?, end_time = ?, updated_at = ? WHERE id = ?`,
        [status, endTime || null, Date.now(), sessionId],
        () => {},
        (_, error) => { console.error('Update session status error:', error); return true; }
      );
    }, error => reject(error), () => resolve());
  });
}

export async function deleteSession(sessionId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.transaction(tx => {
      tx.executeSql(`DELETE FROM sessions WHERE id = ?`, [sessionId], () => {}, (_, error) => { console.error('Delete session error:', error); return true; });
    }, error => reject(error), () => resolve());
  });
}