// A reading session keeps what was read so far, so a killed app does not lose it.
import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { getDb, initDb } from '../../src/db/index.ts';
import { averageWpm, CHECKPOINT_MS, saveSessionProgress } from '../../src/lib/session.ts';
import { loadStats } from '../../src/lib/stats.ts';
import { readSource } from '../helpers/source.mjs';

const START = new Date(2026, 10, 12, 10, 0).getTime();
let db;

async function startSession() {
  const r = await db.runAsync("INSERT INTO sessions (book_id, start_time, mode) VALUES (1, ?, 'rsvp')", [START]);
  return r.lastInsertRowId;
}
const row = (id) => db.getFirstAsync('SELECT end_time, words_read, avg_wpm FROM sessions WHERE id = ?', [id]);

beforeEach(async () => {
  await initDb();
  db = await getDb();
  await db.runAsync('DELETE FROM sessions');
});

describe('averageWpm', () => {
  test('words per minute of play time', () => {
    assert.equal(averageWpm(300, 60_000), 300);
    assert.equal(averageWpm(150, 30_000), 300);
    assert.equal(averageWpm(1000, 120_000), 500);
  });

  test('no play time is 0, never infinity or NaN', () => {
    assert.equal(averageWpm(100, 0), 0);
    assert.equal(averageWpm(0, 0), 0);
    assert.equal(averageWpm(100, -5), 0);
  });
});

describe('saving session progress', () => {
  test('fills in the words, speed and end time', async () => {
    const id = await startSession();
    await saveSessionProgress(db, id, 200, 60_000, START + 60_000);
    assert.deepEqual({ ...(await row(id)) }, { end_time: START + 60_000, words_read: 200, avg_wpm: 200 });
  });

  test('later checkpoints overwrite earlier ones, and the last one wins', async () => {
    const id = await startSession();
    await saveSessionProgress(db, id, 100, 20_000, START + 20_000);
    await saveSessionProgress(db, id, 210, 40_000, START + 40_000);
    await saveSessionProgress(db, id, 330, 60_000, START + 60_000);
    assert.deepEqual({ ...(await row(id)) }, { end_time: START + 60_000, words_read: 330, avg_wpm: 330 });
    assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS n FROM sessions')).n, 1, 'one session, not one per checkpoint');
  });
});

describe('an app killed mid-session', () => {
  test('keeps the words from the last checkpoint, and they count in the stats', async () => {
    const id = await startSession();
    await saveSessionProgress(db, id, 480, 90_000, START + 90_000);
    // ...the app is killed here: no final save ever runs.
    const stats = await loadStats(db, START + 3_600_000);
    assert.equal(stats.words.today, 480);
    assert.equal(stats.dna.sessions, 1);
    assert.equal(stats.dna.avgWpm, 320);
  });

  test('a session killed before its first checkpoint is still just an empty row that the stats ignore', async () => {
    await startSession();
    const stats = await loadStats(db, START + 3_600_000);
    assert.equal(stats.words.total, 0);
    assert.equal(stats.dna.sessions, 0);
  });
});

describe('the reader', () => {
  test('saves a checkpoint on a timer while it is open, using the shared save, and stops when it closes', () => {
    const src = readSource('src/components/Reader/RsvpReader.tsx');
    assert.ok(src.includes("from '@/lib/session'"));
    assert.ok(src.includes('setInterval(() => {') && src.includes('}, CHECKPOINT_MS);'));
    assert.ok(src.includes('return () => clearInterval(t);'));
    assert.ok(src.includes('saveSessionProgress(db, id, read, total)'), 'the checkpoint and the final save use the same function');
  });

  test('a checkpoint never runs after the session was closed out, and skips sessions with no words', () => {
    const src = readSource('src/components/Reader/RsvpReader.tsx');
    assert.ok(src.includes('if (sessionDone.current || read <= 0) return;'));
    assert.ok(src.includes('if (id === null || sessionDone.current) return;'));
  });

  test('the interval is short enough to lose little and long enough not to hammer the database', () => {
    assert.ok(CHECKPOINT_MS >= 5_000 && CHECKPOINT_MS <= 60_000);
  });
});
