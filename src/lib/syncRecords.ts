// Between the database and sync records: reading a record out of the database to send, and writing one that arrived from
// another device. No network here, so it is all testable. Rules worth knowing:
//  - Records from another device are written with `applyingRemote`, so they are not queued to be sent back.
//  - A deletion is kept as a tombstone, so an old copy of the record (in an old file) can never bring it back.
//  - A book is never added from another device (it has no file here) and a book removed on another device is never removed
//    here. Books only help two devices agree which book is which. A position or book that has no matching book here is parked
//    until the same book is added.
import type { SQLiteDatabase } from 'expo-sqlite';
import { inTransaction } from '@/db/transaction';
import { matchKey, type FieldValue, type SyncKind, type SyncRecord } from '@/lib/syncFormat';
import { reconcileIdentity, remoteWins } from '@/lib/syncMerge';
import { applyingRemote, type OutboxEntry } from '@/lib/syncOutbox';

type Data = Record<string, FieldValue>;

const rec = (kind: SyncKind, id: string, updatedAt: number, data: Data): SyncRecord => ({ kind, id, updatedAt, deleted: false, data });
const gone = (kind: SyncKind, id: string, updatedAt: number): SyncRecord => ({ kind, id, updatedAt, deleted: true, data: {} });

/** Follows "this id is really that id" aliases to the id that wins (see sync_aliases). */
export async function canonicalUid(db: SQLiteDatabase, uid: string): Promise<string> {
  let id = uid;
  for (let hop = 0; hop < 8; hop++) {
    const next = await db.getFirstAsync<{ canonical: string }>('SELECT canonical FROM sync_aliases WHERE alias = ?', [id]);
    if (!next || next.canonical === id) break;
    id = next.canonical;
  }
  return id;
}

async function localBookId(db: SQLiteDatabase, uid: string | null): Promise<number | null> {
  if (!uid) return null;
  const row = await db.getFirstAsync<{ id: number }>('SELECT id FROM books WHERE uid = ?', [await canonicalUid(db, uid)]);
  return row?.id ?? null;
}

async function bookUidOf(db: SQLiteDatabase, id: number | null): Promise<string | null> {
  if (id === null) return null;
  return (await db.getFirstAsync<{ uid: string }>('SELECT uid FROM books WHERE id = ?', [id]))?.uid ?? null;
}

// ── reading records from the database ──────────────────────────────────────────────────────────────

const bookData = (r: { title: string; author: string; format: string; file_size: number; total_words: number; date_added: number }): Data => ({
  t: r.title, a: r.author, f: r.format, sz: r.file_size, tw: r.total_words, da: r.date_added,
});

/** The record for a row that exists (never a deletion), or null. */
async function readRow(db: SQLiteDatabase, kind: SyncKind, id: string): Promise<SyncRecord | null> {
  if (kind === 'book') {
    const r = await db.getFirstAsync<any>('SELECT * FROM books WHERE uid = ?', [id]);
    return r ? rec('book', id, r.updated_at ?? r.date_added, bookData(r)) : null;
  }
  if (kind === 'position') {
    const r = await db.getFirstAsync<any>('SELECT rp.word_index, rp.updated_at FROM reading_positions rp JOIN books b ON b.id = rp.book_id WHERE b.uid = ?', [id]);
    return r ? rec('position', id, r.updated_at, { wi: r.word_index }) : null;
  }
  if (kind === 'session') {
    const r = await db.getFirstAsync<any>('SELECT s.*, b.uid AS book_uid FROM sessions s LEFT JOIN books b ON b.id = s.book_id WHERE s.uid = ?', [id]);
    return r ? rec('session', id, r.updated_at ?? r.start_time, { b: r.book_uid ?? null, s: r.start_time, e: r.end_time ?? null, w: r.words_read, p: r.avg_wpm, m: r.mode }) : null;
  }
  if (kind === 'vocab') {
    const r = await db.getFirstAsync<any>('SELECT v.*, b.uid AS book_uid FROM vocab_words v LEFT JOIN books b ON b.id = v.book_id WHERE v.uid = ?', [id]);
    return r ? rec('vocab', id, r.updated_at ?? r.saved_at, {
      w: r.word, df: r.definition, c: r.context, b: r.book_uid ?? null, bt: r.book_title, sa: r.saved_at, nr: r.next_review, iv: r.interval_days, ez: r.ease,
    }) : null;
  }
  return null;
}

