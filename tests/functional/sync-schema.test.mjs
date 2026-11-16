// Database version 2 and the sync queue: permanent ids, update times, and change tracking by triggers. Uses the app's
// real SQL for every way it writes data, so a new or changed write path that is not tracked fails here.
import { openDatabaseAsync } from 'expo-sqlite';
import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { getDb, initDb } from '../../src/db/index.ts';
import { migrateToV2 } from '../../src/db/syncSchema.ts';
import { inTransaction } from '../../src/db/transaction.ts';
import { applyingRemote, clearOutbox, disableSync, enableSync, getDeviceId, isSyncEnabled, markAllDirty, pendingCount, readOutbox } from '../../src/lib/syncOutbox.ts';
import { clearVault, removeWord, saveWord } from '../../src/lib/vault.ts';
import { sqlFrom } from '../helpers/source.mjs';

const IMPORT_BOOK_SQL = sqlFrom('src/components/ImportModal/ImportModal.tsx', /'(INSERT OR IGNORE INTO books[^']*)'/);
const SAVE_POSITION_SQL = sqlFrom('src/app/reader/[id].tsx', /'(INSERT OR REPLACE INTO reading_positions[^']*)'/);
const OPEN_UPSERT_SQL = sqlFrom('src/app/reader/[id].tsx', /`(INSERT INTO reading_positions[\s\S]*?excluded\.updated_at)`/);
const SESSION_START_SQL = sqlFrom('src/components/Reader/RsvpReader.tsx', /'(INSERT INTO sessions[^']*)'/);
const SESSION_END_SQL = sqlFrom('src/lib/session.ts', /'(UPDATE sessions SET[^']*)'/);
const SESSION_DROP_SQL = sqlFrom('src/components/Reader/RsvpReader.tsx', /'(DELETE FROM sessions[^']*)'/);

const UID = /^[0-9a-f]{32}$/;
const NOW_LOWER_BOUND = Date.UTC(2020, 0, 1);

let db;
let upgraded = false;
const all = (sql, params) => db.getAllAsync(sql, params);
const one = (sql, params) => db.getFirstAsync(sql, params);
const outbox = async () => (await all('SELECT kind, uid FROM sync_outbox ORDER BY seq')).map((r) => `${r.kind}:${r.uid}`);

async function importBook(title, path = `/books/${title}`) {
  const r = await db.runAsync(IMPORT_BOOK_SQL, [title, 'Author', null, 'txt', path, 100, 1_700_000_000_000, 1000]);
  return r.lastInsertRowId;
}
const uidOf = async (table, id) => (await one(`SELECT uid FROM ${table} WHERE id = ?`, [id])).uid;
const bookUid = (id) => uidOf('books', id);

