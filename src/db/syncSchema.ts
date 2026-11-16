// Database version 2: what the app needs to know, for every record that will be synced, which ones changed.
//
// Every synced record gets a permanent id (`uid`, 32 hex characters) that is the same on every device, and an
// `updated_at` time. Local numeric ids stay as they are. Changes are noticed by database TRIGGERS rather than by code in
// each screen, so no write path (import, reading, saving a word, deleting a book) can forget to report a change, and new
// ones are covered automatically.
//
//  sync_state      small settings: 'enabled' ('1' once sync is on), 'applying' ('1' while changes from another device are
//                  being written, so they are not sent straight back), 'device_id'.
//  sync_outbox     the changes not uploaded yet, one row per record (the latest change wins; `seq` only ever grows and is
//                  never reused, so it names one particular change). Rows are removed only after
//                  the upload is confirmed. This is the "save point": it fills while offline and drains when online.
//  sync_tombstones records that were deleted, so the deletion can be sent to other devices.
//
// While sync is off nothing is added to the outbox or tombstones; turning it on marks every existing record as changed.
import type { SQLiteDatabase } from 'expo-sqlite';

export type SyncKind = 'book' | 'position' | 'session' | 'vocab';

/** Milliseconds since 1970, in SQL (SQLite's own clock is in days, so it is converted). */
const NOW = "CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)";
const ENABLED = "(SELECT value FROM sync_state WHERE key = 'enabled') = '1'";
const NOT_APPLYING = "COALESCE((SELECT value FROM sync_state WHERE key = 'applying'), '0') <> '1'";
const TRACKING = `${ENABLED} AND ${NOT_APPLYING}`;
const NEW_UID = 'lower(hex(randomblob(16)))';

// Queue a record as changed: drop its old entry, then add a new one. (Not INSERT OR REPLACE: SQLite makes a trigger follow
// the conflict clause of the statement that fired it, so an upsert in the app would turn that into a failure.) The new
// entry gets the next number from an AUTOINCREMENT column, which is never reused, so a number identifies one change.
const mark = (kind: SyncKind, uid: string) =>
  `DELETE FROM sync_outbox WHERE kind = '${kind}' AND uid = ${uid};
       INSERT INTO sync_outbox (kind, uid) VALUES ('${kind}', ${uid})`;

// Tables that carry their own uid. `stamp` is the column an existing row's first updated_at is taken from.
const OWN_UID: { table: string; kind: SyncKind; stamp: string }[] = [
  { table: 'books', kind: 'book', stamp: 'date_added' },
  { table: 'sessions', kind: 'session', stamp: 'start_time' },
  { table: 'vocab_words', kind: 'vocab', stamp: 'saved_at' },
];

function ownUidTriggers({ table, kind }: { table: string; kind: SyncKind }): string[] {
  const uid = `(SELECT uid FROM ${table} WHERE id = NEW.id)`;
  const markRow = `DELETE FROM sync_outbox WHERE kind = '${kind}' AND uid = ${uid} AND ${TRACKING};
       INSERT INTO sync_outbox (kind, uid) SELECT '${kind}', uid FROM ${table} WHERE id = NEW.id AND ${TRACKING}`;
  return [
    // A new row gets its id and time (a column default can't be random, so this is done here), then is reported.
    `CREATE TRIGGER IF NOT EXISTS ${table}_sync_ai AFTER INSERT ON ${table} BEGIN
       UPDATE ${table} SET uid = COALESCE(uid, ${NEW_UID}), updated_at = COALESCE(updated_at, ${NOW}) WHERE id = NEW.id AND (uid IS NULL OR updated_at IS NULL);
       ${markRow};
     END`,
    // An update that did not set updated_at itself gets it set, and is reported. Writes from another device
    // (sync_state 'applying') keep their own updated_at and are not reported.
    `CREATE TRIGGER IF NOT EXISTS ${table}_sync_au AFTER UPDATE ON ${table}
     WHEN NEW.updated_at IS OLD.updated_at AND NEW.uid IS OLD.uid AND ${NOT_APPLYING} BEGIN
       UPDATE ${table} SET updated_at = ${NOW} WHERE id = NEW.id;
       ${markRow};
     END`,
    // A deleted row leaves a tombstone so other devices can delete it too.
    `CREATE TRIGGER IF NOT EXISTS ${table}_sync_ad AFTER DELETE ON ${table} WHEN OLD.uid IS NOT NULL AND ${TRACKING} BEGIN
       INSERT OR REPLACE INTO sync_tombstones (kind, uid, deleted_at) VALUES ('${kind}', OLD.uid, ${NOW});
       ${mark(kind, 'OLD.uid')};
     END`,
  ];
}

