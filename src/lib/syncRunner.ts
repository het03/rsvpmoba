// Decides whether a sync should run for a given reason (the app opened, went to the background, a timer, or the user pressed
// "Sync now"), and runs it. Everything it needs is passed in, so it is tested without a phone. Never throws.
import type { SQLiteDatabase } from 'expo-sqlite';
import { loadSyncPrefs, shouldSync, type SyncPrefs, type SyncTrigger } from '@/lib/syncPrefs';
import { getSyncStatus, syncOnce, type DriveStore, type SettingsAdapter, type SyncResult } from '@/lib/syncEngine';

export type RunOutcome =
  | { ran: true; result: SyncResult }
  | { ran: false; reason: 'off' | 'not-connected' | 'not-due' };

export type RunDeps = {
  db: SQLiteDatabase;
  getDrive: () => Promise<DriveStore | null>;
  loadPrefs?: () => Promise<SyncPrefs>;
  settings?: SettingsAdapter;
  now?: number;
};

// The time of the last attempt this session (successful or not), used to keep automatic syncs from bunching up.
let lastAttemptAt: number | null = null;

/** For tests: forget the last attempt. */
export function resetRunner() {
  lastAttemptAt = null;
}

export async function runSync(trigger: SyncTrigger, deps: RunDeps): Promise<RunOutcome> {
  const now = deps.now ?? Date.now();
  try {
    const status = await getSyncStatus(deps.db);
    if (!status.enabled) return { ran: false, reason: 'off' };

    const prefs = await (deps.loadPrefs ?? loadSyncPrefs)();
    if (!shouldSync({ prefs, trigger, lastSyncAt: status.lastSyncAt, lastAttemptAt, now })) return { ran: false, reason: 'not-due' };

    const drive = await deps.getDrive();
    if (!drive) return { ran: false, reason: 'not-connected' };

    lastAttemptAt = now;
    return { ran: true, result: await syncOnce(deps.db, drive, { now, settings: deps.settings }) };
  } catch (e) {
    return { ran: true, result: { ok: false, stage: 'pull', error: e instanceof Error ? e.message : String(e) } };
  }
}
