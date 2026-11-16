// What goes into the sync files on Drive, and how to read them back safely. Pure code (no database, no network), so it
// is fully testable. Files come from other devices and from a place the user can reach, so everything read from one is
// treated as untrusted: a bad record is skipped, a bad file is ignored, and neither can stop a sync.
//
// A device writes two kinds of file, named after itself so no two devices ever write the same file:
//   delta-<device>-<seq>.json     the changes since its last upload (a few KB)
//   snapshot-<device>-<seq>.json  everything it has, covering all deltas up to `covers`; lets old deltas be removed
// Each holds records. A record is one thing that changed: a book, a reading position, a session, a saved word or a setting.

export type SyncKind = 'book' | 'position' | 'session' | 'vocab' | 'setting';
export const SYNC_KINDS: SyncKind[] = ['book', 'position', 'session', 'vocab', 'setting'];

type FieldType = 'str' | 'num' | 'strnull' | 'numnull';
export type FieldValue = string | number | null;

// The fields each kind carries (short names keep files small). Anything else in a record is dropped when reading, so a
// newer app can add fields without breaking an older one. Cover images and file paths are deliberately not here.
export const FIELDS: Record<SyncKind, Record<string, FieldType>> = {
  book: { t: 'str', a: 'str', f: 'str', sz: 'num', tw: 'num', da: 'num' },
  position: { wi: 'num' },
  session: { b: 'strnull', s: 'num', e: 'numnull', w: 'num', p: 'num', m: 'str' },
  vocab: { w: 'str', df: 'str', c: 'str', b: 'strnull', bt: 'str', sa: 'num', nr: 'num', iv: 'num', ez: 'num' },
  setting: { v: 'str' },
};

export type SyncRecord = {
  kind: SyncKind;
  /** The record's permanent id. For a position it is its book's id; for a setting it is the setting's name. */
  id: string;
  /** When it last changed (ms since 1970). The newer change wins when two devices disagree. */
  updatedAt: number;
  deleted: boolean;
  /** The fields for this kind (see FIELDS). Empty for a deleted record. */
  data: Record<string, FieldValue>;
};

type Wire = { k: string; id: string; u: number; x?: 1; d?: Record<string, FieldValue> };

export type SyncFile =
  | { type: 'delta'; device: string; seq: number; at: number; records: SyncRecord[]; skipped: number }
  | { type: 'snapshot'; device: string; covers: number; at: number; records: SyncRecord[]; skipped: number };

export const FORMAT_VERSION = 1;
/** A file bigger than this is ignored rather than loaded into memory (about 5x the largest realistic snapshot measured). */
export const MAX_FILE_CHARS = 8 * 1024 * 1024;
export const MAX_RECORDS_PER_FILE = 100_000;
const MAX_ID_CHARS = 64;
const MAX_TEXT_CHARS = 20_000;
const DEVICE_RE = /^[0-9a-f]{8,64}$/;
const ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;

const isKind = (v: unknown): v is SyncKind => typeof v === 'string' && (SYNC_KINDS as string[]).includes(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function cleanFields(kind: SyncKind, raw: unknown): Record<string, FieldValue> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const out: Record<string, FieldValue> = {};
  for (const [name, type] of Object.entries(FIELDS[kind])) {
    const v = src[name];
    if (type === 'str') {
      if (typeof v !== 'string' || v.length > MAX_TEXT_CHARS) return null;
      out[name] = v;
    } else if (type === 'num') {
      if (!isNum(v)) return null;
      out[name] = v;
    } else if (type === 'strnull') {
      if (v === null || v === undefined) out[name] = null;
      else if (typeof v === 'string' && v.length <= MAX_TEXT_CHARS) out[name] = v;
      else return null;
    } else {
      if (v === null || v === undefined) out[name] = null;
      else if (isNum(v)) out[name] = v;
      else return null;
    }
  }
  return out;
}