// A reading position is identified by its book's uid. (Replacing a row with INSERT OR REPLACE does not fire the delete
// trigger, so saving a position never leaves a tombstone.) Deleting a book already tombstones the book, which covers its position.
const POSITION_TRACKED = `EXISTS (SELECT 1 FROM books WHERE id = NEW.book_id) AND ${TRACKING}`;
const POSITION_UID = '(SELECT uid FROM books WHERE id = NEW.book_id)';
const positionTriggers = [
  `CREATE TRIGGER IF NOT EXISTS reading_positions_sync_ai AFTER INSERT ON reading_positions WHEN ${POSITION_TRACKED} BEGIN
     ${mark('position', POSITION_UID)};
   END`,
  `CREATE TRIGGER IF NOT EXISTS reading_positions_sync_au AFTER UPDATE ON reading_positions WHEN ${POSITION_TRACKED} BEGIN
     ${mark('position', POSITION_UID)};
   END`,
  `CREATE TRIGGER IF NOT EXISTS reading_positions_sync_ad AFTER DELETE ON reading_positions
   WHEN EXISTS (SELECT 1 FROM books WHERE id = OLD.book_id) AND ${TRACKING} BEGIN
     INSERT OR REPLACE INTO sync_tombstones (kind, uid, deleted_at) VALUES ('position', (SELECT uid FROM books WHERE id = OLD.book_id), ${NOW});
     ${mark('position', '(SELECT uid FROM books WHERE id = OLD.book_id)')};
   END`,
];

/**
 * Upgrades the database to version 2 in one transaction (the caller wraps it): adds uid and updated_at to the synced
 * tables and gives every existing row both, creates the sync tables, and installs the triggers. Safe to run twice.
 */
export async function migrateToV2(db: SQLiteDatabase): Promise<void> {
  for (const { table } of OWN_UID) {
    const columns = (await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`)).map(c => c.name);
    if (!columns.includes('uid')) await db.runAsync(`ALTER TABLE ${table} ADD COLUMN uid TEXT`);
    if (!columns.includes('updated_at')) await db.runAsync(`ALTER TABLE ${table} ADD COLUMN updated_at INTEGER`);
  }

  // Existing rows get an id and take their updated_at from the time the row already records (when it was added,
  // started or saved), so a first sync does not make everything look as if it changed just now.
  for (const { table, stamp } of OWN_UID) {
    await db.runAsync(`UPDATE ${table} SET uid = ${NEW_UID} WHERE uid IS NULL`);
    await db.runAsync(`UPDATE ${table} SET updated_at = ${stamp} WHERE updated_at IS NULL`);
    await db.runAsync(`CREATE UNIQUE INDEX IF NOT EXISTS ${table}_uid ON ${table}(uid)`);
  }

  await db.runAsync('CREATE TABLE IF NOT EXISTS sync_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  await db.runAsync('CREATE TABLE IF NOT EXISTS sync_outbox (seq INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, uid TEXT NOT NULL)');
  // Finding a record's old entry (to replace it) stays quick however many changes are waiting.
  await db.runAsync('CREATE INDEX IF NOT EXISTS sync_outbox_record ON sync_outbox(kind, uid)');
  await db.runAsync('CREATE TABLE IF NOT EXISTS sync_tombstones (kind TEXT NOT NULL, uid TEXT NOT NULL, deleted_at INTEGER NOT NULL, PRIMARY KEY (kind, uid))');

  for (const entity of OWN_UID) for (const sql of ownUidTriggers(entity)) await db.runAsync(sql);
  for (const sql of positionTriggers) await db.runAsync(sql);
}