// The first test upgrades a database made by the previous app version, so it must run before anything else touches it.
describe('migration to version 2', () => {
  test('an existing library keeps all its data and every row gets an id and an update time', async () => {
    db = await getDb();
    await db.execAsync(`
      CREATE TABLE books (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, format TEXT NOT NULL, file_path TEXT NOT NULL UNIQUE, file_size INTEGER NOT NULL DEFAULT 0, total_words INTEGER NOT NULL DEFAULT 0, date_added INTEGER NOT NULL, author TEXT NOT NULL DEFAULT '', cover_data TEXT);
      CREATE TABLE reading_positions (book_id INTEGER PRIMARY KEY, word_index INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL);
      CREATE TABLE sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, book_id INTEGER, start_time INTEGER NOT NULL, end_time INTEGER, words_read INTEGER NOT NULL DEFAULT 0, avg_wpm REAL NOT NULL DEFAULT 0, mode TEXT NOT NULL DEFAULT 'normal');
      CREATE TABLE vocab_words (id INTEGER PRIMARY KEY AUTOINCREMENT, word TEXT NOT NULL, definition TEXT NOT NULL, context TEXT NOT NULL DEFAULT '', book_id INTEGER, book_title TEXT NOT NULL DEFAULT '', saved_at INTEGER NOT NULL, next_review INTEGER NOT NULL, interval_days INTEGER NOT NULL DEFAULT 1, ease REAL NOT NULL DEFAULT 2.5, UNIQUE (word, context));
      INSERT INTO books (title, format, file_path, date_added) VALUES ('A', 'txt', '/a', 111), ('B', 'epub', '/b', 222);
      INSERT INTO reading_positions VALUES (1, 50, 999);
      INSERT INTO sessions (book_id, start_time, end_time, words_read, avg_wpm, mode) VALUES (1, 333, 400, 120, 300, 'rsvp'), (2, 444, 500, 80, 250, 'rsvp');
      INSERT INTO vocab_words (word, definition, context, saved_at, next_review) VALUES ('haus', 'house', 'Das Haus.', 555, 600), ('baum', 'tree', 'Der Baum.', 666, 700);
      PRAGMA user_version = 1;
    `);

    await initDb();
    upgraded = true;

    assert.equal((await one('PRAGMA user_version')).user_version, 3);
    const books =await all('SELECT title, date_added, uid, updated_at FROM books ORDER BY id');
    assert.deepEqual(books.map((b) => [b.title, b.date_added, b.updated_at]), [['A', 111, 111], ['B', 222, 222]]);
    const sessions = await all('SELECT words_read, start_time, uid, updated_at FROM sessions ORDER BY id');
    assert.deepEqual(sessions.map((s) => [s.words_read, s.updated_at]), [[120, 333], [80, 444]]);
    const vocab = await all('SELECT word, saved_at, uid, updated_at FROM vocab_words ORDER BY id');
    assert.deepEqual(vocab.map((v) => [v.word, v.updated_at]), [['haus', 555], ['baum', 666]]);
    assert.deepEqual({ ...(await one('SELECT word_index, updated_at FROM reading_positions')) }, { word_index: 50, updated_at: 999 });

    const uids = [...books, ...sessions, ...vocab].map((r) => r.uid);
    for (const uid of uids) assert.match(uid, UID);
    assert.equal(new Set(uids).size, uids.length, 'every id is different');
  });

  test('ids are kept, not remade, when initDb runs again', async () => {
    const before = (await all('SELECT uid FROM books ORDER BY id')).map((r) => r.uid);
    await initDb();
    await initDb();
    assert.deepEqual((await all('SELECT uid FROM books ORDER BY id')).map((r) => r.uid), before);
    assert.equal((await one('PRAGMA user_version')).user_version, 3);
  });

  test('a migration that fails half way leaves the database exactly as it was', async () => {
    const other = await openDatabaseAsync('other');
    await other.execAsync(`
      CREATE TABLE books (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, date_added INTEGER NOT NULL);
      CREATE TABLE reading_positions (book_id INTEGER PRIMARY KEY, word_index INTEGER, updated_at INTEGER NOT NULL);
      CREATE TABLE sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, book_id INTEGER, start_time INTEGER NOT NULL);
      CREATE TABLE vocab_words (id INTEGER PRIMARY KEY AUTOINCREMENT, word TEXT, saved_at INTEGER NOT NULL);
      INSERT INTO books (title, date_added) VALUES ('Keep me', 1);
      CREATE TABLE sync_outbox (kind TEXT);
      PRAGMA user_version = 1;
    `);
    await assert.rejects(inTransaction(other, async () => {
      await migrateToV2(other);
      await other.runAsync('PRAGMA user_version = 2');
    }));
    const names = (await other.getAllAsync('PRAGMA table_info(books)')).map((c) => c.name);
    assert.ok(!names.includes('uid') && !names.includes('updated_at'), 'the columns added before the failure were rolled back');
    assert.equal((await other.getFirstAsync('PRAGMA user_version')).user_version, 1);
    assert.equal((await other.getFirstAsync('SELECT title FROM books')).title, 'Keep me');
    assert.equal((await other.getAllAsync("SELECT name FROM sqlite_master WHERE type = 'trigger'")).length, 0);
  });
});

