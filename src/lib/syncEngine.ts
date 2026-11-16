// The sync engine: one pass pulls what other devices wrote, then pushes what this device changed. It talks to Drive only
// through the small `DriveStore` interface below, so it is tested against a fake that can go offline or fail on demand.
//
// Safety rules, each with a test:
//  - The full data always stays in the app's database. Only the queue (the outbox) is cleared, and only for changes whose
//    upload Drive confirmed. Any failure leaves the queue as it was, so the next pass simply sends it again.
//  - A device writes only files named with its own id, so two devices never write the same file.
//  - Everything read from Drive is untrusted: a file that is damaged, from another app version, or has the wrong name or
//    device is skipped, and one bad file never stops the others.
//  - Reading a record twice changes nothing, so re-reading after a crash is harmless.
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  deltaName, encodeDelta, encodeSnapshot, MAX_FILE_CHARS, parseFile, parseFileName, snapshotName, type SyncRecord,
} from '@/lib/syncFormat';
import { applyRecords, exportAll, exportEntry, resolveParked } from '@/lib/syncRecords';
import { clearOutbox, getDeviceId, isSyncEnabled, pendingCount, readOutbox } from '@/lib/syncOutbox';

/** What the engine needs from Google Drive's hidden app folder. Implemented for real later; faked in tests. */
export type DriveFile = { id: string; name: string };
export interface DriveStore {
  list(): Promise<DriveFile[]>;
  read(id: string): Promise<string>;
  create(name: string, content: string): Promise<DriveFile>;
  remove(id: string): Promise<void>;
}

/** Settings live outside the database, so a small adapter reads and writes them (see syncSettings). */
export interface SettingsAdapter {
  /** Settings changed since the last confirmed upload. */
  changed(): Promise<SyncRecord[]>;
  /** Every setting, for a snapshot. */
  all(): Promise<SyncRecord[]>;
  /** Called once Drive has confirmed an upload that contained these. */
  confirm(sent: SyncRecord[]): Promise<void>;
  /** Settings that arrived from another device. The adapter keeps whichever of its own and the arriving one is newer. */
  apply(records: SyncRecord[]): Promise<void>;
}

export type SyncOptions = {
  now?: number;
  settings?: SettingsAdapter;
  /** Changes sent per file. */
  batch?: number;
  /** More waiting changes than this are sent as one snapshot instead of many files (the first upload). */
  bigBatch?: number;
  /** Once this device has more than this many change files, it writes a snapshot and removes them. */
  compactAfter?: number;
};

export type SyncResult =
  | { ok: true; pulled: number; applied: number; parked: number; pushed: number; compacted: boolean }
  | { ok: false; stage: 'off' | 'pull' | 'push' | 'compact'; error: string };

const DEFAULTS = { batch: 500, bigBatch: 2000, compactAfter: 30 };

// ── small state kept in the database ─────────────────────────────────────────────────────────────────

const getState = async (db: SQLiteDatabase, key: string) =>
  (await db.getFirstAsync<{ value: string }>('SELECT value FROM sync_state WHERE key = ?', [key]))?.value ?? null;
const setState = (db: SQLiteDatabase, key: string, value: string) => db.runAsync('INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)', [key, value]);