async function readTombstone(db: SQLiteDatabase, kind: SyncKind, id: string): Promise<SyncRecord | null> {
  const t = await db.getFirstAsync<{ deleted_at: number }>('SELECT deleted_at FROM sync_tombstones WHERE kind = ? AND uid = ?', [kind, id]);
  return t ? gone(kind, id, t.deleted_at) : null;
}

async function readParked(db: SQLiteDatabase, kind: SyncKind, id: string): Promise<SyncRecord | null> {
  const p = await db.getFirstAsync<{ updated_at: number; deleted: number; data: string }>('SELECT updated_at, deleted, data FROM sync_parked WHERE kind = ? AND id = ?', [kind, id]);
  if (!p) return null;
  return p.deleted === 1 ? gone(kind, id, p.updated_at) : rec(kind, id, p.updated_at, JSON.parse(p.data));
}

/** What this phone currently holds for a record: the live row, else its tombstone, else a parked copy, else null. */
export async function readLocalRecord(db: SQLiteDatabase, kind: SyncKind, id: string): Promise<SyncRecord | null> {
  return (await readRow(db, kind, id)) ?? (await readTombstone(db, kind, id)) ?? (await readParked(db, kind, id));
}

/**
 * The record to send for a queue entry: the row as it is now, or the deletion. Null when there is nothing to send (the row
 * is gone without a tombstone, or it is a session that never recorded a word).
 */
export async function exportEntry(db: SQLiteDatabase, entry: Pick<OutboxEntry, 'kind' | 'uid' | 'deleted'>): Promise<SyncRecord | null> {
  if (entry.deleted) return readTombstone(db, entry.kind, entry.uid);
  const r = await readRow(db, entry.kind, entry.uid);
  if (r && r.kind === 'session' && Number(r.data.w) <= 0) return null;
  return r;
}

/** Every record this phone has (and every deletion it remembers): what a snapshot holds. */
export async function exportAll(db: SQLiteDatabase): Promise<SyncRecord[]> {
  const out: SyncRecord[] = [];
  const each = async (kind: SyncKind, sql: string) => {
    for (const { uid } of await db.getAllAsync<{ uid: string }>(sql)) {
      const r = await readRow(db, kind, uid);
      if (r && !(r.kind === 'session' && Number(r.data.w) <= 0)) out.push(r);
    }
  };
  await each('book', 'SELECT uid FROM books ORDER BY id');
  await each('position', 'SELECT b.uid AS uid FROM reading_positions rp JOIN books b ON b.id = rp.book_id ORDER BY b.id');
  await each('session', 'SELECT uid FROM sessions WHERE words_read > 0 ORDER BY id');
  await each('vocab', 'SELECT uid FROM vocab_words ORDER BY id');
  for (const t of await db.getAllAsync<{ kind: SyncKind; uid: string; deleted_at: number }>('SELECT kind, uid, deleted_at FROM sync_tombstones')) {
    out.push(gone(t.kind, t.uid, t.deleted_at));
  }
  return out;
}

// ── writing records that arrived from another device ──────────────────────────────────────────────

async function setTombstone(db: SQLiteDatabase, kind: SyncKind, id: string, at: number) {
  const have = await readTombstone(db, kind, id);
  if (!have || have.updatedAt < at) await db.runAsync('INSERT OR REPLACE INTO sync_tombstones (kind, uid, deleted_at) VALUES (?, ?, ?)', [kind, id, at]);
}

const park = (db: SQLiteDatabase, r: SyncRecord) =>
  db.runAsync('INSERT OR REPLACE INTO sync_parked (kind, id, updated_at, deleted, data) VALUES (?, ?, ?, ?, ?)', [r.kind, r.id, r.updatedAt, r.deleted ? 1 : 0, JSON.stringify(r.data)]);

const unpark = (db: SQLiteDatabase, kind: SyncKind, id: string) => db.runAsync('DELETE FROM sync_parked WHERE kind = ? AND id = ?', [kind, id]);

const addAlias = (db: SQLiteDatabase, alias: string, canonical: string) =>
  alias === canonical ? Promise.resolve() : db.runAsync('INSERT OR REPLACE INTO sync_aliases (alias, canonical) VALUES (?, ?)', [alias, canonical]);

async function writeBook(db: SQLiteDatabase, uid: string, r: SyncRecord) {
  // Only what is safe to take from another phone: how many words the book has, the author if we have none, and the time.
  await db.runAsync(
    "UPDATE books SET total_words = MAX(total_words, ?), author = CASE WHEN author = '' THEN ? ELSE author END, updated_at = MAX(COALESCE(updated_at, 0), ?) WHERE uid = ?",
    [r.data.tw, r.data.a, r.updatedAt, uid],
  );
}

