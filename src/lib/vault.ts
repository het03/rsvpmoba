// The Word Vault: words saved from reading, each with the sentence it came from.
import type { SQLiteDatabase } from 'expo-sqlite';

export type VaultWord = {
  id: number;
  word: string;
  definition: string;
  context: string;
  bookTitle: string;
  savedAt: number;
};

export type NewVaultWord = {
  word: string;
  definition: string;
  context: string;
  bookId: number | null;
  bookTitle: string;
};

const DAY_MS = 86_400_000;

/** Saves a word. Saving the same word from the same sentence again is a no-op; returns whether a new entry was added. */
export async function saveWord(db: SQLiteDatabase, w: NewVaultWord, now: number = Date.now()): Promise<boolean> {
  const result = await db.runAsync(
    `INSERT OR IGNORE INTO vocab_words (word, definition, context, book_id, book_title, saved_at, next_review)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [w.word, w.definition, w.context, w.bookId, w.bookTitle, now, now + DAY_MS],
  );
  return result.changes > 0;
}

export async function isSaved(db: SQLiteDatabase, word: string, context: string): Promise<boolean> {
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM vocab_words WHERE word = ? AND context = ?',
    [word, context],
  );
  return (row?.n ?? 0) > 0;
}

/** Newest first. */
export async function listVault(db: SQLiteDatabase): Promise<VaultWord[]> {
  const rows = await db.getAllAsync<{ id: number; word: string; definition: string; context: string; book_title: string; saved_at: number }>(
    'SELECT id, word, definition, context, book_title, saved_at FROM vocab_words ORDER BY saved_at DESC, id DESC',
  );
  return rows.map(r => ({
    id: r.id,
    word: r.word,
    definition: r.definition,
    context: r.context,
    bookTitle: r.book_title,
    savedAt: r.saved_at,
  }));
}

export async function countVault(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM vocab_words');
  return row?.n ?? 0;
}

export async function removeWord(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM vocab_words WHERE id = ?', [id]);
}

/** Deletes every saved word. */
export async function clearVault(db: SQLiteDatabase): Promise<void> {
  await db.runAsync('DELETE FROM vocab_words');
}
