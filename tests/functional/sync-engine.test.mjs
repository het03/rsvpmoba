// The sync engine against a pretend Drive and pretend phones: the save point, two phones agreeing, and everything that can go wrong.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { deltaName, encodeDelta, encodeSnapshot, snapshotName } from '../../src/lib/syncFormat.ts';
import { getSyncStatus, syncOnce } from '../../src/lib/syncEngine.ts';
import { disableSync, enableSync, getDeviceId, markAllDirty, pendingCount, readOutbox } from '../../src/lib/syncOutbox.ts';
import { resolveParked } from '../../src/lib/syncRecords.ts';
import { addBook, addSession, addWord, bookUid, countOf, fakeDrive, newPhone, savePosition, snapshotOf } from '../helpers/syncWorld.mjs';

const T = 1_700_000_000_000;
const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };

describe('turning sync on and the first upload', () => {
  test('does nothing while sync is off', async () => {
    const drive = fakeDrive();
    const phone = await newPhone('off', { sync: false });
    await addBook(phone, 'A');
    const r = await syncOnce(phone, drive);
    assert.deepEqual(r, { ok: false, stage: 'off', error: 'sync is off' });
    assert.equal(drive.calls.list + drive.calls.create, 0, 'Drive was not touched');
  });

  test('uploads one small file with what changed, then the queue is empty and the data is still on the phone', async () => {
    const drive = fakeDrive();
    const phone = await newPhone('first');
    const book = await addBook(phone, 'Das Haus');
    await savePosition(phone, book, 120, T);
    await addSession(phone, book, T, 300);
    await addWord(phone, 'haus', 'Das Haus.', book);

    const r = ok(await syncOnce(phone, drive));

    assert.equal(r.pushed, 4);
    assert.equal(drive.names().length, 1);
    assert.match(drive.names()[0], /^delta-[0-9a-f]{32}-00000001\.json$/);
    assert.equal(await pendingCount(phone), 0);
    assert.equal(await countOf(phone, 'books'), 1, 'the books are still here');
    assert.equal(await countOf(phone, 'vocab_words'), 1);
    assert.equal(await countOf(phone, 'sessions'), 1);
  });

  test('a second pass with nothing changed uploads nothing', async () => {
    const drive = fakeDrive();
    const phone = await newPhone('idle');
    await addBook(phone, 'A');
    ok(await syncOnce(phone, drive));
    const created = drive.calls.create;
    const r = ok(await syncOnce(phone, drive));
    assert.equal(r.pushed, 0);
    assert.equal(drive.calls.create, created, 'no new file');
  });

  test('a changed record is sent again, as a small delta, not the whole library', async () => {
    const drive = fakeDrive();
    const phone = await newPhone('delta');
    const book = await addBook(phone, 'A');
    for (let i = 0; i < 20; i++) await addWord(phone, `w${i}`, `c${i}`);
    ok(await syncOnce(phone, drive));
    await savePosition(phone, book, 99, T + 5);
    const r = ok(await syncOnce(phone, drive));
    assert.equal(r.pushed, 1, 'only the changed position');
    assert.equal(drive.names().length, 2);
  });
});

