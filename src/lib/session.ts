// Reading-session bookkeeping for RSVP mode. A session row is created when RSVP starts and filled in as the reader goes,
// so an app that is killed part way (battery saver, dead battery, swiped away) still keeps what was read so far.
import type { SQLiteDatabase } from 'expo-sqlite';

/** How often the words read so far are saved while reading. At most this much reading is lost if the app is killed. */
export const CHECKPOINT_MS = 20_000;

/** Words per minute over the time actually spent playing; 0 when no time has been played. */
export function averageWpm(wordsRead: number, playedMs: number): number {
  return playedMs > 0 ? wordsRead / (playedMs / 60000) : 0;
}

/** Saves a session's progress. Used both for the periodic checkpoint and for the final save when the reader leaves. */
export async function saveSessionProgress(db: SQLiteDatabase, id: number, wordsRead: number, playedMs: number, now: number = Date.now()): Promise<void> {
  await db.runAsync('UPDATE sessions SET end_time = ?, words_read = ?, avg_wpm = ? WHERE id = ?', [now, wordsRead, averageWpm(wordsRead, playedMs), id]);
}
