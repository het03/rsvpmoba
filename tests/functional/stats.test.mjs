// Runs the Stats screen's real queries (loadStats) against the app's real schema.
import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { getDb, initDb } from '../../src/db/index.ts';
import { COMPLETE_THRESHOLD, loadStats, TREND_SESSIONS } from '../../src/lib/stats.ts';
import { readSource } from '../helpers/source.mjs';

const at = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();
// Wednesday 11 Nov 2026, mid-afternoon.
const NOW = at(2026, 11, 11, 15);

async function addSession(start, words, wpm, mode = 'rsvp') {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO sessions (book_id, start_time, end_time, words_read, avg_wpm, mode) VALUES (1, ?, ?, ?, ?, ?)',
    [start, start + 60_000, words, wpm, mode],
  );
}

async function addBook(title, totalWords, wordIndex) {
  const db = await getDb();
  const { lastInsertRowId } = await db.runAsync(
    'INSERT INTO books (title, author, format, file_path, file_size, total_words, date_added) VALUES (?, \'\', \'txt\', ?, 1, ?, 1)',
    [title, `/books/${title}`, totalWords],
  );
  if (wordIndex !== null) {
    await db.runAsync('INSERT INTO reading_positions (book_id, word_index, updated_at) VALUES (?, ?, 1)', [lastInsertRowId, wordIndex]);
  }
}

beforeEach(async () => {
  await initDb();
  const db = await getDb();
  await db.runAsync('DELETE FROM sessions');
  await db.runAsync('DELETE FROM books');
  await db.runAsync('DELETE FROM reading_positions');
});

describe('loadStats', () => {
  test('an empty database gives all-zero stats', async () => {
    const s = await loadStats(await getDb(), NOW);
    assert.deepEqual(s.words, { today: 0, week: 0, month: 0, total: 0 });
    assert.deepEqual(s.trend, []);
    assert.deepEqual(s.streak, { current: 0, longest: 0 });
    assert.deepEqual(s.dna, { peakHour: null, avgWpm: 0, booksFinished: 0, sessions: 0 });
  });

  test('words are bucketed into today, this week (from Monday) and this month', async () => {
    await addSession(at(2026, 11, 11, 9), 100, 300);  // today
    await addSession(at(2026, 11, 10, 20), 200, 300); // yesterday (Tue): this week
    await addSession(at(2026, 11, 9, 8), 400, 300);   // Monday: this week
    await addSession(at(2026, 11, 8, 8), 800, 300);   // Sunday: last week, this month
    await addSession(at(2026, 11, 1, 0, 1), 1600, 300); // 1st: this month
    await addSession(at(2026, 10, 31, 23, 59), 3200, 300); // last month
    const s = await loadStats(await getDb(), NOW);
    assert.equal(s.words.today, 100);
    assert.equal(s.words.week, 700);
    assert.equal(s.words.month, 3100);
    assert.equal(s.words.total, 6300);
  });

  test('a session starting at exactly midnight counts as today', async () => {
    await addSession(at(2026, 11, 11, 0, 0), 50, 300);
    assert.equal((await loadStats(await getDb(), NOW)).words.today, 50);
  });

  test('sessions with no words (abandoned or killed) are ignored everywhere', async () => {
    await addSession(at(2026, 11, 11, 9), 0, 0);
    const db = await getDb();
    // An in-flight session: inserted at start, never finalized.
    await db.runAsync("INSERT INTO sessions (book_id, start_time, mode) VALUES (1, ?, 'rsvp')", [at(2026, 11, 10, 9)]);
    const s = await loadStats(db, NOW);
    assert.equal(s.words.total, 0);
    assert.equal(s.dna.sessions, 0);
    assert.deepEqual(s.streak, { current: 0, longest: 0 });
    assert.equal(s.dna.peakHour, null);
  });

  test('trend is the latest sessions, oldest first, and capped', async () => {
    for (let i = 0; i < TREND_SESSIONS + 5; i++) await addSession(at(2026, 10, 1, 8) + i * 3_600_000, 100, 200 + i);
    const s = await loadStats(await getDb(), NOW);
    assert.equal(s.trend.length, TREND_SESSIONS);
    assert.equal(s.trend[s.trend.length - 1], 200 + TREND_SESSIONS + 4); // newest last
    assert.equal(s.trend[0], 205);                                       // the 5 oldest dropped
    assert.deepEqual(s.trend, [...s.trend].sort((a, b) => a - b));
  });

  test('streak runs from the days that have sessions; reading in the evening of earlier days counts', async () => {
    await addSession(at(2026, 11, 11, 7), 100, 300);
    await addSession(at(2026, 11, 10, 23, 50), 100, 300);
    await addSession(at(2026, 11, 9, 0, 5), 100, 300);
    await addSession(at(2026, 11, 5, 12), 100, 300);
    await addSession(at(2026, 11, 4, 12), 100, 300);
    const s = await loadStats(await getDb(), NOW);
    assert.deepEqual(s.streak, { current: 3, longest: 3 });
  });

  test('Reading DNA: peak hour, mean WPM, session count', async () => {
    await addSession(at(2026, 11, 11, 21, 10), 100, 300);
    await addSession(at(2026, 11, 10, 21, 40), 100, 400);
    await addSession(at(2026, 11, 9, 7), 100, 500);
    const s = await loadStats(await getDb(), NOW);
    assert.equal(s.dna.peakHour, 21);
    assert.equal(s.dna.avgWpm, 400);
    assert.equal(s.dna.sessions, 3);
  });

  test('average WPM ignores sessions that recorded none', async () => {
    await addSession(at(2026, 11, 11, 9), 100, 300);
    await addSession(at(2026, 11, 10, 9), 100, 0);
    assert.equal((await loadStats(await getDb(), NOW)).dna.avgWpm, 300);
  });

  test('books finished uses the same threshold as the shelf', async () => {
    await addBook('done', 1000, 1000);
    await addBook('just short', 1000, 998);
    await addBook('almost', 1000, 999);   // 99.9% → Completed on the shelf
    await addBook('unopened', 1000, null);
    await addBook('empty', 0, 0);
    const s = await loadStats(await getDb(), NOW);
    assert.equal(s.dna.booksFinished, 2);
  });

  test('the finished threshold matches the shelf screen', () => {
    const shelf = Number(readSource('src/app/index.tsx').match(/const COMPLETE_THRESHOLD = ([0-9.]+);/)?.[1]);
    assert.equal(COMPLETE_THRESHOLD, shelf);
  });

  test('history survives deleting the book it came from', async () => {
    await addBook('gone', 1000, 10);
    await addSession(at(2026, 11, 11, 9), 120, 300);
    const db = await getDb();
    await db.runAsync('DELETE FROM books');
    assert.equal((await loadStats(db, NOW)).words.today, 120);
  });
});