describe('the save point: offline, failures and retries', () => {
  test('offline, changes pile up in the queue and nothing is lost; online again, they are sent', async () => {
    const drive = fakeDrive();
    const phone = await newPhone('offline');
    const book = await addBook(phone, 'A');
    ok(await syncOnce(phone, drive));

    drive.offline = true;
    await addWord(phone, 'eins', 'c1');
    await addWord(phone, 'zwei', 'c2');
    await savePosition(phone, book, 50, T);
    const failed = await syncOnce(phone, drive);
    assert.equal(failed.ok, false);
    assert.equal(failed.stage, 'pull');
    assert.ok((await pendingCount(phone)) >= 3, 'the changes are still queued');
    assert.equal(await countOf(phone, 'vocab_words'), 2, 'and still on the phone');

    drive.offline = false;
    const r = ok(await syncOnce(phone, drive));
    assert.ok(r.pushed >= 3);
    assert.equal(await pendingCount(phone), 0);
  });

  test('a failed upload leaves the queue exactly as it was, and the next pass sends it', async () => {
    const drive = fakeDrive();
    const phone = await newPhone('failup');
    await addBook(phone, 'A');
    const before = await readOutbox(phone);
    drive.failNext.add('create');
    const failed = await syncOnce(phone, drive);
    assert.equal(failed.ok, false);
    assert.equal(failed.stage, 'push');
    assert.deepEqual(await readOutbox(phone), before, 'not one entry was removed');
    assert.equal(drive.files.size, 0);

    ok(await syncOnce(phone, drive));
    assert.equal(await pendingCount(phone), 0);
    assert.equal(drive.files.size, 1);
  });

  test('a change made during an upload stays queued and goes in the next one', async () => {
    const drive = fakeDrive();
    const phone = await newPhone('during');
    const book = await addBook(phone, 'A');
    await savePosition(phone, book, 10, T);
    const realCreate = drive.create;
    drive.create = async (name, content) => {
      const file = await realCreate(name, content);
      await savePosition(phone, book, 77, T + 9); // the reader moves on while the upload is in flight
      return file;
    };
    ok(await syncOnce(phone, drive));
    drive.create = realCreate;
    assert.equal(await pendingCount(phone), 1, 'the newer position is still waiting');
    const r = ok(await syncOnce(phone, drive));
    assert.equal(r.pushed, 1);
    assert.equal(await pendingCount(phone), 0);
  });

  test('a failed upload never produces two files with the same name', async () => {
    const drive = fakeDrive();
    const phone = await newPhone('names');
    await addBook(phone, 'A');
    drive.failNext.add('create');
    await syncOnce(phone, drive);
    ok(await syncOnce(phone, drive));
    await addWord(phone, 'x', 'y');
    ok(await syncOnce(phone, drive));
    const names = drive.names();
    assert.equal(new Set(names).size, names.length);
  });

  test('never throws: any failure comes back as a result', async () => {
    const drive = fakeDrive();
    const phone = await newPhone('nothrow');
    for (const op of ['list', 'read', 'create']) {
      drive.failNext.add(op);
      const r = await syncOnce(phone, drive);
      assert.equal(typeof r.ok, 'boolean');
    }
  });

  test('two passes started together run once', async () => {
    const drive = fakeDrive();
    const phone = await newPhone('single');
    await addBook(phone, 'A');
    const [a, b] = await Promise.all([syncOnce(phone, drive), syncOnce(phone, drive)]);
    assert.equal(a, b);
    assert.equal(drive.files.size, 1);
  });

  test('the status shows when it last worked, and the last error', async () => {
    const drive = fakeDrive();
    const phone = await newPhone('status');
    assert.deepEqual(await getSyncStatus(phone), { enabled: true, pending: 0, lastSyncAt: null, lastError: null });
    drive.offline = true;
    await syncOnce(phone, drive, { now: 1000 });
    assert.equal((await getSyncStatus(phone)).lastError, 'offline');
    drive.offline = false;
    await addBook(phone, 'A');
    await syncOnce(phone, drive, { now: 5000 });
    assert.deepEqual(await getSyncStatus(phone), { enabled: true, pending: 0, lastSyncAt: 5000, lastError: null });
  });
});

