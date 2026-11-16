// When the app should sync, as the user chose in Settings. Pure rules plus saving, so they can be tested without a phone.
// A phone cannot promise a clock time for background work, so the choices are the moments the app can act on itself:
// when it opens, when it goes to the background, and every few hours while it is open. "Sync now" is always there.
import AsyncStorage from '@react-native-async-storage/async-storage';

export type SyncTrigger = 'open' | 'background' | 'timer' | 'manual';

export type SyncPrefs = {
  /** Sync when the app opens (and comes back to the front). */
  onOpen: boolean;
  /** Sync when the app goes to the background: a small, best-effort upload, since the phone may stop the app straight after. */
  onBackground: boolean;
  /** Also sync this often while the app is open. 0 is off. */
  everyHours: number;
};

export const SYNC_PREFS_KEY = 'syncPrefs';
export const DEFAULT_SYNC_PREFS: SyncPrefs = { onOpen: true, onBackground: true, everyHours: 6 };
export const EVERY_HOURS_CHOICES = [0, 1, 3, 6, 12, 24];

/** Automatic syncs are never closer together than this, so opening and closing the app quickly (or being offline) cannot hammer Drive. */
export const MIN_GAP_MS = 30_000;
const HOUR_MS = 3_600_000;

/** Reads saved choices. Anything missing or of the wrong kind falls back to the default for that choice. */
export function parseSyncPrefs(raw: string | null): SyncPrefs {
  try {
    const d = raw ? JSON.parse(raw) : {};
    const obj = d && typeof d === 'object' && !Array.isArray(d) ? d : {};
    return {
      onOpen: typeof obj.onOpen === 'boolean' ? obj.onOpen : DEFAULT_SYNC_PREFS.onOpen,
      onBackground: typeof obj.onBackground === 'boolean' ? obj.onBackground : DEFAULT_SYNC_PREFS.onBackground,
      everyHours: EVERY_HOURS_CHOICES.includes(obj.everyHours) ? obj.everyHours : DEFAULT_SYNC_PREFS.everyHours,
    };
  } catch {
    return DEFAULT_SYNC_PREFS;
  }
}

export async function loadSyncPrefs(): Promise<SyncPrefs> {
  return parseSyncPrefs(await AsyncStorage.getItem(SYNC_PREFS_KEY).catch(() => null));
}

export async function saveSyncPrefs(prefs: SyncPrefs): Promise<void> {
  await AsyncStorage.setItem(SYNC_PREFS_KEY, JSON.stringify(prefs)).catch(() => {});
}

/**
 * Whether a sync should run now. "Sync now" always runs. The rest follow the user's choices, and none runs within MIN_GAP_MS
 * of the last attempt (successful or not). The timer one also waits until `everyHours` have passed since the last success.
 */
export function shouldSync(a: { prefs: SyncPrefs; trigger: SyncTrigger; lastSyncAt: number | null; lastAttemptAt: number | null; now: number }): boolean {
  if (a.trigger === 'manual') return true;
  if (a.lastAttemptAt !== null && a.now - a.lastAttemptAt < MIN_GAP_MS) return false;
  if (a.trigger === 'open') return a.prefs.onOpen;
  if (a.trigger === 'background') return a.prefs.onBackground;
  if (a.prefs.everyHours <= 0) return false;
  return a.lastSyncAt === null || a.now - a.lastSyncAt >= a.prefs.everyHours * HOUR_MS;
}

/** Milliseconds until the timer should next check, or null when the timer is off. At least a minute, so it never spins. */
export function nextTimerDelay(prefs: SyncPrefs, lastSyncAt: number | null, now: number): number | null {
  if (prefs.everyHours <= 0) return null;
  const due = lastSyncAt === null ? now : lastSyncAt + prefs.everyHours * HOUR_MS;
  return Math.max(60_000, due - now);
}

/** "just now", "5 minutes ago", "2 hours ago", "3 days ago"; "never" when it has not happened. */
export function formatAgo(at: number | null, now: number): string {
  if (at === null) return 'never';
  const s = Math.max(0, Math.floor((now - at) / 1000));
  if (s < 60) return 'just now';
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'} ago`;
  if (s < 3600) return unit(Math.floor(s / 60), 'minute');
  if (s < 86_400) return unit(Math.floor(s / 3600), 'hour');
  return unit(Math.floor(s / 86_400), 'day');
}

/** "Off", "Every hour", "Every 6 hours". */
export function everyLabel(hours: number): string {
  return hours <= 0 ? 'Off' : hours === 1 ? 'Every hour' : `Every ${hours} hours`;
}
