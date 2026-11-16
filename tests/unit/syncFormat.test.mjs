import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  deltaName, encodeDelta, encodeSnapshot, FIELDS, MAX_FILE_CHARS, MAX_RECORDS_PER_FILE, matchKey, parseFile, parseFileName, parseRecord, snapshotName, toWire,
} from '../../src/lib/syncFormat.ts';

const DEVICE = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const BOOK = { t: 'Das Haus', a: 'Autor', f: 'epub', sz: 12345, tw: 80000, da: 1_700_000_000_000 };
const SESSION = { b: 'abcdef0123456789', s: 1000, e: 2000, w: 300, p: 280.5, m: 'rsvp' };
const VOCAB = { w: 'haus', df: 'house', c: 'Das Haus.', b: null, bt: 'Das Haus', sa: 5, nr: 6, iv: 1, ez: 2.5 };
const rec = (kind, id, data, updatedAt = 1000, deleted = false) => ({ kind, id, updatedAt, deleted, data: deleted ? {} : data });

describe('records', () => {
  test('every kind round-trips through the wire form', () => {
    const samples = [
      rec('book', 'b'.repeat(32), BOOK),
      rec('position', 'b'.repeat(32), { wi: 4242 }),
      rec('session', 's'.repeat(32), SESSION),
      rec('vocab', 'v'.repeat(32), VOCAB),
      rec('setting', 'dailyGoal', { v: '1500' }),
    ];
    for (const r of samples) assert.deepEqual(parseRecord(JSON.parse(JSON.stringify(toWire(r)))), r, r.kind);
  });

  test('a deletion carries no data', () => {
    const wire = toWire(rec('book', 'b'.repeat(32), BOOK, 77, true));
    assert.deepEqual(wire, { k: 'book', id: 'b'.repeat(32), u: 77, x: 1 });
    assert.deepEqual(parseRecord(wire), { kind: 'book', id: 'b'.repeat(32), updatedAt: 77, deleted: true, data: {} });
  });

  test('fields that are not part of the format are dropped, so a newer app can add fields safely', () => {
    const r = parseRecord({ k: 'position', id: 'abc', u: 5, d: { wi: 10, extra: 'x', coverData: 'data:image/png;base64,AAAA' } });
    assert.deepEqual(r.data, { wi: 10 });
  });

  test('cover images and file paths are not in the format at all', () => {
    for (const fields of Object.values(FIELDS)) {
      for (const name of Object.keys(fields)) assert.ok(!/cover|path|file_path/i.test(name), name);
    }
  });

  test('optional fields may be missing or null', () => {
    const r = parseRecord({ k: 'session', id: 'abc', u: 5, d: { s: 1, w: 2, p: 3, m: 'rsvp' } });
    assert.equal(r.data.b, null);
    assert.equal(r.data.e, null);
  });

  test('anything unusable is rejected, never half-accepted', () => {
    const good = { k: 'position', id: 'abc', u: 5, d: { wi: 1 } };
    assert.ok(parseRecord(good));
    const bad = [
      null, undefined, 'x', 7, [], {}, { ...good, k: 'nonsense' }, { ...good, k: 5 }, { ...good, id: '' }, { ...good, id: 5 },
      { ...good, id: 'a'.repeat(65) }, { ...good, id: 'has space' }, { ...good, id: '../../etc' }, { ...good, u: 'now' }, { ...good, u: -1 },
      { ...good, u: NaN }, { ...good, u: Infinity }, { ...good, d: null }, { ...good, d: [] }, { ...good, d: {} }, { ...good, d: { wi: '5' } },
      { ...good, d: { wi: NaN } }, { k: 'book', id: 'abc', u: 1, d: { ...BOOK, t: 5 } }, { k: 'book', id: 'abc', u: 1, d: { ...BOOK, sz: null } },
      { k: 'vocab', id: 'abc', u: 1, d: { ...VOCAB, w: 'x'.repeat(20_001) } },
    ];
    for (const b of bad) assert.equal(parseRecord(b), null, JSON.stringify(b)?.slice(0, 80));
  });

  test('hostile ids and text cannot become anything but plain values', () => {
    const r = parseRecord({ k: 'vocab', id: 'abc', u: 1, d: { ...VOCAB, w: '<script>alert(1)</script>', df: "'; DROP TABLE books;--" } });
    assert.equal(r.data.w, '<script>alert(1)</script>');
    assert.equal(r.data.df, "'; DROP TABLE books;--");
    assert.equal(parseRecord({ k: 'position', id: '__proto__', u: 1, d: { wi: 1 } }).id, '__proto__');
    assert.equal(Object.keys({}).length, 0, 'the prototype was not polluted');
  });
});