describe('two phones', () => {
  test('a saved word, a session and a position made on one phone appear on the other', async () => {
    const drive = fakeDrive();
    const a = await newPhone('a1');
    const b = await newPhone('b1');
    const bookA = await addBook(a, 'Das Haus', { size: 777 });
    const bookB = await addBook(b, 'Das Haus', { size: 777 }); // the same book, imported separately
    await savePosition(a, bookA, 300, T + 10);
    await addSession(a, bookA, T, 450);
    await addWord(a, 'haus', 'Das Haus.', bookA);

    ok(await syncOnce(a, drive));
    ok(await syncOnce(b, drive));

    assert.equal((await b.getFirstAsync('SELECT word_index FROM reading_positions WHERE book_id = ?', [bookB])).word_index, 300);
    assert.equal(await countOf(b, 'sessions'), 1);
    assert.equal((await b.getFirstAsync('SELECT word FROM vocab_words')).word, 'haus');
    assert.deepEqual(await snapshotOf(a), await snapshotOf(b));
  });

  test('the same book added on both phones becomes one book with one id on both, not two', async () => {
    const drive = fakeDrive();
    const a = await newPhone('a2');
    const b = await newPhone('b2');
    const ida = await addBook(a, 'Same Book', { size: 4242 });
    const idb = await addBook(b, 'same  book', { size: 4242 });
    ok(await syncOnce(a, drive));
    ok(await syncOnce(b, drive));
    ok(await syncOnce(a, drive));
    assert.equal(await countOf(a, 'books'), 1);
    assert.equal(await countOf(b, 'books'), 1);
    assert.equal(await bookUid(a, ida), await bookUid(b, idb), 'both call it by the same id');
  });

  for (const [label, uidA, uidB] of [['this phone has the lower id', '1'.repeat(32), 'f'.repeat(32)], ['this phone has the higher id', 'f'.repeat(32), '1'.repeat(32)]]) {
    test(`the same book with ids forced either way round (${label}): one book, one id, the newest position and every session survive`, async () => {
      const drive = fakeDrive();
      const a = await newPhone(`forced-a-${label}`);
      const b = await newPhone(`forced-b-${label}`);
      const ia = await addBook(a, 'Forced', { size: 31 });
      const ib = await addBook(b, 'Forced', { size: 31 });
      await a.runAsync('UPDATE books SET uid = ? WHERE id = ?', [uidA, ia]);
      await b.runAsync('UPDATE books SET uid = ? WHERE id = ?', [uidB, ib]);
      await savePosition(a, ia, 100, T + 1);
      await savePosition(b, ib, 900, T + 2); // the later one
      await addSession(a, ia, T + 10, 111);
      await addSession(b, ib, T + 20, 222);
      await markAllDirty(a);
      await markAllDirty(b);

      for (let pass = 0; pass < 3; pass++) { ok(await syncOnce(a, drive)); ok(await syncOnce(b, drive)); }

      const lowest = uidA < uidB ? uidA : uidB;
      for (const phone of [a, b]) {
        assert.equal(await countOf(phone, 'books'), 1);
        assert.equal((await phone.getFirstAsync('SELECT uid FROM books')).uid, lowest, 'both use the lower id');
        assert.equal((await phone.getFirstAsync('SELECT word_index FROM reading_positions')).word_index, 900);
        assert.equal(await countOf(phone, 'sessions'), 2);
        assert.equal(await pendingCount(phone), 0);
      }
      assert.deepEqual(await snapshotOf(a), await snapshotOf(b));
    });
  }

  test('the same word saved from the same sentence on both phones is one word', async () => {
    const drive = fakeDrive();
    const a = await newPhone('a3');
    const b = await newPhone('b3');
    await addWord(a, 'haus', 'Das Haus.');
    await addWord(b, 'haus', 'Das Haus.');
    ok(await syncOnce(a, drive));
    ok(await syncOnce(b, drive));
    ok(await syncOnce(a, drive));
    assert.equal(await countOf(a, 'vocab_words'), 1);
    assert.equal(await countOf(b, 'vocab_words'), 1);
    assert.deepEqual(await snapshotOf(a), await snapshotOf(b));
  });

  test('a record that arrived from another phone is not sent back (no echo)', async () => {
    const drive = fakeDrive();
    const a = await newPhone('a4');
    const b = await newPhone('b4');
    await addWord(a, 'haus', 'Das Haus.');
    ok(await syncOnce(a, drive));
    const r = ok(await syncOnce(b, drive));
    assert.equal(r.applied, 1);
    assert.equal(r.pushed, 0, 'B only received; it has nothing of its own to send');
    assert.equal(await pendingCount(b), 0);
    assert.equal(drive.names().filter((n) => n.startsWith('delta')).length, 1, 'no second file appeared');
  });

  test('the later reading position wins, on both phones', async () => {
    const drive = fakeDrive();
    const a = await newPhone('a5');
    const b = await newPhone('b5');
    const ba = await addBook(a, 'Book', { size: 9 });
    const bb = await addBook(b, 'Book', { size: 9 });
    await savePosition(a, ba, 100, T + 1000);
    await savePosition(b, bb, 500, T + 2000); // read later, on B
    for (let i = 0; i < 2; i++) { ok(await syncOnce(a, drive)); ok(await syncOnce(b, drive)); }
    assert.equal((await a.getFirstAsync('SELECT word_index FROM reading_positions')).word_index, 500);
    assert.equal((await b.getFirstAsync('SELECT word_index FROM reading_positions')).word_index, 500);
  });

  test('a word deleted on one phone is deleted on the other, and an old copy cannot bring it back', async () => {
    const drive = fakeDrive();
    const a = await newPhone('a6');
    const b = await newPhone('b6');
    await addWord(a, 'weg', 'Es ist weg.');
    ok(await syncOnce(a, drive));
    ok(await syncOnce(b, drive));
    assert.equal(await countOf(b, 'vocab_words'), 1);
    const oldFile = [...drive.files.values()][0]; // the file that has the word

    await a.runAsync('DELETE FROM vocab_words');
    ok(await syncOnce(a, drive));
    ok(await syncOnce(b, drive));
    assert.equal(await countOf(b, 'vocab_words'), 0, 'deleted on B too');

    drive.put(oldFile.name.replace('00000001', '00000009'), oldFile.content); // an old copy turns up again
    ok(await syncOnce(b, drive));
    assert.equal(await countOf(b, 'vocab_words'), 0, 'the stale copy is older than the deletion, so the word stays deleted');
  });

  test('a book removed on one phone is NOT removed from the other', async () => {
    const drive = fakeDrive();
    const a = await newPhone('a7');
    const b = await newPhone('b7');
    const ba = await addBook(a, 'Keep Me', { size: 5 });
    await addBook(b, 'Keep Me', { size: 5 });
    ok(await syncOnce(a, drive));
    ok(await syncOnce(b, drive));
    await a.runAsync('DELETE FROM books WHERE id = ?', [ba]);
    ok(await syncOnce(a, drive));
    ok(await syncOnce(b, drive));
    assert.equal(await countOf(b, 'books'), 1, 'B still has its book (and so its file)');
  });

  test('a new phone gets sessions and words; positions wait until the same book is added, then apply', async () => {
    const drive = fakeDrive();
    const a = await newPhone('a8');
    const fresh = await newPhone('fresh8');
    const book = await addBook(a, 'Long Novel', { size: 123456 });
    await savePosition(a, book, 8000, T + 50);
    await addSession(a, book, T, 900);
    await addWord(a, 'wort', 'Ein Wort.', book);
    ok(await syncOnce(a, drive));

    const r = ok(await syncOnce(fresh, drive));
    assert.equal(await countOf(fresh, 'sessions'), 1);
    assert.equal(await countOf(fresh, 'vocab_words'), 1);
    assert.equal(await countOf(fresh, 'books'), 0, 'a book is never added from another phone');
    assert.ok(r.parked >= 1, 'its position and book are waiting');
    assert.equal(await countOf(fresh, 'reading_positions'), 0);

    const mine = await addBook(fresh, 'Long Novel', { size: 123456 }); // the user imports the same book
    assert.ok((await resolveParked(fresh)) >= 1);
    assert.equal((await fresh.getFirstAsync('SELECT word_index FROM reading_positions WHERE book_id = ?', [mine])).word_index, 8000);
    assert.equal((await fresh.getFirstAsync('SELECT COUNT(*) AS n FROM sync_parked')).n, 0);
  });

  test('three phones, many changes, synced in different orders, end up the same', async () => {
    const drive = fakeDrive();
    const phones = [await newPhone('c1'), await newPhone('c2'), await newPhone('c3')];
    const ids = [];
    for (const p of phones) ids.push(await addBook(p, 'Shared', { size: 11 }));
    let t = T;
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < 3; i++) {
        await addWord(phones[i], `w${round}${i}`, `c${round}${i}`);
        await addSession(phones[i], ids[i], (t += 100_000), 100 + round * 10 + i);
        await savePosition(phones[i], ids[i], round * 100 + i, (t += 10));
      }
      for (const p of [phones[round % 3], phones[(round + 1) % 3]]) ok(await syncOnce(p, drive));
    }
    for (let pass = 0; pass < 3; pass++) for (const p of phones) ok(await syncOnce(p, drive));

    const [x, y, z] = [await snapshotOf(phones[0]), await snapshotOf(phones[1]), await snapshotOf(phones[2])];
    assert.deepEqual(y, x);
    assert.deepEqual(z, x);
    assert.equal(x.vocab.length, 9);
    assert.equal(x.sessions.length, 9);
    assert.equal(x.books.length, 1);
    for (const p of phones) assert.equal(await pendingCount(p), 0);
  });
});

