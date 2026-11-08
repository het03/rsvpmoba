// Runs the app's real database code and real SQL (against Node's built-in SQLite).
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { getDb, initDb } from '../../src/db/index.ts';
import { sqlFrom } from '../helpers/source.mjs';

// The exact statements the screens use, read from their source files.
const SHELF_SQL = sqlFrom('src/app/index.tsx', /`(SELECT b\.id[\s\S]*?)`/);
const RECENT_SQL = sqlFrom('src/app/reader.tsx', /`(SELECT b\.id[\s\S]*?)`/);
const OPEN_UPSERT_SQL = sqlFrom('src/app/reader/[id].tsx', /`(INSERT INTO reading_positions[\s\S]*?excluded\.updated_at)`/);
const SAVE_POSITION_SQL = sqlFrom('src/app/reader/[id].tsx', /'(INSERT OR REPLACE INTO reading_positions[^']*)'/);
const SESSION_START_SQL = sqlFrom('src/components/Reader/RsvpReader.tsx', /'(INSERT INTO sessions[^']*)'/);
const SESSION_END_SQL = sqlFrom('src/components/Reader/RsvpReader.tsx', /'(UPDATE sessions SET[^']*)'/);
const SESSION_DROP_SQL = sqlFrom('src/components/Reader/RsvpReader.tsx', /'(DELETE FROM sessions[^']*)'/);

const columns = async (table) => (await (await getDb()).getAllAsync(`PRAGMA table_info(${table})`)).map((c) => c.name);

async function addBook(title, extra = {}) {
  const db = await getDb();
  const result = await db.runAsync(
    'INSERT INTO books (title, author, format, file_path, file_size, total_words, date_added) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [title, extra.author ?? '', extra.format ?? 'txt', extra.path ?? `/books/${title}`, 100, extra.words ?? 1000, extra.added ?? Date.now()],
  );
  return result.lastInsertRowId;
}

describe('schema and migration', () => {
  test('upgrades an old (version 0) database without losing books', async () => {
    const db = await getDb();
    // A database as the very first app version created it: no author or cover columns.
    await db.runAsync('CREATE TABLE books (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, format TEXT NOT NULL, file_path TEXT NOT NULL UNIQUE, file_size INTEGER NOT NULL DEFAULT 0, total_words INTEGER NOT NULL DEFAULT 0, date_added INTEGER NOT NULL)');
    await db.runAsync("INSERT INTO books (title, format, file_path, date_added) VALUES ('Old book', 'txt', '/old', 1)");

    await initDb();

    assert.ok((await columns('books')).includes('author'));
    assert.ok((await columns('books')).includes('cover_data'));
    const old = await db.getFirstAsync("SELECT title, author, cover_data FROM books WHERE file_path = '/old'");
    assert.deepEqual({ ...old }, { title: 'Old book', author: '', cover_data: null });
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 1);
  });

  test('creates every table the app uses', async () => {
    assert.deepEqual((await columns('reading_positions')).sort(), ['book_id', 'updated_at', 'word_index']);
    assert.deepEqual((await columns('sessions')).sort(), ['avg_wpm', 'book_id', 'end_time', 'id', 'mode', 'start_time', 'words_read']);
  });

  test('running initDb again is harmless', async () => {
    await initDb();
    await initDb();
    assert.equal(((await (await getDb()).getFirstAsync('PRAGMA user_version')).user_version), 1);
  });

  test('the same file cannot be imported twice', async () => {
    await addBook('Dup', { path: '/dup' });
    await assert.rejects(addBook('Dup again', { path: '/dup' }), /UNIQUE/i);
  });
});

describe('shelf query', () => {
  test('newest first, unread books show zero progress', async () => {
    const db = await getDb();
    await db.runAsync('DELETE FROM books');
    const older = await addBook('Older', { added: 1000, words: 500 });
    const newer = await addBook('Newer', { added: 2000, words: 800 });
    await db.runAsync('INSERT INTO reading_positions (book_id, word_index, updated_at) VALUES (?, 200, 5)', [older]);

    const rows = await db.getAllAsync(SHELF_SQL);
    assert.deepEqual(rows.map((r) => r.title), ['Newer', 'Older']);
    assert.equal(rows.find((r) => r.id === newer).word_index, 0);
    assert.equal(rows.find((r) => r.id === older).word_index, 200);
    assert.equal(rows.find((r) => r.id === older).total_words, 500);
  });
});

