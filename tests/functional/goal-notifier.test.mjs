// The daily-goal notification path (goalNotifier): storage, permission, and when a notification does and doesn't fire.
import AsyncStorage from '@react-native-async-storage/async-storage';
import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { getDb, initDb } from '../../src/db/index.ts';
import { GOAL_FIRED_KEY, GOAL_KEY } from '../../src/lib/dailyGoal.ts';
import { checkDailyGoal, loadGoal, requestGoalPermission, saveGoal } from '../../src/lib/goalNotifier.ts';
import { dateKey } from '../../src/lib/stats.ts';
import * as notifications from '../shims/expo-notifications.mjs';

const NOW = new Date(2026, 10, 12, 15, 0).getTime();
const scheduled = () => notifications.state.calls.filter((c) => c[0] === 'schedule');

async function addSession(words, start = NOW - 60_000) {
  const db = await getDb();
  await db.runAsync("INSERT INTO sessions (book_id, start_time, end_time, words_read, avg_wpm, mode) VALUES (1, ?, ?, ?, 300, 'rsvp')", [start, start + 60_000, words]);
}

beforeEach(async () => {
  await initDb();
  await (await getDb()).runAsync('DELETE FROM sessions');
  await AsyncStorage.clear();
  notifications.reset();
});

describe('goal storage', () => {
  test('a saved goal comes back; nothing saved, or garbage, means no goal', async () => {
    assert.equal(await loadGoal(), 0);
    await saveGoal(1500);
    assert.equal(await loadGoal(), 1500);
    await AsyncStorage.setItem(GOAL_KEY, 'lots');
    assert.equal(await loadGoal(), 0);
  });
});

describe('requestGoalPermission', () => {
  test('already granted: true, with no prompt', async () => {
    assert.equal(await requestGoalPermission(), true);
    assert.ok(!notifications.state.calls.some((c) => c[0] === 'requestPermissions'));
  });

  test('undetermined: prompts, and returns the answer', async () => {
    notifications.state.permission = { granted: false, canAskAgain: true };
    notifications.state.requestResult = { granted: true };
    assert.equal(await requestGoalPermission(), true);
    notifications.reset();
    notifications.state.permission = { granted: false, canAskAgain: true };
    notifications.state.requestResult = { granted: false };
    assert.equal(await requestGoalPermission(), false);
  });

  test('blocked for good (cannot ask again): false without prompting, so Settings can offer the system settings', async () => {
    notifications.state.permission = { granted: false, canAskAgain: false };
    assert.equal(await requestGoalPermission(), false);
    assert.ok(!notifications.state.calls.some((c) => c[0] === 'requestPermissions'));
  });

  test('creates the Android channel first (Android 13+ will not prompt without one)', async () => {
    await requestGoalPermission();
    const order = notifications.state.calls.map((c) => c[0]);
    assert.ok(order.indexOf('channel') >= 0 && order.indexOf('channel') < order.indexOf('getPermissions'));
  });

  test('a failure inside the notifications library is false, not a crash', async () => {
    notifications.state.throwOn = 'getPermissions';
    assert.equal(await requestGoalPermission(), false);
  });
});

describe('checkDailyGoal', () => {
  test('fires once when the session carries today across the goal, with the goal in the message', async () => {
    await saveGoal(1000);
    await addSession(1200);
    await checkDailyGoal(400, NOW);
    const [call] = scheduled();
    assert.ok(call);
    assert.match(call[1].content.body, /1,000/);
    assert.deepEqual(call[1].trigger, { channelId: 'goal' });
    assert.equal(await AsyncStorage.getItem(GOAL_FIRED_KEY), dateKey(NOW));
  });

  test('sets a notification handler first, so a banner shows while the app is open', async () => {
    await saveGoal(1000);
    await addSession(1200);
    await checkDailyGoal(400, NOW);
    const order = notifications.state.calls.map((c) => c[0]);
    assert.ok(order.indexOf('handler') >= 0 && order.indexOf('handler') < order.indexOf('schedule'));
    const handler = notifications.state.calls.find((c) => c[0] === 'handler')[1];
    assert.deepEqual(await handler.handleNotification(), { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false });
  });

  test('only once a day: a second session the same day does not fire again', async () => {
    await saveGoal(1000);
    await addSession(1200);
    await checkDailyGoal(400, NOW);
    await addSession(300);
    await checkDailyGoal(300, NOW + 600_000);
    assert.equal(scheduled().length, 1);
  });

  test('fires again the next day', async () => {
    await saveGoal(1000);
    await addSession(1200);
    await checkDailyGoal(400, NOW);
    const tomorrow = NOW + 86_400_000;
    await addSession(1200, tomorrow - 60_000);
    await checkDailyGoal(1200, tomorrow);
    assert.equal(scheduled().length, 2);
  });

  test('does not fire below the goal, or with no goal, or when the goal was already met before this session', async () => {
    await saveGoal(1000);
    await addSession(900);
    await checkDailyGoal(900, NOW);
    assert.equal(scheduled().length, 0);

    await AsyncStorage.clear();
    await addSession(5000);
    await checkDailyGoal(5000, NOW); // no goal saved
    assert.equal(scheduled().length, 0);

    await saveGoal(1000);
    await checkDailyGoal(200, NOW); // 5,000 today, only 200 from this session: already met earlier
    assert.equal(scheduled().length, 0);
  });

  test('a session that read nothing is ignored', async () => {
    await saveGoal(1000);
    await addSession(2000);
    await checkDailyGoal(0, NOW);
    assert.equal(scheduled().length, 0);
  });

  test('without notification permission nothing fires and it is not marked as fired, so it can fire after the user allows it', async () => {
    await saveGoal(1000);
    await addSession(1200);
    notifications.state.permission = { granted: false, canAskAgain: false };
    await checkDailyGoal(400, NOW);
    assert.equal(scheduled().length, 0);
    assert.equal(await AsyncStorage.getItem(GOAL_FIRED_KEY), null);
  });

  test('a notification error never escapes (it must not break closing a reading session) and is not marked as fired', async () => {
    await saveGoal(1000);
    await addSession(1200);
    notifications.state.throwOn = 'schedule';
    await assert.doesNotReject(checkDailyGoal(400, NOW));
    assert.equal(await AsyncStorage.getItem(GOAL_FIRED_KEY), null);
  });

  test('sessions from before today do not count towards today', async () => {
    await saveGoal(1000);
    await addSession(5000, NOW - 2 * 86_400_000);
    await addSession(300);
    await checkDailyGoal(300, NOW);
    assert.equal(scheduled().length, 0);
  });
});