describe('snapshots and tidying up', () => {
  test('a large first upload is sent as one snapshot, not hundreds of files, and a new phone can read it', async () => {
    const drive = fakeDrive();
    const a = await newPhone('big', { sync: false });
    const book = await addBook(a, 'Big', { size: 1 });
    for (let i = 0; i < 60; i++) await addSession(a, book, T + i * 100_000, 100 + i);
    await enableSync(a);
    ok(await syncOnce(a, drive, { bigBatch: 10 }));
    assert.equal(drive.names().length, 1);
    assert.match(drive.names()[0], /^snapshot-/);

    const b = await newPhone('big2');
    ok(await syncOnce(b, drive));
    assert.equal(await countOf(b, 'sessions'), 60);
  });

  test('after many small files the phone writes one snapshot and removes the small ones; another phone still ends up right', async () => {
    const drive = fakeDrive();
    const a = await newPhone('comp');
    const other = await newPhone('comp2');
    const book = await addBook(a, 'B', { size: 2 });
    for (let i = 0; i < 6; i++) {
      await addSession(a, book, T + i * 100_000, 50 + i);
      ok(await syncOnce(a, drive, { compactAfter: 4 }));
    }
    const names = drive.names();
    assert.ok(names.some((n) => n.startsWith('snapshot-')), 'a snapshot was written');
    assert.ok(names.filter((n) => n.startsWith('delta-')).length <= 4, 'the small files were tidied');
    assert.equal(await countOf(a, 'sessions'), 6, 'nothing was lost on the phone');

    ok(await syncOnce(other, drive));
    assert.equal(await countOf(other, 'sessions'), 6);
  });

  test('if the old files cannot be removed, nothing is lost and reading them again is harmless', async () => {
    const drive = fakeDrive();
    const a = await newPhone('comp3');
    const b = await newPhone('comp4');
    const book = await addBook(a, 'B', { size: 2 });
    drive.failRemove = true;
    for (let i = 0; i < 6; i++) {
      await addSession(a, book, T + i * 100_000, 50 + i);
      ok(await syncOnce(a, drive, { compactAfter: 3 }));
    }
    ok(await syncOnce(b, drive));
    ok(await syncOnce(b, drive));
    assert.equal(await countOf(b, 'sessions'), 6, 'no session was counted twice');
  });

  test('a phone that was away while its friend tidied up catches up from the snapshot', async () => {
    const drive = fakeDrive();
    const a = await newPhone('away1');
    const b = await newPhone('away2');
    const book = await addBook(a, 'B', { size: 3 });
    await addSession(a, book, T, 10);
    ok(await syncOnce(a, drive, { compactAfter: 2 }));
    ok(await syncOnce(b, drive)); // B is up to date so far
    for (let i = 1; i <= 6; i++) {
      await addSession(a, book, T + i * 100_000, 10 + i);
      ok(await syncOnce(a, drive, { compactAfter: 2 })); // B is away; A tidies up repeatedly
    }
    ok(await syncOnce(b, drive));
    assert.equal(await countOf(b, 'sessions'), 7);
  });
});

