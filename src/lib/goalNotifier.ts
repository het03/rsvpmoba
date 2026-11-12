import { getDb } from '@/db';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { GOAL_FIRED_KEY, GOAL_KEY, parseGoal, shouldNotifyGoal } from '@/lib/dailyGoal';
import { dateKey, periodStarts } from '@/lib/stats';

const CHANNEL_ID = 'goal';
const supported = Platform.OS === 'ios' || Platform.OS === 'android';

export async function loadGoal(): Promise<number> {
  return parseGoal(await AsyncStorage.getItem(GOAL_KEY).catch(() => null));
}

export async function saveGoal(goal: number): Promise<void> {
  await AsyncStorage.setItem(GOAL_KEY, String(goal)).catch(() => {});
}

/** Asks for notification permission (and creates the Android channel, which Android 13+ needs before it will prompt). */
export async function requestGoalPermission(): Promise<boolean> {
  if (!supported) return false;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Daily goal',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) return true;
    if (!existing.canAskAgain) return false;
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/** Called once a session's words are saved. Fires the goal notification if this session carried today across the line. */
export async function checkDailyGoal(sessionWords: number, now: number = Date.now()): Promise<void> {
  if (!supported || sessionWords <= 0) { console.log(`[goal] skipped: platform ${Platform.OS}, session words ${sessionWords}`); return; }
  try {
    const goal = await loadGoal();
    if (goal === 0) { console.log('[goal] skipped: no goal set'); return; }

    const db = await getDb();
    const row = await db.getFirstAsync<{ n: number }>(
      'SELECT COALESCE(SUM(words_read), 0) AS n FROM sessions WHERE words_read > 0 AND start_time >= ?',
      [periodStarts(now).day],
    );
    const today = dateKey(now);
    const firedOn = await AsyncStorage.getItem(GOAL_FIRED_KEY);
    const todayWords = row?.n ?? 0;
    if (!shouldNotifyGoal({ goal, todayWords, sessionWords, firedOn, today })) {
      console.log(`[goal] skipped: goal ${goal}, today ${todayWords}, this session ${sessionWords}, already fired on ${firedOn}`);
      return;
    }

    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) { console.log('[goal] skipped: notification permission not granted'); return; }

    // Without a handler the OS drops notifications that arrive while the app is open, which is when this fires.
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Daily goal reached', body: `You've read ${goal.toLocaleString()} words today.` },
      trigger: Platform.OS === 'android' ? { channelId: CHANNEL_ID } : null,
    });
    await AsyncStorage.setItem(GOAL_FIRED_KEY, today);
    console.log(`[goal] notification triggered: ${row?.n ?? 0} words today, goal ${goal}`);
  } catch (e) {
    // A goal notification must never break closing out a reading session.
    console.warn('[goal] check failed:', e);
  }
}
