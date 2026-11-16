// Whether a sync runs for a given reason, and that it never runs when it should not.
import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { DEFAULT_SYNC_PREFS } from '../../src/lib/syncPrefs.ts';
import { resetRunner, runSync } from '../../src/lib/syncRunner.ts';
import { getSyncStatus } from '../../src/lib/syncEngine.ts';
import { getDriveStore, isDriveConnected } from '../../src/lib/syncDrive.ts';
import { pendingCount } from '../../src/lib/syncOutbox.ts';
import { readSource } from '../helpers/source.mjs';
import { addWord, fakeDrive, newPhone } from '../helpers/syncWorld.mjs';

const NOW = 1_800_000_000_000;
const prefsWith = (change) => async () => ({ ...DEFAULT_SYNC_PREFS, ...change });

beforeEach(() => resetRunner());

describe('runSync', () => {
  test('does nothing when sync is off, and does not even ask for the Google connection', async () => {
    const phone = await newPhone('r-off', { sync: false });
    let asked = false;
    const out = await runSync('open', { db: phone, getDrive: async () => { asked = true; return fakeDrive(); }, now: NOW });
    assert.deepEqual(out, { ran: false, reason: 'off' });
    assert.equal(asked, false);
  });

  test('with sync on but no Google connection, nothing runs and the queue is untouched', async () => {
    const phone = await newPhone('r-nc');
    await addWord(phone, 'a', 'b');
    const before = await pendingCount(phone);
    const out = await runSync('manual', { db: phone, getDrive: async () => null, now: NOW });
    assert.deepEqual(out, { ran: false, reason: 'not-connected' });
    assert.equal(await pendingCount(phone), before);
  });

  test('runs a real sync for each reason when the user\'s choices allow it', async () => {
    for (const trigger of ['open', 'background', 'timer', 'manual']) {
      resetRunner();
      const drive = fakeDrive();
      const phone = await newPhone(`r-${trigger}`);
      await addWord(phone, 'w', trigger);
      const out = await runSync(trigger, { db: phone, getDrive: async () => drive, loadPrefs: prefsWith({ everyHours: 1 }), now: NOW });
      assert.equal(out.ran, true, trigger);
      assert.equal(out.result.ok, true, trigger);
      assert.equal(drive.files.size, 1, trigger);
      assert.equal((await getSyncStatus(phone)).lastSyncAt, NOW);
    }
  });

  test('a reason the user switched off does not run, but "Sync now" still does', async () => {
    const drive = fakeDrive();
    const phone = await newPhone('r-choices');
    await addWord(phone, 'w', 'c');
    const prefs = prefsWith({ onOpen: false, onBackground: false, everyHours: 0 });
    for (const trigger of ['open', 'background', 'timer']) {
      assert.deepEqual(await runSync(trigger, { db: phone, getDrive: async () => drive, loadPrefs: prefs, now: NOW }), { ran: false, reason: 'not-due' }, trigger);
    }
    assert.equal(drive.files.size, 0);
    const manual = await runSync('manual', { db: phone, getDrive: async () => drive, loadPrefs: prefs, now: NOW });
    assert.equal(manual.ran, true);
    assert.equal(drive.files.size, 1);
  });

  test('opening and leaving the app in quick succession syncs once, not twice', async () => {
    const drive = fakeDrive();
    const phone = await newPhone('r-gap');
    await addWord(phone, 'w', 'c');
    const first = await runSync('open', { db: phone, getDrive: async () => drive, now: NOW });
    const second = await runSync('background', { db: phone, getDrive: async () => drive, now: NOW + 5_000 });
    assert.equal(first.ran, true);
    assert.deepEqual(second, { ran: false, reason: 'not-due' });
    const later = await runSync('background', { db: phone, getDrive: async () => drive, now: NOW + 40_000 });
    assert.equal(later.ran, true);
  });

  test('being offline is not retried in a tight loop: a failed attempt also counts for the gap', async () => {
    const drive = fakeDrive();
    drive.offline = true;
    const phone = await newPhone('r-off-gap');
    const first = await runSync('open', { db: phone, getDrive: async () => drive, now: NOW });
    assert.equal(first.ran, true);
    assert.equal(first.result.ok, false);
    const again = await runSync('open', { db: phone, getDrive: async () => drive, now: NOW + 1_000 });
    assert.deepEqual(again, { ran: false, reason: 'not-due' });
  });

  test('the timer waits for the chosen hours after the last good sync', async () => {
    const drive = fakeDrive();
    const phone = await newPhone('r-timer');
    await runSync('manual', { db: phone, getDrive: async () => drive, now: NOW });
    const soon = await runSync('timer', { db: phone, getDrive: async () => drive, loadPrefs: prefsWith({ everyHours: 3 }), now: NOW + 3_600_000 });
    assert.deepEqual(soon, { ran: false, reason: 'not-due' });
    const due = await runSync('timer', { db: phone, getDrive: async () => drive, loadPrefs: prefsWith({ everyHours: 3 }), now: NOW + 3 * 3_600_000 });
    assert.equal(due.ran, true);
  });

  test('never throws, even if the Google connection or the settings fail', async () => {
    const phone = await newPhone('r-throw');
    const a = await runSync('manual', { db: phone, getDrive: async () => { throw new Error('token expired'); }, now: NOW });
    assert.equal(a.ran, true);
    assert.equal(a.result.ok, false);
    assert.match(a.result.error, /token expired/);
    const b = await runSync('manual', { db: phone, getDrive: async () => fakeDrive(), loadPrefs: async () => { throw new Error('storage gone'); }, now: NOW });
    assert.equal(b.ran, true);
    assert.equal(b.result.ok, false);
  });
});