describe('files from outside are untrusted', () => {
  const DEV = 'f'.repeat(32);

  test('garbage, the wrong shape, and files from a newer app are skipped; good files still apply', async () => {
    const drive = fakeDrive();
    const a = await newPhone('src');
    await addWord(a, 'gut', 'Gut so.');
    ok(await syncOnce(a, drive));

    drive.put(deltaName(DEV, 1), 'this is not json');
    drive.put(deltaName(DEV, 2), '{"v":99,"type":"delta"}');
    drive.put(deltaName(DEV, 3), JSON.stringify({ v: 1, type: 'delta', device: DEV, seq: 3, at: 1, records: [{ junk: 1 }, 7, null] }));
    drive.put('notes.txt', 'hello');
    drive.put(`delta-${DEV}-3.json`, 'bad name');

    const b = await newPhone('reader');
    const r = ok(await syncOnce(b, drive));
    assert.equal(await countOf(b, 'vocab_words'), 1, 'the good word arrived');
    assert.ok(r.applied >= 1);
  });

  test('a file whose contents claim another device or another number is ignored', async () => {
    const drive = fakeDrive();
    const rec = { kind: 'vocab', id: 'e'.repeat(32), updatedAt: T, deleted: false, data: { w: 'fake', df: 'x', c: 'y', b: null, bt: '', sa: 1, nr: 1, iv: 1, ez: 2.5 } };
    drive.put(deltaName(DEV, 1), encodeDelta('1'.repeat(32), 1, T, [rec])); // name says one device, contents another
    drive.put(deltaName(DEV, 2), encodeDelta(DEV, 7, T, [rec])); // name says 2, contents say 7
    drive.put(snapshotName(DEV, 5), encodeSnapshot(DEV, 9, T, [rec])); // name says 5, contents say 9
    const b = await newPhone('strict');
    ok(await syncOnce(b, drive));
    assert.equal(await countOf(b, 'vocab_words'), 0);
  });

  test('a file that is too large is ignored without loading it', async () => {
    const drive = fakeDrive();
    drive.put(deltaName(DEV, 1), 'x'.repeat(9 * 1024 * 1024));
    const b = await newPhone('huge');
    ok(await syncOnce(b, drive));
  });

  test('records with hostile text are stored as plain text and nothing runs', async () => {
    const drive = fakeDrive();
    const evil = "x'); DROP TABLE books; --";
    const rec = { kind: 'vocab', id: 'd'.repeat(32), updatedAt: T, deleted: false, data: { w: evil, df: '<script>alert(1)</script>', c: evil, b: null, bt: '', sa: 1, nr: 1, iv: 1, ez: 2.5 } };
    drive.put(deltaName(DEV, 1), encodeDelta(DEV, 1, T, [rec]));
    const b = await newPhone('evil');
    await addBook(b, 'Still here');
    ok(await syncOnce(b, drive));
    assert.equal(await countOf(b, 'books'), 1, 'the books table is intact');
    assert.equal((await b.getFirstAsync('SELECT word FROM vocab_words')).word, evil);
  });

  test('its own files on Drive are never read back', async () => {
    const drive = fakeDrive();
    const a = await newPhone('own');
    await addWord(a, 'meins', 'Mein Wort.');
    ok(await syncOnce(a, drive));
    const reads = drive.calls.read;
    ok(await syncOnce(a, drive));
    assert.equal(drive.calls.read, reads);
  });

  test('a read that fails stops the pass and is retried, without skipping the file', async () => {
    const drive = fakeDrive();
    const a = await newPhone('flaky1');
    await addWord(a, 'wort', 'Ein Wort.');
    ok(await syncOnce(a, drive));
    const b = await newPhone('flaky2');
    drive.failNext.add('read');
    const failed = await syncOnce(b, drive);
    assert.equal(failed.ok, false);
    assert.equal(failed.stage, 'pull');
    assert.equal(await countOf(b, 'vocab_words'), 0);
    ok(await syncOnce(b, drive));
    assert.equal(await countOf(b, 'vocab_words'), 1, 'picked up on the retry');
  });
});