beforeEach(async () => {
  if (!upgraded) return; // the first test needs the old database exactly as the previous app version left it
  db = await getDb();
  await db.execAsync(`
    DELETE FROM sync_state; DELETE FROM sync_outbox; DELETE FROM sync_tombstones;
    DELETE FROM vocab_words; DELETE FROM sessions; DELETE FROM reading_positions; DELETE FROM books;
    DELETE FROM sync_state; DELETE FROM sync_outbox; DELETE FROM sync_tombstones;
  `);
});

describe('new rows get an id and an update time', () => {
  test('a book imported with the app\'s own SQL', async () => {
    const id = await importBook('One');
    const b = await one('SELECT uid, updated_at FROM books WHERE id = ?', [id]);
    assert.match(b.uid, UID);
    assert.ok(b.updated_at > NOW_LOWER_BOUND);
  });

  test('a session started with the app\'s own SQL, and a saved word', async () => {
    const s = await db.runAsync(SESSION_START_SQL, [null, 1_700_000_000_000, 'rsvp']);
    assert.match(await uidOf('sessions', s.lastInsertRowId), UID);
    await saveWord(db, { word: 'haus', definition: 'house', context: 'Das Haus.', bookId: null, bookTitle: '' });
    assert.match((await one('SELECT uid FROM vocab_words')).uid, UID);
  });

  test('two rows never share an id', async () => {
    const ids = [];
    for (let i = 0; i < 50; i++) ids.push(await bookUid(await importBook(`b${i}`)));
    assert.equal(new Set(ids).size, 50);
  });
});

describe('while sync is off, nothing is tracked', () => {
  test('changes of every kind add nothing to the queue or the tombstones', async () => {
    assert.equal(await isSyncEnabled(db), false);
    const book = await importBook('Quiet');
    await db.runAsync(SAVE_POSITION_SQL, [book, 10, 1]);
    const s = await db.runAsync(SESSION_START_SQL, [book, 5, 'rsvp']);
    await db.runAsync(SESSION_END_SQL, [9, 100, 300, s.lastInsertRowId]);
    await saveWord(db, { word: 'a', definition: 'b', context: 'c', bookId: book, bookTitle: 'Quiet' });
    await db.runAsync('DELETE FROM books WHERE id = ?', [book]);
    await clearVault(db);
    assert.equal(await pendingCount(db), 0);
    assert.equal((await one('SELECT COUNT(*) AS n FROM sync_tombstones')).n, 0);
  });
});

describe('turning sync on', () => {
  test('queues everything that already exists, one entry per record, and gives the phone an id', async () => {
    const a = await importBook('A');
    const b = await importBook('B');
    await db.runAsync(SAVE_POSITION_SQL, [a, 10, 1]);
    const done = await db.runAsync(SESSION_START_SQL, [a, 5, 'rsvp']);
    await db.runAsync(SESSION_END_SQL, [9, 100, 300, done.lastInsertRowId]);
    await db.runAsync(SESSION_START_SQL, [b, 6, 'rsvp']); // still in progress: no words yet
    await saveWord(db, { word: 'x', definition: 'y', context: 'z', bookId: a, bookTitle: 'A' });

    await enableSync(db);

    assert.equal(await isSyncEnabled(db), true);
    const queued = await outbox();
    assert.equal(queued.length, 5);
    assert.deepEqual(new Set(queued), new Set([
      `book:${await bookUid(a)}`, `book:${await bookUid(b)}`, `position:${await bookUid(a)}`,
      `session:${await uidOf('sessions', done.lastInsertRowId)}`, `vocab:${(await one('SELECT uid FROM vocab_words')).uid}`,
    ]));
    assert.match(await getDeviceId(db), UID);
  });

  test('is safe to call twice: no duplicates, and the phone keeps the same id', async () => {
    await importBook('A');
    await enableSync(db);
    const id = await getDeviceId(db);
    await enableSync(db);
    await enableSync(db);
    assert.equal(await pendingCount(db), 1);
    assert.equal(await getDeviceId(db), id);
  });

  test('queue numbers keep growing and are never reused, even after the queue is emptied', async () => {
    await importBook('A');
    await enableSync(db);
    const first = (await readOutbox(db))[0].seq;
    await clearOutbox(db, await readOutbox(db));
    await importBook('B');
    await markAllDirty(db);
    const seqs = (await readOutbox(db)).map((e) => e.seq);
    assert.equal(new Set(seqs).size, seqs.length, 'every entry has its own place in the queue');
    assert.ok(Math.min(...seqs) > first, 'no number from earlier is handed out again');
    assert.equal(seqs.length, 2, 'markAllDirty does not duplicate records');
  });
});