async function getCursors(db: SQLiteDatabase): Promise<Record<string, number>> {
  try {
    const parsed = JSON.parse((await getState(db, 'cursors')) ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** The next file number for this device. Taken BEFORE uploading, so a failed upload leaves a harmless gap and never a clash. */
async function reserveSeq(db: SQLiteDatabase): Promise<number> {
  const n = Math.max(1, Number(await getState(db, 'next_seq')) || 1);
  await setState(db, 'next_seq', String(n + 1));
  return n;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ── pull ─────────────────────────────────────────────────────────────────────────────────────────────

async function applyFile(db: SQLiteDatabase, records: SyncRecord[], opts: SyncOptions, tally: { applied: number; parked: number }) {
  const r = await applyRecords(db, records);
  tally.applied += r.applied;
  tally.parked += r.parked;
  await opts.settings?.apply(records.filter(x => x.kind === 'setting'));
}

async function pull(db: SQLiteDatabase, drive: DriveStore, device: string, files: DriveFile[], opts: SyncOptions) {
  const byDevice = new Map<string, { snapshots: { n: number; file: DriveFile }[]; deltas: { n: number; file: DriveFile }[] }>();
  for (const file of files) {
    const p = parseFileName(file.name);
    if (!p || p.device === device) continue; // not ours to read, or our own file
    const set = byDevice.get(p.device) ?? { snapshots: [], deltas: [] };
    (p.type === 'snapshot' ? set.snapshots : set.deltas).push({ n: p.n, file });
    byDevice.set(p.device, set);
  }

  const cursors = await getCursors(db);
  const tally = { applied: 0, parked: 0, files: 0 };
  for (const [other, set] of byDevice) {
    let cursor = cursors[other] ?? 0;
    const save = async () => { cursors[other] = cursor; await setState(db, 'cursors', JSON.stringify(cursors)); };

    // A snapshot covers every change up to its number, so one newer than our place replaces reading all the files before it.
    const best = set.snapshots.sort((a, b) => b.n - a.n)[0];
    if (best && best.n > cursor) {
      const parsed = parseFile(await drive.read(best.file.id));
      if (parsed && parsed.type === 'snapshot' && parsed.device === other && parsed.covers === best.n) {
        await applyFile(db, parsed.records, opts, tally);
        tally.files++;
      }
      cursor = best.n; // a damaged snapshot is skipped, not retried forever; the device's next snapshot repairs it
      await save();
    }

    for (const d of set.deltas.filter(x => x.n > cursor).sort((a, b) => a.n - b.n)) {
      const parsed = parseFile(await drive.read(d.file.id)); // a failure here stops this pass; the cursor stays put
      if (parsed && parsed.type === 'delta' && parsed.device === other && parsed.seq === d.n) {
        await applyFile(db, parsed.records, opts, tally);
        tally.files++;
      }
      cursor = d.n;
      await save();
    }
  }
  tally.applied += await resolveParked(db);
  return tally;
}

// ── push ─────────────────────────────────────────────────────────────────────────────────────────────

async function push(db: SQLiteDatabase, drive: DriveStore, device: string, opts: SyncOptions, now: number): Promise<number> {
  const batch = opts.batch ?? DEFAULTS.batch;
  const bigBatch = opts.bigBatch ?? DEFAULTS.bigBatch;
  let sent = 0;

  // Each round sends one file. A bound keeps a bug from looping forever.
  for (let round = 0; round < 10_000; round++) {
    const pending = await pendingCount(db);
    const settingsChanged = (await opts.settings?.changed()) ?? [];
    if (pending === 0 && settingsChanged.length === 0) break;

    const big = pending > bigBatch;
    const entries = await readOutbox(db, big ? pending : batch);
    const seq = await reserveSeq(db);

    let records: SyncRecord[];
    let name: string;
    let content: string;
    if (big) {
      // The first upload of a large library: one snapshot instead of hundreds of small files.
      records = [...(await exportAll(db)), ...((await opts.settings?.all()) ?? [])];
      name = snapshotName(device, seq);
      content = encodeSnapshot(device, seq, now, records);
    } else {
      records = [];
      for (const e of entries) {
        const r = await exportEntry(db, e);
        if (r) records.push(r);
      }
      records.push(...settingsChanged);
      name = deltaName(device, seq);
      content = encodeDelta(device, seq, now, records);
    }

    if (records.length > 0) {
      if (content.length > MAX_FILE_CHARS) throw new Error('the data to upload is larger than the sync file limit');
      await drive.create(name, content); // throws if it fails: nothing below runs, so the queue is untouched
      sent += records.length;
    }
    // Only now, with the upload confirmed, is the queue emptied (exact entries: a change made meanwhile stays queued).
    await clearOutbox(db, entries);
    await opts.settings?.confirm(settingsChanged);
  }
  return sent;
}

// ── tidying up ───────────────────────────────────────────────────────────────────────────────────────

/**
 * When this device has many small change files, replaces them with one snapshot and removes the old ones. The snapshot is
 * written first, so nothing is lost if removing fails part way; files that could not be removed are simply tried again
 * next time (reading them again is harmless).
 */
async function compact(db: SQLiteDatabase, drive: DriveStore, device: string, opts: SyncOptions, now: number): Promise<boolean> {
  const own = (await drive.list()).map(f => ({ f, p: parseFileName(f.name) })).filter(x => x.p && x.p.device === device);
  const deltas = own.filter(x => x.p!.type === 'delta');
  if (deltas.length <= (opts.compactAfter ?? DEFAULTS.compactAfter)) return false;

  const covers = await reserveSeq(db);
  const records = [...(await exportAll(db)), ...((await opts.settings?.all()) ?? [])];
  const content = encodeSnapshot(device, covers, now, records);
  if (content.length > MAX_FILE_CHARS * 0.9) return false; // too big to compact safely; the small files are kept

  await drive.create(snapshotName(device, covers), content);
  for (const x of own) {
    if (x.p!.n < covers) await drive.remove(x.f.id).catch(() => {}); // old change files and older snapshots
  }
  return true;
}

// ── one pass ─────────────────────────────────────────────────────────────────────────────────────────

const running = new WeakMap<object, Promise<SyncResult>>();

/**
 * One sync pass. Only one runs at a time per database (a second call while one is running gets the same result). Never
 * throws: a failure comes back as { ok: false } and leaves the queue exactly as it was.
 */
export function syncOnce(db: SQLiteDatabase, drive: DriveStore, opts: SyncOptions = {}): Promise<SyncResult> {
  const existing = running.get(db);
  if (existing) return existing;
  const pass = run(db, drive, opts).finally(() => running.delete(db));
  running.set(db, pass);
  return pass;
}

async function run(db: SQLiteDatabase, drive: DriveStore, opts: SyncOptions): Promise<SyncResult> {
  if (!(await isSyncEnabled(db))) return { ok: false, stage: 'off', error: 'sync is off' };
  const now = opts.now ?? Date.now();
  const device = await getDeviceId(db);
  let stage: 'pull' | 'push' | 'compact' = 'pull';
  try {
    const tally = await pull(db, drive, device, await drive.list(), opts);
    stage = 'push';
    const pushed = await push(db, drive, device, opts, now);
    stage = 'compact';
    const compacted = await compact(db, drive, device, opts, now);
    await setState(db, 'last_sync_at', String(now));
    await setState(db, 'last_error', '');
    return { ok: true, pulled: tally.files, applied: tally.applied, parked: tally.parked, pushed, compacted };
  } catch (e) {
    await setState(db, 'last_error', message(e)).catch(() => {});
    return { ok: false, stage, error: message(e) };
  }
}

export type SyncStatus = { enabled: boolean; pending: number; lastSyncAt: number | null; lastError: string | null };

/** What the Settings screen shows: whether sync is on, how many changes are waiting, when it last worked, and the last error. */
export async function getSyncStatus(db: SQLiteDatabase): Promise<SyncStatus> {
  const at = Number(await getState(db, 'last_sync_at'));
  return {
    enabled: await isSyncEnabled(db),
    pending: await pendingCount(db),
    lastSyncAt: Number.isFinite(at) && at > 0 ? at : null,
    lastError: (await getState(db, 'last_error')) || null,
  };
}