describe('reading positions', () => {
  test('opening a book creates its position row at the saved spot', async () => {
    const db = await getDb();
    const id = await addBook('Fresh');
    await db.runAsync(OPEN_UPSERT_SQL, [id, 0, 111]);
    const row = await db.getFirstAsync('SELECT * FROM reading_positions WHERE book_id = ?', [id]);
    assert.deepEqual({ ...row }, { book_id: id, word_index: 0, updated_at: 111 });
  });

  test('opening an already-read book refreshes the time but keeps the position', async () => {
    const db = await getDb();
    const id = await addBook('Half read');
    await db.runAsync('INSERT INTO reading_positions (book_id, word_index, updated_at) VALUES (?, ?, ?)', [id, 420, 10]);
    await db.runAsync(OPEN_UPSERT_SQL, [id, 420, 999]);
    const row = await db.getFirstAsync('SELECT word_index, updated_at FROM reading_positions WHERE book_id = ?', [id]);
    assert.deepEqual({ ...row }, { word_index: 420, updated_at: 999 });
  });

  test('saving progress replaces the previous position (one row per book)', async () => {
    const db = await getDb();
    const id = await addBook('Saved');
    await db.runAsync(SAVE_POSITION_SQL, [id, 10, 1]);
    await db.runAsync(SAVE_POSITION_SQL, [id, 77, 2]);
    const rows = await db.getAllAsync('SELECT word_index FROM reading_positions WHERE book_id = ?', [id]);
    assert.deepEqual(rows.map((r) => r.word_index), [77]);
  });

  test('"Continue reading" lists only opened books, most recent first, at most 8', async () => {
    const db = await getDb();
    await db.runAsync('DELETE FROM reading_positions');
    await db.runAsync('DELETE FROM books');
    const ids = [];
    for (let i = 0; i < 10; i++) ids.push(await addBook(`Book ${i}`, { path: `/b${i}` }));
    await addBook('Never opened', { path: '/never' });
    for (let i = 0; i < 10; i++) await db.runAsync('INSERT INTO reading_positions (book_id, word_index, updated_at) VALUES (?, 5, ?)', [ids[i], 100 + i]);

    const rows = await db.getAllAsync(RECENT_SQL);
    assert.equal(rows.length, 8);
    assert.equal(rows[0].title, 'Book 9');
    assert.equal(rows[7].title, 'Book 2');
    assert.ok(!rows.some((r) => r.title === 'Never opened'));
  });

  test('a book that is deleted no longer appears in "Continue reading"', async () => {
    const db = await getDb();
    await db.runAsync('DELETE FROM reading_positions');
    await db.runAsync('DELETE FROM books');
    const id = await addBook('Doomed', { path: '/doomed' });
    await db.runAsync('INSERT INTO reading_positions (book_id, word_index, updated_at) VALUES (?, 5, 1)', [id]);
    await db.runAsync('DELETE FROM books WHERE id = ?', [id]);
    await db.runAsync('DELETE FROM reading_positions WHERE book_id = ?', [id]);
    assert.equal((await db.getAllAsync(RECENT_SQL)).length, 0);
    assert.equal((await db.getAllAsync('SELECT * FROM reading_positions')).length, 0);
  });
});

describe('RSVP sessions', () => {
  test('start, then end with words and average speed', async () => {
    const db = await getDb();
    const id = await addBook('Fast read', { path: '/fast' });
    const started = await db.runAsync(SESSION_START_SQL, [id, 1000, 'rsvp']);
    await db.runAsync(SESSION_END_SQL, [5000, 320, 288.5, started.lastInsertRowId]);
    const s = await db.getFirstAsync('SELECT * FROM sessions WHERE id = ?', [started.lastInsertRowId]);
    assert.equal(s.mode, 'rsvp');
    assert.equal(s.words_read, 320);
    assert.equal(s.avg_wpm, 288.5);
    assert.equal(s.end_time, 5000);
  });

  test('a session that read nothing is removed', async () => {
    const db = await getDb();
    const id = await addBook('Glanced', { path: '/glanced' });
    const started = await db.runAsync(SESSION_START_SQL, [id, 1, 'rsvp']);
    await db.runAsync(SESSION_DROP_SQL, [started.lastInsertRowId]);
    assert.equal(await db.getFirstAsync('SELECT id FROM sessions WHERE id = ?', [started.lastInsertRowId]), null);
  });

  test('a new session starts open (no end time, zero words)', async () => {
    const db = await getDb();
    const id = await addBook('Open session', { path: '/open' });
    const started = await db.runAsync(SESSION_START_SQL, [id, 42, 'rsvp']);
    const s = await db.getFirstAsync('SELECT * FROM sessions WHERE id = ?', [started.lastInsertRowId]);
    assert.equal(s.end_time, null);
    assert.equal(s.words_read, 0);
  });
});