describe('while sync is on, every way the app writes data is tracked', () => {
  beforeEach(() => enableSync(db));

  test('importing a book queues it; importing the same file again changes nothing', async () => {
    const id = await importBook('New', '/same');
    assert.deepEqual(await outbox(), [`book:${await bookUid(id)}`]);
    await clearOutbox(db, await readOutbox(db));
    await db.runAsync(IMPORT_BOOK_SQL, ['New', 'A', null, 'txt', '/same', 1, 1, 1]);
    assert.equal(await pendingCount(db), 0, 'INSERT OR IGNORE that ignores is not a change');
  });

  test('saving a reading position (both ways the reader does it) queues it under the book\'s id, once', async () => {
    const book = await importBook('Read');
    await clearOutbox(db, await readOutbox(db));
    await db.runAsync(SAVE_POSITION_SQL, [book, 10, 1]);
    await db.runAsync(SAVE_POSITION_SQL, [book, 20, 2]); // replaces the row
    await db.runAsync(OPEN_UPSERT_SQL, [book, 30, 3]);
    await db.runAsync(OPEN_UPSERT_SQL, [book, 30, 4]);
    assert.deepEqual(await outbox(), [`position:${await bookUid(book)}`]);
  });

  test('replacing a position does not leave a tombstone', async () => {
    const book = await importBook('Read');
    await db.runAsync(SAVE_POSITION_SQL, [book, 10, 1]);
    await db.runAsync(SAVE_POSITION_SQL, [book, 20, 2]);
    assert.equal((await one('SELECT COUNT(*) AS n FROM sync_tombstones')).n, 0);
  });

  test('a position for a book that is not in the library is ignored', async () => {
    await db.runAsync(SAVE_POSITION_SQL, [9999, 10, 1]);
    assert.equal(await pendingCount(db), 0);
  });

  test('a session is queued when it starts, again when it ends, and its deletion is sent when it is dropped', async () => {
    const s = await db.runAsync(SESSION_START_SQL, [null, 5, 'rsvp']);
    const uid = await uidOf('sessions', s.lastInsertRowId);
    assert.deepEqual(await outbox(), [`session:${uid}`]);
    const [started] = await readOutbox(db);
    await db.runAsync(SESSION_END_SQL, [9, 100, 300, s.lastInsertRowId]);
    const [ended] = await readOutbox(db);
    assert.ok(ended.seq > started.seq, 'the change after it was queued moves it to the back');
    assert.equal(ended.deleted, false);

    await db.runAsync(SESSION_DROP_SQL, [s.lastInsertRowId]);
    const [dropped] = await readOutbox(db);
    assert.equal(dropped.uid, uid);
    assert.equal(dropped.deleted, true);
  });

  test('saving a word queues it; saving the same word and sentence again does not; removing it queues the deletion', async () => {
    const w = { word: 'haus', definition: 'house', context: 'Das Haus.', bookId: null, bookTitle: '' };
    assert.equal(await saveWord(db, w), true);
    const uid = (await one('SELECT uid FROM vocab_words')).uid;
    assert.deepEqual(await outbox(), [`vocab:${uid}`]);
    await clearOutbox(db, await readOutbox(db));
    assert.equal(await saveWord(db, w), false);
    assert.equal(await pendingCount(db), 0);

    const id = (await one('SELECT id FROM vocab_words')).id;
    await removeWord(db, id);
    const [entry] = await readOutbox(db);
    assert.deepEqual({ kind: entry.kind, uid: entry.uid, deleted: entry.deleted }, { kind: 'vocab', uid, deleted: true });
  });

  test('deleting all saved words queues a deletion for each', async () => {
    for (const word of ['a', 'b', 'c']) await saveWord(db, { word, definition: 'd', context: word, bookId: null, bookTitle: '' });
    await clearOutbox(db, await readOutbox(db));
    await clearVault(db);
    const entries = await readOutbox(db);
    assert.equal(entries.length, 3);
    assert.ok(entries.every((e) => e.kind === 'vocab' && e.deleted));
  });

  test('deleting a book (the way the shelf does) queues the book\'s deletion; the position is covered by it', async () => {
    const book = await importBook('Gone');
    await db.runAsync(SAVE_POSITION_SQL, [book, 10, 1]);
    const uid = await bookUid(book);
    await clearOutbox(db, await readOutbox(db));

    await db.runAsync('DELETE FROM books WHERE id = ?', [book]);
    await db.runAsync('DELETE FROM reading_positions WHERE book_id = ?', [book]);

    assert.deepEqual((await readOutbox(db)).map((e) => `${e.kind}:${e.uid}:${e.deleted}`), [`book:${uid}:true`]);
    assert.equal((await one("SELECT COUNT(*) AS n FROM sync_tombstones WHERE kind = 'position'")).n, 0);
  });

  test('a record deleted and a new one added later are different records', async () => {
    const first = await importBook('Same title', '/p1');
    const firstUid = await bookUid(first);
    await db.runAsync('DELETE FROM books WHERE id = ?', [first]);
    const second = await importBook('Same title', '/p2');
    assert.notEqual(await bookUid(second), firstUid);
    const byUid = Object.fromEntries((await readOutbox(db)).map((e) => [e.uid, e.deleted]));
    assert.equal(byUid[firstUid], true);
    assert.equal(byUid[await bookUid(second)], false);
  });
});