async function writePosition(db: SQLiteDatabase, bookId: number, r: SyncRecord) {
  await db.runAsync('INSERT OR REPLACE INTO reading_positions (book_id, word_index, updated_at) VALUES (?, ?, ?)', [bookId, r.data.wi, r.updatedAt]);
}

async function writeSession(db: SQLiteDatabase, uid: string, r: SyncRecord) {
  const bookId = await localBookId(db, r.data.b as string | null);
  const d = r.data;
  const has = await db.getFirstAsync('SELECT 1 AS x FROM sessions WHERE uid = ?', [uid]);
  if (has) {
    await db.runAsync('UPDATE sessions SET book_id = ?, start_time = ?, end_time = ?, words_read = ?, avg_wpm = ?, mode = ?, updated_at = ? WHERE uid = ?',
      [bookId, d.s, d.e, d.w, d.p, d.m, r.updatedAt, uid]);
  } else {
    await db.runAsync('INSERT INTO sessions (uid, book_id, start_time, end_time, words_read, avg_wpm, mode, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [uid, bookId, d.s, d.e, d.w, d.p, d.m, r.updatedAt]);
  }
}

async function writeVocab(db: SQLiteDatabase, uid: string, r: SyncRecord) {
  const bookId = await localBookId(db, r.data.b as string | null);
  const d = r.data;
  const has = await db.getFirstAsync('SELECT 1 AS x FROM vocab_words WHERE uid = ?', [uid]);
  if (has) {
    await db.runAsync('UPDATE vocab_words SET word = ?, definition = ?, context = ?, book_id = ?, book_title = ?, saved_at = ?, next_review = ?, interval_days = ?, ease = ?, updated_at = ? WHERE uid = ?',
      [d.w, d.df, d.c, bookId, d.bt, d.sa, d.nr, d.iv, d.ez, r.updatedAt, uid]);
  } else {
    await db.runAsync('INSERT INTO vocab_words (uid, word, definition, context, book_id, book_title, saved_at, next_review, interval_days, ease, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [uid, d.w, d.df, d.c, bookId, d.bt, d.sa, d.nr, d.iv, d.ez, r.updatedAt]);
  }
}

type Keys = { book: Map<string, string>; vocab: Map<string, string> | null };

async function loadKeys(db: SQLiteDatabase): Promise<Keys> {
  const book = new Map<string, string>();
  for (const b of await db.getAllAsync<{ uid: string; title: string; file_size: number }>('SELECT uid, title, file_size FROM books')) {
    book.set(matchKey({ kind: 'book', data: { t: b.title, sz: b.file_size } })!, b.uid);
  }
  return { book, vocab: null };
}

async function vocabKeys(db: SQLiteDatabase, keys: Keys): Promise<Map<string, string>> {
  if (keys.vocab) return keys.vocab;
  const m = new Map<string, string>();
  for (const v of await db.getAllAsync<{ uid: string; word: string; context: string }>('SELECT uid, word, context FROM vocab_words')) {
    m.set(matchKey({ kind: 'vocab', data: { w: v.word, c: v.context } })!, v.uid);
  }
  return (keys.vocab = m);
}

/**
 * If this record is the same book or word as one already here under another id, make both agree: the lower id wins
 * (this phone's row is renamed if its id is the higher), and the other id is remembered as an alias. Returns the id the
 * record should be applied to.
 */
async function settleIdentity(db: SQLiteDatabase, keys: Keys, r: SyncRecord): Promise<string> {
  if (r.deleted || (r.kind !== 'book' && r.kind !== 'vocab')) return r.id;
  const map = r.kind === 'book' ? keys.book : await vocabKeys(db, keys);
  const verdict = reconcileIdentity(map, r);
  if (verdict.action === 'none') return r.id;
  const key = matchKey(r)!;
  if (verdict.action === 'adopt') {
    await db.runAsync(`UPDATE ${r.kind === 'book' ? 'books' : 'vocab_words'} SET uid = ? WHERE uid = ?`, [verdict.to, verdict.from]);
    await addAlias(db, verdict.from, verdict.to);
    // Changes still waiting to be sent were queued under the old id, which no longer exists; without this they would be
    // dropped as "nothing to send" (a position's id is its book's id). Move them to the new id.
    for (const kind of r.kind === 'book' ? ['book', 'position'] : ['vocab']) {
      await db.runAsync('DELETE FROM sync_outbox WHERE kind = ? AND uid = ?', [kind, verdict.to]);
      await db.runAsync('UPDATE sync_outbox SET uid = ? WHERE kind = ? AND uid = ?', [verdict.to, kind, verdict.from]);
    }
    map.set(key, verdict.to);
    return verdict.to;
  }
  const localId = map.get(key)!;
  await addAlias(db, r.id, localId);
  return localId;
}

async function applyOne(db: SQLiteDatabase, keys: Keys, remote: SyncRecord): Promise<'applied' | 'parked' | 'skipped'> {
  let id = await settleIdentity(db, keys, remote);
  if (remote.kind === 'position') id = await canonicalUid(db, remote.id);
  const r: SyncRecord = id === remote.id ? remote : { ...remote, id };

  const local = await readLocalRecord(db, r.kind, id);
  if (!remoteWins(local, r)) return 'skipped';

  if (r.deleted) {
    if (r.kind === 'book') {
      // A book removed on another phone is not removed here (that would also throw away the file). Only forget a waiting copy.
      await unpark(db, 'book', id);
      if (!(await readRow(db, 'book', id))) await setTombstone(db, 'book', id, r.updatedAt);
      return 'applied';
    }
    const table = { position: null, session: 'sessions', vocab: 'vocab_words' }[r.kind as 'position' | 'session' | 'vocab'];
    if (r.kind === 'position') {
      const bookId = await localBookId(db, id);
      if (bookId !== null) await db.runAsync('DELETE FROM reading_positions WHERE book_id = ?', [bookId]);
    } else if (table) {
      await db.runAsync(`DELETE FROM ${table} WHERE uid = ?`, [id]);
    }
    await unpark(db, r.kind, id);
    await setTombstone(db, r.kind, id, r.updatedAt);
    return 'applied';
  }

  if (r.kind === 'book') {
    if (await readRow(db, 'book', id)) { await writeBook(db, id, r); await unpark(db, 'book', id); return 'applied'; }
    await park(db, r);
    return 'parked';
  }
  if (r.kind === 'position') {
    const bookId = await localBookId(db, id);
    if (bookId !== null) { await writePosition(db, bookId, r); await unpark(db, 'position', id); return 'applied'; }
    await park(db, r);
    return 'parked';
  }
  if (r.kind === 'session') await writeSession(db, id, r);
  else if (r.kind === 'vocab') await writeVocab(db, id, r);
  else return 'skipped';
  await db.runAsync('DELETE FROM sync_tombstones WHERE kind = ? AND uid = ?', [r.kind, id]); // edited after it was deleted: it is back
  return 'applied';
}

const ORDER: Record<string, number> = { book: 0, position: 1, session: 2, vocab: 3 };

/**
 * Writes records from another device, as one all-or-nothing step, without queueing them to be sent back. Books go first so
 * ids are settled before the records that point at them. Settings are not handled here (they are not in the database).
 */
export async function applyRecords(db: SQLiteDatabase, records: SyncRecord[]): Promise<{ applied: number; parked: number }> {
  const todo = records.filter(r => r.kind !== 'setting').sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
  if (todo.length === 0) return { applied: 0, parked: 0 };
  return inTransaction(db, () => applyingRemote(db, async () => {
    const keys = await loadKeys(db);
    let applied = 0;
    let parked = 0;
    for (const r of todo) {
      const result = await applyOne(db, keys, r);
      if (result === 'applied') applied++;
      else if (result === 'parked') parked++;
    }
    return { applied, parked };
  }));
}

/**
 * Applies waiting records whose book has since been added on this phone. Call it after each pull, and after a book is added.
 * Returns how many were applied.
 */
export async function resolveParked(db: SQLiteDatabase): Promise<number> {
  const waiting = await db.getAllAsync<{ kind: SyncKind }>("SELECT kind FROM sync_parked WHERE deleted = 0 AND kind IN ('book', 'position') LIMIT 1");
  if (waiting.length === 0) return 0;
  return inTransaction(db, () => applyingRemote(db, async () => {
    let applied = 0;
    const keys = await loadKeys(db);
    const parked = await db.getAllAsync<{ kind: SyncKind; id: string }>("SELECT kind, id FROM sync_parked WHERE deleted = 0 AND kind IN ('book', 'position') ORDER BY CASE kind WHEN 'book' THEN 0 ELSE 1 END");
    for (const p of parked) {
      const r = await readParked(db, p.kind, p.id);
      if (!r) continue;
      await unpark(db, p.kind, p.id); // re-applied below; it parks itself again if it still has no book
      const result = await applyOne(db, keys, r);
      if (result === 'applied') applied++;
    }
    return applied;
  }));
}

/** The id a book uses in sync files, for callers that need to tell a record about a book. */
export { bookUidOf };
