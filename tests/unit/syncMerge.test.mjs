import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { matchKey } from '../../src/lib/syncFormat.ts';
import { mergeRecords, newest, reconcileIdentity, remoteWins } from '../../src/lib/syncMerge.ts';

const rec = (id, updatedAt, data = { wi: 1 }, deleted = false, kind = 'position') => ({ kind, id, updatedAt, deleted, data: deleted ? {} : data });
const shuffle = (list, seed) => {
  const a = [...list];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) % 4294967296;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const snapshot = (map) => JSON.stringify([...map.entries()].sort(([x], [y]) => (x < y ? -1 : 1)));

describe('remoteWins', () => {
  test('a record this device does not have is taken', () => {
    assert.equal(remoteWins(null, rec('a', 1)), true);
  });

  test('the newer change wins, either way round', () => {
    assert.equal(remoteWins(rec('a', 1, { wi: 1 }), rec('a', 2, { wi: 2 })), true);
    assert.equal(remoteWins(rec('a', 2, { wi: 2 }), rec('a', 1, { wi: 1 })), false);
  });

  test('an identical record is not newer, so reading a file again changes nothing', () => {
    assert.equal(remoteWins(rec('a', 5, { wi: 9 }), rec('a', 5, { wi: 9 })), false);
    assert.equal(remoteWins(rec('a', 5, {}, true), rec('a', 5, {}, true)), false);
  });

  test('a deletion beats an edit made at the same moment, but a later edit beats the deletion', () => {
    assert.equal(remoteWins(rec('a', 5, { wi: 1 }), rec('a', 5, {}, true)), true);
    assert.equal(remoteWins(rec('a', 5, {}, true), rec('a', 5, { wi: 1 })), false);
    assert.equal(remoteWins(rec('a', 5, {}, true), rec('a', 6, { wi: 1 })), true, 'edited after it was deleted: it comes back');
    assert.equal(remoteWins(rec('a', 6, { wi: 1 }), rec('a', 5, {}, true)), false, 'deleted before the latest edit: stays');
  });

  test('an exact time tie with different data is settled the same way on every device', () => {
    const x = rec('a', 5, { wi: 1 });
    const y = rec('a', 5, { wi: 2 });
    assert.notEqual(remoteWins(x, y), remoteWins(y, x), 'exactly one of the two wins');
    assert.equal(newest(x, y), newest(y, x));
  });
});

describe('mergeRecords: the order never matters', () => {
  const versions = [
    rec('a', 1, { wi: 10 }), rec('a', 3, { wi: 30 }), rec('a', 2, { wi: 20 }),
    rec('b', 4, { wi: 5 }), rec('b', 4, {}, true), rec('b', 3, { wi: 4 }),
    rec('c', 7, { wi: 7 }), rec('c', 7, { wi: 8 }), rec('c', 9, {}, true), rec('c', 8, { wi: 1 }),
    rec('d', 2, { wi: 2 }),
  ];

  test('picks the winner of each record', () => {
    const m = mergeRecords(versions);
    assert.equal(m.get('position:a').data.wi, 30);
    assert.equal(m.get('position:b').deleted, true);
    assert.equal(m.get('position:c').deleted, true);
    assert.equal(m.get('position:d').data.wi, 2);
    assert.equal(m.size, 4);
  });

  test('50 different orders give exactly the same result', () => {
    const expected = snapshot(mergeRecords(versions));
    for (let seed = 1; seed <= 50; seed++) assert.equal(snapshot(mergeRecords(shuffle(versions, seed))), expected, `order ${seed}`);
  });

  test('merging twice, or merging a copy of everything again, changes nothing', () => {
    const once = mergeRecords(versions);
    const twice = mergeRecords([...once.values(), ...versions, ...versions]);
    assert.equal(snapshot(twice), snapshot(once));
  });

  test('merging in stages (a delta, then the snapshot that covers it) equals merging everything at once', () => {
    const half = Math.floor(versions.length / 2);
    const staged = mergeRecords([...mergeRecords(versions.slice(0, half)).values(), ...versions.slice(half)]);
    assert.equal(snapshot(staged), snapshot(mergeRecords(versions)));
  });

  test('two devices that each merge the other\'s records end up with identical data (convergence)', () => {
    const deviceA = [rec('a', 1, { wi: 1 }), rec('x', 5, { wi: 5 }), rec('z', 2, {}, true)];
    const deviceB = [rec('a', 2, { wi: 2 }), rec('y', 3, { wi: 3 }), rec('z', 1, { wi: 9 })];
    const a = mergeRecords([...deviceA, ...deviceB]);
    const b = mergeRecords([...deviceB, ...deviceA]);
    assert.equal(snapshot(a), snapshot(b));
    assert.equal(a.get('position:z').deleted, true, 'the later deletion wins');
  });

  test('random records in random orders always converge (200 trials)', () => {
    let s = 7;
    const next = (n) => { s = (s * 1664525 + 1013904223) % 4294967296; return s % n; };
    for (let trial = 0; trial < 200; trial++) {
      const list = Array.from({ length: 12 }, () => rec(`r${next(4)}`, next(5), { wi: next(3) }, next(4) === 0));
      const expected = snapshot(mergeRecords(list));
      assert.equal(snapshot(mergeRecords(shuffle(list, trial + 1))), expected, `trial ${trial}`);
    }
  });

  test('records of different kinds with the same id are different records', () => {
    const m = mergeRecords([rec('x', 1, { wi: 1 }), rec('x', 1, { v: 'a' }, false, 'setting')]);
    assert.equal(m.size, 2);
  });
});