describe('update times', () => {
  test('an update sets updated_at to now and never changes the id', async () => {
    const id = await importBook('Edit');
    const uid = await bookUid(id);
    await db.runAsync('UPDATE books SET updated_at = 1 WHERE id = ?', [id]); // set by hand, so it is respected
    assert.equal((await one('SELECT updated_at FROM books WHERE id = ?', [id])).updated_at, 1);

    await db.runAsync('UPDATE books SET total_words = 5 WHERE id = ?', [id]);
    const after = await one('SELECT uid, updated_at FROM books WHERE id = ?', [id]);
    assert.equal(after.uid, uid);
    assert.ok(after.updated_at > NOW_LOWER_BOUND);
  });

  test('works with sync off too, so times are right from the day sync is turned on', async () => {
    assert.equal(await isSyncEnabled(db), false);
    const id = await importBook('Edit');
    await db.runAsync('UPDATE books SET updated_at = 1 WHERE id = ?', [id]);
    await db.runAsync('UPDATE books SET title = ? WHERE id = ?', ['Renamed', id]);
    assert.ok((await one('SELECT updated_at FROM books WHERE id = ?', [id])).updated_at > NOW_LOWER_BOUND);
  });
});

describe('the queue', () => {
  beforeEach(() => enableSync(db));

  test('a record that changes many times is one entry, at its latest place in the queue', async () => {
    const a = await importBook('A');
    const b = await importBook('B');
    for (let i = 0; i < 20; i++) await db.runAsync('UPDATE books SET total_words = ? WHERE id = ?', [i, a]);
    const entries = await readOutbox(db);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].uid, await bookUid(b), 'B was changed least recently');
    assert.equal(entries[1].uid, await bookUid(a));
  });

  test('readOutbox returns the oldest first and respects the limit', async () => {
    for (let i = 0; i < 5; i++) await importBook(`b${i}`);
    const firstTwo = await readOutbox(db, 2);
    assert.equal(firstTwo.length, 2);
    assert.ok(firstTwo[0].seq < firstTwo[1].seq);
    assert.equal((await readOutbox(db)).length, 5);
  });

  test('clearing removes exactly the confirmed entries', async () => {
    for (let i = 0; i < 4; i++) await importBook(`b${i}`);
    const entries = await readOutbox(db);
    await clearOutbox(db, entries.slice(0, 2));
    assert.deepEqual((await readOutbox(db)).map((e) => e.uid), entries.slice(2).map((e) => e.uid));
    await clearOutbox(db, []);
    assert.equal(await pendingCount(db), 2);
  });

  test('a record that changed while its upload was running stays queued', async () => {
    const id = await importBook('Busy');
    const sent = await readOutbox(db); // what the upload took
    await db.runAsync('UPDATE books SET total_words = 99 WHERE id = ?', [id]); // changed again during the upload
    await clearOutbox(db, sent); // the upload is confirmed
    const left = await readOutbox(db);
    assert.equal(left.length, 1, 'the newer change was not thrown away');
    assert.ok(left[0].seq > sent[0].seq);
  });

  test('clearing the same entries twice is harmless', async () => {
    await importBook('A');
    const entries = await readOutbox(db);
    await clearOutbox(db, entries);
    await clearOutbox(db, entries);
    assert.equal(await pendingCount(db), 0);
  });

  test('the queue and the data are separate: clearing the queue never touches the books', async () => {
    await importBook('Safe');
    await clearOutbox(db, await readOutbox(db));
    assert.equal((await one('SELECT COUNT(*) AS n FROM books')).n, 1);
  });

  test('stays small and fast with many changes', async () => {
    await db.execAsync('BEGIN');
    for (let i = 0; i < 2000; i++) await db.runAsync(IMPORT_BOOK_SQL, [`b${i}`, 'A', null, 'txt', `/p${i}`, 1, 1, 1]);
    await db.execAsync('COMMIT');
    assert.equal(await pendingCount(db), 2000);
    const started = Date.now();
    for (let i = 0; i < 500; i++) await db.runAsync('UPDATE books SET total_words = ? WHERE id = 1', [i]);
    assert.equal(await pendingCount(db), 2000, 'repeated changes to one book stay one entry');
    assert.ok(Date.now() - started < 5000, 'tracking a change does not slow down as the queue grows');
  });
});

