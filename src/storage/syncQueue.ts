import { getDatabase } from './database';

export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';
export type SyncType = 'attendance' | 'session' | 'student_identity';

export interface SyncQueueItem {
  id: string;
  type: SyncType;
  payload: string;
  status: SyncStatus;
  retryCount: number;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
}

function itemFromRow(row: Record<string, unknown>): SyncQueueItem {
  return {
    id: row.id as string,
    type: row.type as SyncType,
    payload: row.payload as string,
    status: row.status as SyncStatus,
    retryCount: row.retry_count as number,
    lastError: row.last_error as string | null,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

export async function enqueueSync(
  type: SyncType,
  payload: Record<string, unknown>,
  idempotencyKey?: string
): Promise<string> {
  const id = idempotencyKey || crypto.randomUUID();
  
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.transaction(tx => {
      tx.executeSql(
        `INSERT OR IGNORE INTO sync_queue (id, type, payload, status, retry_count, last_error, created_at, updated_at)
         VALUES (?, ?, ?, 'pending', 0, NULL, ?, ?)`,
        [id, type, JSON.stringify(payload), Date.now(), Date.now()],
        () => { resolve(id); },
        (_, error) => { console.error('Enqueue sync error:', error); return true; }
      );
    }, error => reject(error));
  });
}

export async function getPendingSyncItems(limit: number = 50): Promise<SyncQueueItem[]> {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.transaction(tx => {
      tx.executeSql(
        `SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY created_at LIMIT ?`,
        [limit],
        (_, result) => {
          const items: SyncQueueItem[] = [];
          for (let i = 0; i < result.rows.length; i++) {
            items.push(itemFromRow(result.rows.item(i)));
          }
          resolve(items);
        },
        (_, error) => { console.error('Get pending sync items error:', error); return true; }
      );
    }, error => reject(error));
  });
}

export async function getSyncingItems(): Promise<SyncQueueItem[]> {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.transaction(tx => {
      tx.executeSql(
        `SELECT * FROM sync_queue WHERE status = 'syncing' ORDER BY updated_at`,
        [],
        (_, result) => {
          const items: SyncQueueItem[] = [];
          for (let i = 0; i < result.rows.length; i++) {
            items.push(itemFromRow(result.rows.item(i)));
          }
          resolve(items);
        },
        (_, error) => { console.error('Get syncing items error:', error); return true; }
      );
    }, error => reject(error));
  });
}

export async function markSyncItemSyncing(id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.transaction(tx => {
      tx.executeSql(
        `UPDATE sync_queue SET status = 'syncing', updated_at = ? WHERE id = ?`,
        [Date.now(), id],
        () => {},
        (_, error) => { console.error('Mark syncing error:', error); return true; }
      );
    }, error => reject(error), () => resolve());
  });
}

export async function markSyncItemSynced(id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.transaction(tx => {
      tx.executeSql(
        `UPDATE sync_queue SET status = 'synced', updated_at = ? WHERE id = ?`,
        [Date.now(), id],
        () => {},
        (_, error) => { console.error('Mark synced error:', error); return true; }
      );
    }, error => reject(error), () => resolve());
  });
}

export async function markSyncItemFailed(id: string, error: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.transaction(tx => {
      tx.executeSql(
        `UPDATE sync_queue SET status = 'failed', retry_count = retry_count + 1, last_error = ?, updated_at = ? WHERE id = ?`,
        [error, Date.now(), id],
        () => {},
        (_, error) => { console.error('Mark failed error:', error); return true; }
      );
    }, error => reject(error), () => resolve());
  });
}

export async function resetStaleSyncingItems(timeoutMs: number = 60000): Promise<void> {
  const cutoff = Date.now() - timeoutMs;
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.transaction(tx => {
      tx.executeSql(
        `UPDATE sync_queue SET status = 'pending', updated_at = ? WHERE status = 'syncing' AND updated_at < ?`,
        [Date.now(), cutoff],
        () => {},
        (_, error) => { console.error('Reset stale syncing error:', error); return true; }
      );
    }, error => reject(error), () => resolve());
  });
}

export async function getFailedSyncItems(limit: number = 10): Promise<SyncQueueItem[]> {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.transaction(tx => {
      tx.executeSql(
        `SELECT * FROM sync_queue WHERE status = 'failed' AND retry_count < 5 ORDER BY updated_at LIMIT ?`,
        [limit],
        (_, result) => {
          const items: SyncQueueItem[] = [];
          for (let i = 0; i < result.rows.length; i++) {
            items.push(itemFromRow(result.rows.item(i)));
          }
          resolve(items);
        },
        (_, error) => { console.error('Get failed sync items error:', error); return true; }
      );
    }, error => reject(error));
  });
}

export async function retryFailedSyncItems(): Promise<number> {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.transaction(tx => {
      tx.executeSql(
        `UPDATE sync_queue SET status = 'pending', updated_at = ? WHERE status = 'failed' AND retry_count < 5`,
        [Date.now()],
        (_, result) => { resolve(result.rowsAffected); },
        (_, error) => { console.error('Retry failed error:', error); return true; }
      );
    }, error => reject(error));
  });
}

export async function deleteSyncedItemsOlderThan(days: number = 30): Promise<number> {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.transaction(tx => {
      tx.executeSql(
        `DELETE FROM sync_queue WHERE status = 'synced' AND updated_at < ?`,
        [cutoff],
        (_, result) => { resolve(result.rowsAffected); },
        (_, error) => { console.error('Delete old synced error:', error); return true; }
      );
    }, error => reject(error));
  });
}

export async function getSyncQueueStats(): Promise<{
  pending: number;
  syncing: number;
  synced: number;
  failed: number;
}> {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.transaction(tx => {
      tx.executeSql(
        `SELECT status, COUNT(*) as count FROM sync_queue GROUP BY status`,
        [],
        (_, result) => {
          const stats = { pending: 0, syncing: 0, synced: 0, failed: 0 };
          for (let i = 0; i < result.rows.length; i++) {
            const row = result.rows.item(i);
            stats[row.status as keyof typeof stats] = row.count;
          }
          resolve(stats);
        },
        (_, error) => { console.error('Get sync stats error:', error); return true; }
      );
    }, error => reject(error));
  });
}