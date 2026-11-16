import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Runs `work` as one all-or-nothing step: if it throws, everything it changed is rolled back and the error is passed on.
 * Schema changes are transactional in SQLite, so a migration that fails half way leaves the database as it was.
 * Only use it while nothing else is touching the database (the app waits for start-up to finish before drawing screens).
 */
export async function inTransaction<T>(db: SQLiteDatabase, work: () => Promise<T>): Promise<T> {
  await db.execAsync('BEGIN');
  try {
    const result = await work();
    await db.execAsync('COMMIT');
    return result;
  } catch (e) {
    await db.execAsync('ROLLBACK').catch(() => {});
    throw e;
  }
}