describe('settings travel with the data', () => {
  const rec = (id, value, at) => ({ kind: 'setting', id, updatedAt: at, deleted: false, data: { v: value } });
  function adapter(initial = []) {
    const state = { changed: [...initial], all: [...initial], confirmed: [], applied: [] };
    return {
      state,
      changed: async () => state.changed,
      all: async () => state.all,
      confirm: async (sent) => { state.confirmed.push(...sent); state.changed = state.changed.filter((r) => !sent.includes(r)); },
      apply: async (records) => { state.applied.push(...records); },
    };
  }

  test('changed settings go in the upload and are confirmed only after it succeeds', async () => {
    const drive = fakeDrive();
    const phone = await newPhone('set1');
    const settings = adapter([rec('dailyGoal', '1500', T)]);
    drive.failNext.add('create');
    assert.equal((await syncOnce(phone, drive, { settings })).ok, false);
    assert.equal(settings.state.confirmed.length, 0, 'not confirmed after a failed upload');
    ok(await syncOnce(phone, drive, { settings }));
    assert.equal(settings.state.confirmed.length, 1);
    assert.equal(drive.files.size, 1);
  });

  test('settings from another phone are handed to the adapter', async () => {
    const drive = fakeDrive();
    const a = await newPhone('set2');
    const b = await newPhone('set3');
    ok(await syncOnce(a, drive, { settings: adapter([rec('rsvpWpm', '450', T)]) }));
    const receiver = adapter();
    ok(await syncOnce(b, drive, { settings: receiver }));
    assert.deepEqual(receiver.state.applied.map((r) => [r.id, r.data.v]), [['rsvpWpm', '450']]);
  });
});