describe('files', () => {
  const records = [rec('book', 'b'.repeat(32), BOOK), rec('position', 'b'.repeat(32), { wi: 9 })];

  test('a delta round-trips', () => {
    const f = parseFile(encodeDelta(DEVICE, 3, 9000, records));
    assert.deepEqual({ ...f }, { type: 'delta', device: DEVICE, seq: 3, at: 9000, records, skipped: 0 });
  });

  test('a snapshot round-trips', () => {
    const f = parseFile(encodeSnapshot(DEVICE, 12, 9000, records));
    assert.deepEqual({ ...f }, { type: 'snapshot', device: DEVICE, covers: 12, at: 9000, records, skipped: 0 });
  });

  test('bad records inside a good file are skipped and counted, and the good ones still load', () => {
    const text = JSON.stringify({ v: 1, type: 'delta', device: DEVICE, seq: 1, at: 1, records: [toWire(records[0]), { nonsense: true }, 5, null, toWire(records[1])] });
    const f = parseFile(text);
    assert.equal(f.records.length, 2);
    assert.equal(f.skipped, 3);
  });

  test('anything that is not one of our files is ignored, not an error', () => {
    const good = JSON.parse(encodeDelta(DEVICE, 1, 1, records));
    const bad = [
      '', 'not json', '{', 'null', '[]', '"x"', '42', '{}', JSON.stringify({ ...good, v: 2 }), JSON.stringify({ ...good, v: undefined }),
      JSON.stringify({ ...good, type: 'other' }), JSON.stringify({ ...good, device: 'NOT HEX' }), JSON.stringify({ ...good, device: '../x' }),
      JSON.stringify({ ...good, device: 'abc' }), JSON.stringify({ ...good, at: 'now' }), JSON.stringify({ ...good, records: 'x' }),
      JSON.stringify({ ...good, seq: 0 }), JSON.stringify({ ...good, seq: 1.5 }), JSON.stringify({ ...good, seq: '1' }),
      JSON.stringify({ ...good, type: 'snapshot', seq: undefined, covers: -1 }), undefined, 5, null,
    ];
    for (const b of bad) assert.equal(parseFile(b), null, String(b)?.slice(0, 60));
  });

  test('a file that is too big, or has too many records, is ignored without being loaded', () => {
    assert.equal(parseFile('x'.repeat(MAX_FILE_CHARS + 1)), null);
    const many = JSON.stringify({ v: 1, type: 'delta', device: DEVICE, seq: 1, at: 1, records: new Array(MAX_RECORDS_PER_FILE + 1).fill(0) });
    assert.equal(parseFile(many), null);
  });

  test('a file from a newer app version is ignored rather than misread', () => {
    assert.equal(parseFile(JSON.stringify({ ...JSON.parse(encodeDelta(DEVICE, 1, 1, [])), v: 99 })), null);
  });

  test('an empty delta and an empty snapshot are valid', () => {
    assert.equal(parseFile(encodeDelta(DEVICE, 1, 1, [])).records.length, 0);
    assert.equal(parseFile(encodeSnapshot(DEVICE, 0, 1, [])).records.length, 0);
  });

  test('realistic sizes: one session or one word is a tiny record', () => {
    const one = (r) => encodeDelta(DEVICE, 1, 1, [r]).length;
    assert.ok(one(rec('session', 's'.repeat(32), SESSION)) < 400);
    assert.ok(one(rec('vocab', 'v'.repeat(32), { ...VOCAB, c: 'x'.repeat(400), df: 'y'.repeat(200) })) < 1200);
  });
});

describe('file names', () => {
  test('names carry the kind, device and a padded number, and read back', () => {
    assert.equal(deltaName(DEVICE, 7), `delta-${DEVICE}-00000007.json`);
    assert.equal(snapshotName(DEVICE, 40), `snapshot-${DEVICE}-00000040.json`);
    assert.deepEqual(parseFileName(deltaName(DEVICE, 7)), { type: 'delta', device: DEVICE, n: 7 });
    assert.deepEqual(parseFileName(snapshotName(DEVICE, 40)), { type: 'snapshot', device: DEVICE, n: 40 });
  });

  test('names sort in number order, so files read oldest first', () => {
    const names = [10, 2, 33, 1].map((n) => deltaName(DEVICE, n)).sort();
    assert.deepEqual(names.map((n) => parseFileName(n).n), [1, 2, 10, 33]);
  });

  test('names that are not ours are rejected', () => {
    for (const bad of ['', 'delta.json', `delta-${DEVICE}-7.json`, `other-${DEVICE}-00000007.json`, `delta-XYZ-00000007.json`, `delta-${DEVICE}-00000007.json.bak`, `../delta-${DEVICE}-00000007.json`]) {
      assert.equal(parseFileName(bad), null, bad);
    }
  });
});

describe('matchKey', () => {
  test('the same book on two phones matches, whatever the case and spacing of the title', () => {
    const a = matchKey(rec('book', 'a', { ...BOOK, t: 'Das  Haus ' }));
    const b = matchKey(rec('book', 'b', { ...BOOK, t: 'das haus' }));
    assert.equal(a, b);
  });

  test('a different title or a different file size is a different book', () => {
    const base = matchKey(rec('book', 'a', BOOK));
    assert.notEqual(base, matchKey(rec('book', 'a', { ...BOOK, t: 'Other' })));
    assert.notEqual(base, matchKey(rec('book', 'a', { ...BOOK, sz: BOOK.sz + 1 })));
  });

  test('accented titles match however they were typed (composed or decomposed)', () => {
    assert.equal(matchKey(rec('book', 'a', { ...BOOK, t: 'Café' })), matchKey(rec('book', 'b', { ...BOOK, t: 'Café' })));
  });

  test('the same word from the same sentence matches; a different sentence does not', () => {
    assert.equal(matchKey(rec('vocab', 'a', VOCAB)), matchKey(rec('vocab', 'b', VOCAB)));
    assert.notEqual(matchKey(rec('vocab', 'a', VOCAB)), matchKey(rec('vocab', 'b', { ...VOCAB, c: 'Ein Haus.' })));
  });

  test('other kinds are identified by id alone', () => {
    for (const k of ['position', 'session', 'setting']) assert.equal(matchKey({ kind: k, data: {} }), null);
  });
});
