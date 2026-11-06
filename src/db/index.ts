import * as SQLite from 'expo-sqlite';

export type Book = {
  id: number;
  title: string;
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
}
