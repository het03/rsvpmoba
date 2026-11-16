// When two devices disagree about a record, which one wins. Pure code. The rules are a total order, so every device that
// sees the same records reaches the same result no matter what order the files arrive in, or how many times they are read.
import { matchKey, type SyncRecord } from '@/lib/syncFormat';

// Stable text of a record's data, used only to break an exact tie the same way everywhere.
function fingerprint(r: SyncRecord): string {
  return JSON.stringify(Object.keys(r.data).sort().map(k => [k, r.data[k]]));
}

/**
 * True when `remote` should replace `local` (a record the device does not have yet is always replaced). The newer
 * change wins; on the same time a deletion wins (so a deleted record does not come back from an equal edit); and an
 * exact tie is settled by the data itself. Identical records are not "newer", so re-reading a file changes nothing.
 */
export function remoteWins(local: SyncRecord | null, remote: SyncRecord): boolean {
  if (!local) return true;
  if (remote.updatedAt !== local.updatedAt) return remote.updatedAt > local.updatedAt;
  if (remote.deleted !== local.deleted) return remote.deleted;
  if (remote.deleted) return false;
  return fingerprint(remote) > fingerprint(local);
}

/** The better of two versions of one record; the same answer whichever is passed first. */
export function newest(a: SyncRecord, b: SyncRecord): SyncRecord {
  return remoteWins(a, b) ? b : a;
}

/**
 * Folds records into one version per record (kind + id): the winner. Order does not matter, and records listed twice
 * (a delta and the snapshot that covers it) collapse to one.
 */
export function mergeRecords(records: Iterable<SyncRecord>): Map<string, SyncRecord> {
  const out = new Map<string, SyncRecord>();
  for (const r of records) {
    const key = `${r.kind}:${r.id}`;
    const have = out.get(key) ?? null;
    if (remoteWins(have, r)) out.set(key, r);
  }
  return out;
}

export type Identity =
  | { action: 'none' }
  /** This device's record already has the winning id (or no clash): keep it and let the other device adopt it. */
  | { action: 'keep' }
  /** This device's record must take the remote id, so both devices call the same thing by the same id. */
  | { action: 'adopt'; from: string; to: string };

/**
 * Two devices that each add the same book (or save the same word from the same sentence) give it different ids. The
 * lower id is the winner everywhere: when a remote record matches a local one under a different id, whichever device holds
 * the higher id switches to the lower, so no duplicate is made and both end up agreeing.
 * `localByKey` maps a match key to the local record's id.
 */
export function reconcileIdentity(localByKey: ReadonlyMap<string, string>, remote: SyncRecord): Identity {
  const key = matchKey(remote);
  if (key === null) return { action: 'none' };
  const localId = localByKey.get(key);
  if (localId === undefined || localId === remote.id) return { action: 'none' };
  return remote.id < localId ? { action: 'adopt', from: localId, to: remote.id } : { action: 'keep' };
}
