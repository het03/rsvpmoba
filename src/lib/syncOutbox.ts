// The sync queue. The triggers in db/syncSchema.ts fill it as records change; this module turns tracking on and off and
// lets the sync engine read the waiting changes and remove the ones it has uploaded. No network and no Google here, so
// it is fully testable. The full copy of the data always stays in the app's database; only the queue is temporary.
import type { SQLiteDatabase } from 'expo-sqlite';
import { inTransaction } from '@/db/transaction';
import type { SyncKind } from '@/db/syncSchema';

export type { SyncKind };

export type OutboxEntry = {
  kind: SyncKind;
  uid: string;
  /** Position in the queue. A record changed again after being read gets a larger number. */
  seq: number;
  /** True when the record was deleted: the change to send is its deletion. */
  deleted: boolean;
};

const getState = async (db: SQLiteDatabase, key: string) =>
  (await db.getFirstAsync<{ value: string }>('SELECT value FROM sync_state WHERE key = ?', [key]))?.value ?? null;

const setState = (db: SQLiteDatabase, key: string, value: string) =>
  db.runAsync('INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)', [key, value]);

export async function isSyncEnabled(db: SQLiteDatabase): Promise<boolean> {
  return (await getState(db, 'enabled')) === '1';
}

/** This phone's own id, made once and kept. Each device writes only files named with its own id. */
export async function getDeviceId(db: SQLiteDatabase): Promise<string> {
  const existing = await getState(db, 'device_id');
  if (existing) return existing;
  const row = await db.getFirstAsync<{ id: string }>('SELECT lower(hex(randomblob(16))) AS id');
  const id = row!.id;
  await db.runAsync("INSERT OR IGNORE INTO sync_state (key, value) VALUES ('device_id', ?)", [id]);
  return (await getState(db, 'device_id')) ?? id;
}

/** Puts every record that would be synced in the queue, as one step. Used when sync is turned on (the first upload). */
export async function markAllDirty(db: SQLiteDatabase): Promise<void> {
  // Start the queue afresh so no record is in it twice. The numbers keep growing (they are never reused).
  await db.runAsync('DELETE FROM sync_outbox');
  const insert = (kind: SyncKind, select: string) => db.runAsync(`INSERT INTO sync_outbox (kind, uid) SELECT '${kind}', uid FROM (${select})`);
  await insert('book', 'SELECT uid FROM books ORDER BY id');
  await insert('position', 'SELECT b.uid AS uid FROM reading_positions rp JOIN books b ON b.id = rp.book_id ORDER BY b.id');
  // A session still in progress (no words yet) has nothing worth sending.
  await insert('session', 'SELECT uid FROM sessions WHERE words_read > 0 ORDER BY id');
  await insert('vocab', 'SELECT uid FROM vocab_words ORDER BY id');
}

/** Turns sync on: gives this phone its id and queues everything that already exists. Safe to call when already on. */
export async function enableSync(db: SQLiteDatabase): Promise<void> {
  await inTransaction(db, async () => {
    await getDeviceId(db);
    await setState(db, 'enabled', '1');
    await markAllDirty(db);
  });
}

/** Turns sync off: stops tracking and empties the queue. Records keep their ids, and the data itself is untouched. */
export async function disableSync(db: SQLiteDatabase): Promise<void> {
  await inTransaction(db, async () => {
    await setState(db, 'enabled', '0');
    await db.runAsync('DELETE FROM sync_outbox');
  });
}

export async function pendingCount(db: SQLiteDatabase): Promise<number> {
  return (await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM sync_outbox'))?.n ?? 0;
}

/** The oldest waiting changes first, at most `limit`. */
export async function readOutbox(db: SQLiteDatabase, limit = 500): Promise<OutboxEntry[]> {
  const rows = await db.getAllAsync<{ kind: SyncKind; uid: string; seq: number; deleted: number }>(
    `SELECT o.kind, o.uid, o.seq,
            EXISTS (SELECT 1 FROM sync_tombstones t WHERE t.kind = o.kind AND t.uid = o.uid) AS deleted
     FROM sync_outbox o ORDER BY o.seq LIMIT ?`,
    [limit],
  );
  return rows.map(r => ({ kind: r.kind, uid: r.uid, seq: r.seq, deleted: r.deleted === 1 }));
}

/**
 * Removes entries from the queue once Drive has confirmed them. Matches kind, id AND seq exactly, so a record that
 * changed again while the upload was running (and so has a newer seq) stays in the queue to be sent next time.
 */
export async function clearOutbox(db: SQLiteDatabase, entries: Pick<OutboxEntry, 'kind' | 'uid' | 'seq'>[]): Promise<void> {
  if (entries.length === 0) return;
  await inTransaction(db, async () => {
    for (const e of entries) await db.runAsync('DELETE FROM sync_outbox WHERE kind = ? AND uid = ? AND seq = ?', [e.kind, e.uid, e.seq]);
  });
}

/**
 * Runs `work` as changes arriving from another device: they are written with their own times and are NOT queued to be
 * sent back. (Used by the sync engine when it applies what it downloaded.)
 */
export async function applyingRemote<T>(db: SQLiteDatabase, work: () => Promise<T>): Promise<T> {
  await setState(db, 'applying', '1');
  try {
    return await work();
  } finally {
    await setState(db, 'applying', '0');
  }
}
