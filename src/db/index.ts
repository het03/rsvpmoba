import * as SQLite from 'expo-sqlite';

export type Book = {
  id: number;
  title: string;
  author: string;
  coverData: string | null; // base64 data URI, e.g. "data:image/jpeg;base64,..."
  format: 'epub' | 'txt';
  filePath: string;
  fileSize: number;
  dateAdded: number;
  totalWords: number;
};

let _dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!_dbPromise) {
    _dbPromise = SQLite.openDatabaseAsync('rsvp.db');
  }
  return _dbPromise;
}

export async function initDb(): Promise<void> {
  const db = await getDb();

  await db.runAsync(
    'CREATE TABLE IF NOT EXISTS books (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, format TEXT NOT NULL, file_path TEXT NOT NULL UNIQUE, file_size INTEGER NOT NULL DEFAULT 0, total_words INTEGER NOT NULL DEFAULT 0, date_added INTEGER NOT NULL)'
  );
  await db.runAsync(
    'CREATE TABLE IF NOT EXISTS reading_positions (book_id INTEGER PRIMARY KEY, word_index INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)'
  );
  await db.runAsync(
    'CREATE TABLE IF NOT EXISTS sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, book_id INTEGER, start_time INTEGER NOT NULL, end_time INTEGER, words_read INTEGER NOT NULL DEFAULT 0, avg_wpm REAL NOT NULL DEFAULT 0, mode TEXT NOT NULL DEFAULT "normal")'
  );

  // Word Vault. Definitions are cached so repeat lookups work offline. Saved words keep a snapshot of the book title
  // and the sentence they came from, so they stay meaningful after the book is removed. The review columns
  // (next_review, interval_days, ease) are for spaced repetition.
  await db.runAsync(
    'CREATE TABLE IF NOT EXISTS word_cache (word TEXT PRIMARY KEY, entry TEXT NOT NULL, fetched_at INTEGER NOT NULL)'
  );
  await db.runAsync(
    "CREATE TABLE IF NOT EXISTS vocab_words (id INTEGER PRIMARY KEY AUTOINCREMENT, word TEXT NOT NULL, definition TEXT NOT NULL, context TEXT NOT NULL DEFAULT '', book_id INTEGER, book_title TEXT NOT NULL DEFAULT '', saved_at INTEGER NOT NULL, next_review INTEGER NOT NULL, interval_days INTEGER NOT NULL DEFAULT 1, ease REAL NOT NULL DEFAULT 2.5, UNIQUE (word, context))"
  );

  // Schema migrations via PRAGMA user_version
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;

  if (version < 1) {
    await db.runAsync('ALTER TABLE books ADD COLUMN author TEXT NOT NULL DEFAULT ""');
    await db.runAsync('ALTER TABLE books ADD COLUMN cover_data TEXT');
    await db.runAsync('PRAGMA user_version = 1');
  }
}
