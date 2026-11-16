import AsyncStorage from '@react-native-async-storage/async-storage';
import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import {
  DEFAULT_SYNC_PREFS, EVERY_HOURS_CHOICES, everyLabel, formatAgo, loadSyncPrefs, MIN_GAP_MS, nextTimerDelay, parseSyncPrefs, saveSyncPrefs, shouldSync, SYNC_PREFS_KEY,
} from '../../src/lib/syncPrefs.ts';

const HOUR = 3_600_000;
const NOW = 1_800_000_000_000;
const base = { prefs: DEFAULT_SYNC_PREFS, lastSyncAt: null, lastAttemptAt: null, now: NOW };

describe('parseSyncPrefs', () => {
  test('nothing saved gives the defaults: on open, on leaving, every 6 hours', () => {
    assert.deepEqual(parseSyncPrefs(null), { onOpen: true, onBackground: true, everyHours: 6 });
  });

  test('saved choices come back', () => {
    const saved = { onOpen: false, onBackground: true, everyHours: 12 };
    assert.deepEqual(parseSyncPrefs(JSON.stringify(saved)), saved);
  });

  test('a choice of the wrong kind falls back on its own, without spoiling the others', () => {
    assert.deepEqual(parseSyncPrefs('{"onOpen":"yes","onBackground":false,"everyHours":5}'), { onOpen: true, onBackground: false, everyHours: 6 });
    assert.equal(parseSyncPrefs('{"everyHours":9999}').everyHours, 6);
    assert.equal(parseSyncPrefs('{"everyHours":-1}').everyHours, 6);
  });

  test('damaged data is the defaults, not a crash', () => {
    for (const bad of ['', '{not json', 'null', '[]', '"x"', '42']) assert.deepEqual(parseSyncPrefs(bad), DEFAULT_SYNC_PREFS, bad);
  });

  test('every offered timer choice is accepted, and Off is among them', () => {
    for (const h of EVERY_HOURS_CHOICES) assert.equal(parseSyncPrefs(JSON.stringify({ everyHours: h })).everyHours, h);
    assert.ok(EVERY_HOURS_CHOICES.includes(0));
  });
});

describe('shouldSync', () => {
  test('"Sync now" always runs, even right after another sync and with everything switched off', () => {
    const off = { onOpen: false, onBackground: false, everyHours: 0 };
    assert.equal(shouldSync({ ...base, prefs: off, trigger: 'manual', lastAttemptAt: NOW - 1 }), true);
  });

  test('opening the app and leaving it follow their switches', () => {
    assert.equal(shouldSync({ ...base, trigger: 'open' }), true);
    assert.equal(shouldSync({ ...base, trigger: 'open', prefs: { ...base.prefs, onOpen: false } }), false);
    assert.equal(shouldSync({ ...base, trigger: 'background' }), true);
    assert.equal(shouldSync({ ...base, trigger: 'background', prefs: { ...base.prefs, onBackground: false } }), false);
  });

  test('the timer waits until the chosen hours have passed since the last good sync', () => {
    const prefs = { ...base.prefs, everyHours: 3 };
    assert.equal(shouldSync({ ...base, prefs, trigger: 'timer', lastSyncAt: NOW - 2 * HOUR }), false);
    assert.equal(shouldSync({ ...base, prefs, trigger: 'timer', lastSyncAt: NOW - 3 * HOUR }), true);
    assert.equal(shouldSync({ ...base, prefs, trigger: 'timer', lastSyncAt: NOW - 30 * HOUR }), true);
    assert.equal(shouldSync({ ...base, prefs, trigger: 'timer', lastSyncAt: null }), true, 'never synced yet');
  });

  test('the timer is off when set to Off', () => {
    assert.equal(shouldSync({ ...base, prefs: { ...base.prefs, everyHours: 0 }, trigger: 'timer', lastSyncAt: null }), false);
  });

  test('automatic syncs are never closer together than the minimum gap, whatever the reason', () => {
    for (const trigger of ['open', 'background', 'timer']) {
      assert.equal(shouldSync({ ...base, trigger, lastAttemptAt: NOW - (MIN_GAP_MS - 1) }), false, `${trigger} too soon`);
      assert.equal(shouldSync({ ...base, trigger, lastAttemptAt: NOW - MIN_GAP_MS }), true, `${trigger} after the gap`);
    }
  });
});

describe('nextTimerDelay', () => {
  test('null when the timer is off', () => {
    assert.equal(nextTimerDelay({ ...DEFAULT_SYNC_PREFS, everyHours: 0 }, null, NOW), null);
  });

  test('the time left until the next sync is due', () => {
    assert.equal(nextTimerDelay({ ...DEFAULT_SYNC_PREFS, everyHours: 6 }, NOW - 2 * HOUR, NOW), 4 * HOUR);
  });

  test('never less than a minute, so an overdue or never-synced app does not spin', () => {
    assert.equal(nextTimerDelay({ ...DEFAULT_SYNC_PREFS, everyHours: 1 }, NOW - 10 * HOUR, NOW), 60_000);
    assert.equal(nextTimerDelay({ ...DEFAULT_SYNC_PREFS, everyHours: 1 }, null, NOW), 60_000);
  });
});

describe('wording', () => {
  test('formatAgo', () => {
    assert.equal(formatAgo(null, NOW), 'never');
    assert.equal(formatAgo(NOW - 5_000, NOW), 'just now');
    assert.equal(formatAgo(NOW + 5_000, NOW), 'just now', 'a clock slightly ahead is not a negative time');
    assert.equal(formatAgo(NOW - 60_000, NOW), '1 minute ago');
    assert.equal(formatAgo(NOW - 5 * 60_000, NOW), '5 minutes ago');
    assert.equal(formatAgo(NOW - HOUR, NOW), '1 hour ago');
    assert.equal(formatAgo(NOW - 3 * HOUR, NOW), '3 hours ago');
    assert.equal(formatAgo(NOW - 24 * HOUR, NOW), '1 day ago');
    assert.equal(formatAgo(NOW - 72 * HOUR, NOW), '3 days ago');
  });

  test('everyLabel', () => {
    assert.equal(everyLabel(0), 'Off');
    assert.equal(everyLabel(1), 'Every hour');
    assert.equal(everyLabel(6), 'Every 6 hours');
  });
});

describe('saving', () => {
  beforeEach(() => AsyncStorage.clear());

  test('saved choices are remembered', async () => {
    assert.deepEqual(await loadSyncPrefs(), DEFAULT_SYNC_PREFS);
    await saveSyncPrefs({ onOpen: false, onBackground: false, everyHours: 24 });
    assert.deepEqual(await loadSyncPrefs(), { onOpen: false, onBackground: false, everyHours: 24 });
  });

  test('damaged saved data is the defaults', async () => {
    await AsyncStorage.setItem(SYNC_PREFS_KEY, '{oops');
    assert.deepEqual(await loadSyncPrefs(), DEFAULT_SYNC_PREFS);
  });
});