describe('reconcileIdentity: the same book or word added on two devices', () => {
  const BOOK = { t: 'Das Haus', a: '', f: 'epub', sz: 100, tw: 1, da: 1 };
  const book = (id, data = BOOK) => ({ kind: 'book', id, updatedAt: 1, deleted: false, data });
  const local = (id, data = BOOK) => new Map([[matchKey(book(id, data)), id]]);

  test('no match means nothing to reconcile', () => {
    assert.deepEqual(reconcileIdentity(new Map(), book('b'.repeat(8))), { action: 'none' });
    assert.deepEqual(reconcileIdentity(local('a'.repeat(8)), book('b'.repeat(8), { ...BOOK, t: 'Other' })), { action: 'none' });
  });

  test('the same id is the same record', () => {
    assert.deepEqual(reconcileIdentity(local('a'.repeat(8)), book('a'.repeat(8))), { action: 'none' });
  });

  test('the lower id wins: this device adopts a lower remote id', () => {
    assert.deepEqual(reconcileIdentity(local('f'.repeat(8)), book('1'.repeat(8))), { action: 'adopt', from: 'f'.repeat(8), to: '1'.repeat(8) });
  });

  test('a higher remote id is left alone: this device keeps its own, and the other device will adopt it', () => {
    assert.deepEqual(reconcileIdentity(local('1'.repeat(8)), book('f'.repeat(8))), { action: 'keep' });
  });

  test('both devices end on the same id: one adopts, the other keeps (the rule is symmetric)', () => {
    const lo = '1'.repeat(8);
    const hi = 'f'.repeat(8);
    assert.equal(reconcileIdentity(local(hi), book(lo)).action, 'adopt');
    assert.equal(reconcileIdentity(local(lo), book(hi)).action, 'keep');
  });

  test('works for saved words too, and ignores positions, sessions and settings', () => {
    const vocab = (id) => ({ kind: 'vocab', id, updatedAt: 1, deleted: false, data: { w: 'haus', df: 'house', c: 'Das Haus.', b: null, bt: '', sa: 1, nr: 1, iv: 1, ez: 2.5 } });
    const map = new Map([[matchKey(vocab('f'.repeat(8))), 'f'.repeat(8)]]);
    assert.equal(reconcileIdentity(map, vocab('1'.repeat(8))).action, 'adopt');
    assert.equal(reconcileIdentity(map, rec('x', 1)).action, 'none');
  });
});