/** A record from a file, checked. Null when it is not a usable record of a known kind. */
export function parseRecord(raw: unknown): SyncRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const w = raw as Record<string, unknown>;
  if (!isKind(w.k) || typeof w.id !== 'string' || !ID_RE.test(w.id) || w.id.length > MAX_ID_CHARS) return null;
  if (!isNum(w.u) || w.u < 0) return null;
  if (w.x === 1) return { kind: w.k, id: w.id, updatedAt: w.u, deleted: true, data: {} };
  const data = cleanFields(w.k, w.d);
  return data ? { kind: w.k, id: w.id, updatedAt: w.u, deleted: false, data } : null;
}

export function toWire(r: SyncRecord): Wire {
  return r.deleted ? { k: r.kind, id: r.id, u: r.updatedAt, x: 1 } : { k: r.kind, id: r.id, u: r.updatedAt, d: r.data };
}

export function encodeDelta(device: string, seq: number, at: number, records: SyncRecord[]): string {
  return JSON.stringify({ v: FORMAT_VERSION, type: 'delta', device, seq, at, records: records.map(toWire) });
}

export function encodeSnapshot(device: string, covers: number, at: number, records: SyncRecord[]): string {
  return JSON.stringify({ v: FORMAT_VERSION, type: 'snapshot', device, covers, at, records: records.map(toWire) });
}

/**
 * Reads a file's text. Null when the file is not one of ours (too big, not JSON, wrong version or shape): it is
 * ignored, never an error. Records inside that are unusable are skipped and counted.
 */
export function parseFile(text: string): SyncFile | null {
  if (typeof text !== 'string' || text.length === 0 || text.length > MAX_FILE_CHARS) return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const f = data as Record<string, unknown>;
  if (f.v !== FORMAT_VERSION || typeof f.device !== 'string' || !DEVICE_RE.test(f.device) || !isNum(f.at)) return null;
  if (!Array.isArray(f.records) || f.records.length > MAX_RECORDS_PER_FILE) return null;

  const records: SyncRecord[] = [];
  let skipped = 0;
  for (const raw of f.records) {
    const r = parseRecord(raw);
    if (r) records.push(r);
    else skipped++;
  }
  if (f.type === 'delta' && Number.isInteger(f.seq) && (f.seq as number) >= 1) {
    return { type: 'delta', device: f.device, seq: f.seq as number, at: f.at, records, skipped };
  }
  if (f.type === 'snapshot' && Number.isInteger(f.covers) && (f.covers as number) >= 0) {
    return { type: 'snapshot', device: f.device, covers: f.covers as number, at: f.at, records, skipped };
  }
  return null;
}

const pad = (n: number) => String(n).padStart(8, '0');
export const deltaName = (device: string, seq: number) => `delta-${device}-${pad(seq)}.json`;
export const snapshotName = (device: string, covers: number) => `snapshot-${device}-${pad(covers)}.json`;

/** What a file name says about the file (kind, device, number), or null if it is not one of ours. */
export function parseFileName(name: string): { type: 'delta' | 'snapshot'; device: string; n: number } | null {
  const m = /^(delta|snapshot)-([0-9a-f]{8,64})-(\d{8})\.json$/.exec(name);
  return m ? { type: m[1] as 'delta' | 'snapshot', device: m[2], n: Number(m[3]) } : null;
}

const norm = (s: string) => s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * What makes two records "the same thing" even though two devices gave them different ids, or null when the id alone
 * says it. The same book imported on two phones is one book (same title and file size); the same word saved from the
 * same sentence is one saved word.
 */
export function matchKey(r: Pick<SyncRecord, 'kind' | 'data'>): string | null {
  if (r.kind === 'book') return `book|${norm(String(r.data.t ?? ''))}|${r.data.sz}`;
  if (r.kind === 'vocab') return `vocab|${String(r.data.w ?? '')}\u0000${String(r.data.c ?? '')}`;
  return null;
}
