// A pretend Google Drive and pretend phones, for testing the sync engine without a network or a device.
import { openDatabaseAsync } from 'expo-sqlite';
import { setupSchema } from '../../src/db/index.ts';
import { enableSync } from '../../src/lib/syncOutbox.ts';

/** One shared Drive folder (the same Google account on every phone), with switches to make it misbehave. */
export function fakeDrive() {
  let nextId = 1;
  const files = new Map(); // id -> { name, content }
  const drive = {
    files,
    offline: false,
    /** Make the next call of this kind throw once: 'list' | 'read' | 'create' | 'remove'. */
    failNext: new Set(),
    /** Make every remove fail (for testing tidy-up that cannot delete). */
    failRemove: false,
    calls: { list: 0, read: 0, create: 0, remove: 0 },
    names: () => [...files.values()].map((f) => f.name).sort(),
    put(name, content) { const id = `f${nextId++}`; files.set(id, { name, content }); return { id, name }; },
  };
  const gate = (op) => {
    drive.calls[op]++;
    if (drive.offline) throw new Error('offline');
    if (drive.failNext.delete(op)) throw new Error(`${op} failed`);
  };
  drive.list = async () => { gate('list'); return [...files.entries()].map(([id, f]) => ({ id, name: f.name })); };
  drive.read = async (id) => { gate('read'); const f = files.get(id); if (!f) throw new Error('not found'); return f.content; };
  drive.create = async (name, content) => { gate('create'); return drive.put(name, content); };
  drive.remove = async (id) => { gate('remove'); if (drive.failRemove) throw new Error('remove failed'); files.delete(id); };
  return drive;
}

/** A pretend phone: its own database with the app's real schema, and sync turned on (or not). */
export async function newPhone(name, { sync = true } = {}) {
  const db = await openDatabaseAsync(name);
  await setupSchema(db);
  if (sync) await enableSync(db);
  return db;
}

let fileCounter = 0;
export async function addBook(db, title, { size = 1000, words = 5000 } = {}) {
  const r = await db.runAsync(
    "INSERT INTO books (title, author, format, file_path, file_size, total_words, date_added) VALUES (?, '', 'epub', ?, ?, ?, ?)",
    [title, `/books/${title}-${fileCounter++}`, size, words, 1_700_000_000_000],
  );
  return r.lastInsertRowId;
}

export const bookUid = async (db, id) => (await db.getFirstAsync('SELECT uid FROM books WHERE id = ?', [id])).uid;
export const savePosition = (db, bookId, wordIndex, at) =>
  db.runAsync('INSERT OR REPLACE INTO reading_positions (book_id, word_index, updated_at) VALUES (?, ?, ?)', [bookId, wordIndex, at]);

export async function addSession(db, bookId, start, words) {
  const r = await db.runAsync("INSERT INTO sessions (book_id, start_time, mode) VALUES (?, ?, 'rsvp')", [bookId, start]);
  await db.runAsync('UPDATE sessions SET end_time = ?, words_read = ?, avg_wpm = ? WHERE id = ?', [start + 60_000, words, 300, r.lastInsertRowId]);
  return r.lastInsertRowId;
}

export async function addWord(db, word, context, bookId = null) {
  await db.runAsync(
    'INSERT INTO vocab_words (word, definition, context, book_id, book_title, saved_at, next_review) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [word, `meaning of ${word}`, context, bookId, bookId ? 'A book' : '', 1_700_000_000_000, 1_700_086_400_000],
  );
}

/** What a phone holds, in a form that can be compared between phones (ids and local numbers left out). */
export async function snapshotOf(db) {
  const rows = (sql) => db.getAllAsync(sql);
  return {
    books: (await rows('SELECT title, file_size FROM books ORDER BY title, file_size')).map((r) => `${r.title}|${r.file_size}`),
    positions: (await rows('SELECT b.title AS t, rp.word_index AS w FROM reading_positions rp JOIN books b ON b.id = rp.book_id ORDER BY t')).map((r) => `${r.t}:${r.w}`),
    sessions: (await rows('SELECT start_time, words_read FROM sessions WHERE words_read > 0 ORDER BY start_time, words_read')).map((r) => `${r.start_time}:${r.words_read}`),
    vocab: (await rows('SELECT word, context, definition FROM vocab_words ORDER BY word, context')).map((r) => `${r.word}|${r.context}|${r.definition}`),
  };
}

export const countOf = async (db, table) => (await db.getFirstAsync(`SELECT COUNT(*) AS n FROM ${table}`)).n;