describe('changes arriving from another device', () => {
  beforeEach(() => enableSync(db));

  test('are not queued to be sent back, and keep their own update time and id', async () => {
    await applyingRemote(db, async () => {
      await db.runAsync(
        "INSERT INTO books (title, format, file_path, date_added, uid, updated_at) VALUES ('Remote', 'txt', '/remote', 1, 'abcdefabcdefabcdefabcdefabcdefab', 12345)",
      );
      await db.runAsync("UPDATE books SET total_words = 7 WHERE file_path = '/remote'");
    });
    assert.equal(await pendingCount(db), 0);
    const b = await one("SELECT uid, updated_at, total_words FROM books WHERE file_path = '/remote'");
    assert.deepEqual({ ...b }, { uid: 'abcdefabcdefabcdefabcdefabcdefab', updated_at: 12345, total_words: 7 });
  });

  test('a deletion applied from another device leaves no tombstone to send back', async () => {
    const id = await importBook('Doomed');
    await clearOutbox(db, await readOutbox(db));
    await applyingRemote(db, () => db.runAsync('DELETE FROM books WHERE id = ?', [id]));
    assert.equal(await pendingCount(db), 0);
    assert.equal((await one('SELECT COUNT(*) AS n FROM sync_tombstones')).n, 0);
  });

  test('tracking resumes afterwards, even if applying them failed', async () => {
    await assert.rejects(applyingRemote(db, async () => { throw new Error('download broke'); }));
    await importBook('Local again');
    assert.equal(await pendingCount(db), 1);
  });
});

describe('turning sync off', () => {
  test('stops tracking and empties the queue, but keeps every record and its id', async () => {
    const id = await importBook('Stay');
    const uid = await bookUid(id);
    await enableSync(db);
    assert.equal(await pendingCount(db), 1);

    await disableSync(db);

    assert.equal(await isSyncEnabled(db), false);
    assert.equal(await pendingCount(db), 0);
    assert.equal(await bookUid(id), uid);
    await importBook('After');
    assert.equal(await pendingCount(db), 0);
  });

  test('turning it back on queues everything again', async () => {
    await importBook('A');
    await enableSync(db);
    await disableSync(db);
    await importBook('B');
    await enableSync(db);
    assert.equal(await pendingCount(db), 2);
  });
});