describe('turning sync off and on again', () => {
  test('off stops uploading and empties the queue; on again queues everything and uploads', async () => {
    const drive = fakeDrive();
    const phone = await newPhone('toggle');
    await addWord(phone, 'a', 'b');
    ok(await syncOnce(phone, drive));
    await disableSync(phone);
    await addWord(phone, 'c', 'd');
    assert.equal((await syncOnce(phone, drive)).ok, false);
    await enableSync(phone);
    const r = ok(await syncOnce(phone, drive));
    assert.equal(r.pushed, 2, 'both words, including the one added while sync was off');
  });

  test('the phone keeps the same id across off and on, so its files keep numbering on', async () => {
    const phone = await newPhone('keepid');
    const id = await getDeviceId(phone);
    await disableSync(phone);
    await enableSync(phone);
    assert.equal(await getDeviceId(phone), id);
  });

  test('markAllDirty then sync re-sends everything (a way to repair a lost folder)', async () => {
    const drive = fakeDrive();
    const phone = await newPhone('repair');
    await addWord(phone, 'a', 'b');
    ok(await syncOnce(phone, drive));
    drive.files.clear(); // the user deleted the hidden folder
    await markAllDirty(phone);
    const r = ok(await syncOnce(phone, drive));
    assert.equal(r.pushed, 1);
    const fresh = await newPhone('repair2');
    ok(await syncOnce(fresh, drive));
    assert.equal(await countOf(fresh, 'vocab_words'), 1, 'restored from what the phone still had');
  });
});
