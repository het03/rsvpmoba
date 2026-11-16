import { getDb } from '@/db';
import { getDriveStore } from '@/lib/syncDrive';
import { getSyncStatus } from '@/lib/syncEngine';
import { loadSyncPrefs, nextTimerDelay } from '@/lib/syncPrefs';
import { runSync } from '@/lib/syncRunner';
import { useEffect } from 'react';
import { AppState } from 'react-native';

/**
 * Starts syncs at the moments the app can act on: when it opens or comes back to the front, when it goes to the background,
 * and on a timer while it is open. Whether each one actually runs is decided by runSync (sync off, no Google connection, the
 * user's choices, and a minimum gap), so this is safe to leave on. Call once, near the root, after the database is ready.
 */
export function useSyncTriggers(ready: boolean): void {
  useEffect(() => {
    if (!ready) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const run = (trigger: 'open' | 'background' | 'timer') =>
      getDb().then(db => runSync(trigger, { db, getDrive: getDriveStore })).catch(() => {});

    const schedule = async () => {
      if (timer) clearTimeout(timer);
      timer = null;
      try {
        const [prefs, status] = [await loadSyncPrefs(), await getSyncStatus(await getDb())];
        const delay = nextTimerDelay(prefs, status.lastSyncAt, Date.now());
        if (stopped || delay === null) return;
        timer = setTimeout(() => { run('timer').finally(schedule); }, delay);
      } catch {
        // No timer this time; the other triggers still work.
      }
    };

    run('open').finally(schedule);
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') run('open').finally(schedule);
      else if (state === 'background') run('background');
    });
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      sub.remove();
    };
  }, [ready]);
}