describe('the Google connection', () => {
  test('is honestly "not connected" until sign-in is built: no Drive call can be made', async () => {
    assert.equal(await getDriveStore(), null);
    assert.equal(await isDriveConnected(), false);
  });
});

describe('wiring', () => {
  test('the root layout starts the sync triggers once the database is ready, before its early returns', () => {
    const layout = readSource('src/app/_layout.tsx');
    assert.ok(layout.includes("import { useSyncTriggers } from '@/lib/useSyncTriggers'"));
    assert.ok(layout.includes('useSyncTriggers(dbReady);'));
    assert.ok(layout.indexOf('useSyncTriggers(dbReady);') < layout.indexOf('return null;'), 'a hook must not come after an early return');
  });

  test('the triggers cover open, coming back to the front, leaving, and a timer, and clean up after themselves', () => {
    const src = readSource('src/lib/useSyncTriggers.ts');
    for (const needle of ["run('open')", "run('background')", "run('timer')", "state === 'active'", "state === 'background'", 'sub.remove()', 'clearTimeout(timer)']) {
      assert.ok(src.includes(needle), needle);
    }
    assert.ok(!src.includes('expo-background-task'), 'no background-task package is needed');
  });

  test('Settings has the Backup & sync card with every control, and none of them can be used without a connection', () => {
    const s = readSource('src/app/settings.tsx');
    for (const needle of [
      'Card label="Backup & sync"', 'title="Back up and sync"', 'title="Sync when I open the app"', 'title="Sync when I leave the app"',
      'Also sync while the app is open', 'title="Sync now"', 'EVERY_HOURS_CHOICES.map', 'disabled={!connected}', 'disabled={!sync.enabled || !connected || syncing}',
    ]) assert.ok(s.includes(needle), needle);
  });

  test('turning sync on in Settings uses the real queue functions and starts a sync', () => {
    const s = readSource('src/app/settings.tsx');
    assert.ok(s.includes('await enableSync(db)') && s.includes('await disableSync(db)'));
    assert.ok(s.includes("runSync('manual'"));
  });
});
