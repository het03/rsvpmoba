// Word lookup, cached in SQLite so a word is only fetched once. English words use the free dictionary API; other
// scripts (Korean, Arabic, Hindi, Hebrew, ...) use Wiktionary's definitions, which are in English for words of any
// language. The parsing is pure and the network call is injectable, so it can be tested without a phone or a connection.
import type { SQLiteDatabase } from 'expo-sqlite';

export type Meaning = { partOfSpeech: string; definition: string; example?: string };
export type Entry = {
  word: string;
  phonetic: string;
  meanings: Meaning[];
  /** e.g. "Korean"; absent on entries cached before languages were added. */
  language?: string;
  /** Where the text came from, which decides the licence version to credit. Absent on older cached entries (treated as Wiktionary). */
  source?: 'dictionaryapi' | 'wiktionary';
};

export type LookupResult =
  | { status: 'found'; entry: Entry }
  | { status: 'not-found' }
  | { status: 'unavailable' };

export const MAX_MEANINGS = 3;
const FREE_DICTIONARY = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
const WIKTIONARY = 'https://en.wiktionary.org/api/rest_v1/page/definition/';
const TIMEOUT_MS = 8000;

const WORD_RE = /[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*/u;

/** The first word of a selection, without surrounding punctuation, keeping its case. '' when there is no word. */
export function firstWord(text: string): string {
  const match = text.match(WORD_RE);
  return match ? match[0].replace(/’/g, "'") : '';
}

/** The first word of a selection, lower-cased. '' when there is no word. */
export function cleanWord(text: string): string {
  return firstWord(text).toLowerCase();
}

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/;
const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const DEVANAGARI = /[ऀ-ॿ]/;
const HEBREW = /[֐-׿יִ-ﭏ]/;
const LATIN = /[A-Za-zÀ-ɏ]/;

/**
 * Which Wiktionary language to prefer for a word, from its script, and whether it is Latin-script (which tries the
 * English dictionary first). An unrecognised script has no preference and takes whatever language the page has.
 */
export function detectScript(word: string): { preferred: string | null; latin: boolean } {
  if (HANGUL.test(word)) return { preferred: 'ko', latin: false };
  if (ARABIC.test(word)) return { preferred: 'ar', latin: false };
  if (DEVANAGARI.test(word)) return { preferred: 'hi', latin: false };
  if (HEBREW.test(word)) return { preferred: 'he', latin: false };
  if (LATIN.test(word)) return { preferred: 'en', latin: true };
  return { preferred: null, latin: false };
}

// Wiktionary page titles have no vowel marks: Arabic harakat and tatweel, Hebrew niqqud and cantillation.
const MARKS = /[ـً-ٰٟ֑-ׇ]/g;
const stripMarks = (w: string) => w.replace(MARKS, '');

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Wiktionary text to plain text: drops tags (lists become spaces), decodes entities, collapses whitespace. */
export function stripHtml(html: string): string {
  return html
    .replace(/<\/?(?:li|ol|ul|br|p|div)\b[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(?:#x([0-9a-f]+)|#(\d+)|([a-z]+));/gi, (m, hex, dec, name) => {
      if (name) return ENTITIES[name.toLowerCase()] ?? m;
      const code = hex ? parseInt(hex, 16) : parseInt(dec, 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

type RawDefinition = { definition?: unknown; example?: unknown };
type RawMeaning = { partOfSpeech?: unknown; definitions?: RawDefinition[] };
type RawEntry = { word?: unknown; phonetic?: unknown; phonetics?: { text?: unknown }[]; meanings?: RawMeaning[] };

/** Turns the free dictionary API's response into an Entry: the first definition of each part of speech, at most MAX_MEANINGS. Null if it has none. */
export function parseEntry(data: unknown): Entry | null {
  if (!Array.isArray(data) || data.length === 0) return null;
  const first = data[0] as RawEntry;
  const word = str(first?.word);
  if (!word) return null;

  const meanings: Meaning[] = [];
  const seen = new Set<string>();
  for (const raw of data as RawEntry[]) {
    for (const m of raw?.meanings ?? []) {
      const partOfSpeech = str(m?.partOfSpeech);
      const def = (m?.definitions ?? []).find(d => str(d?.definition));
      if (!def || seen.has(partOfSpeech)) continue;
      seen.add(partOfSpeech);
      const example = str(def.example);
      meanings.push({ partOfSpeech, definition: str(def.definition), ...(example ? { example } : {}) });
      if (meanings.length === MAX_MEANINGS) break;
    }
    if (meanings.length === MAX_MEANINGS) break;
  }
  if (meanings.length === 0) return null;

  const phonetic = str(first.phonetic) || str(first.phonetics?.find(p => str(p?.text))?.text);
  return { word, phonetic, meanings, language: 'English', source: 'dictionaryapi' };
}

type WiktionaryDefinition = { definition?: unknown; parsedExamples?: { example?: unknown; translation?: unknown }[] };
type WiktionaryEntry = { partOfSpeech?: unknown; language?: unknown; definitions?: WiktionaryDefinition[] };

/**
 * Turns a Wiktionary definitions response (an object keyed by language code) into an Entry. Uses the preferred
 * language's entries when the page has them, otherwise the first real language on the page ("other" is dialects and
 * leftovers, so it is never chosen). Takes the first non-empty definition of each part of speech, at most MAX_MEANINGS.
 */
export function parseWiktionary(data: unknown, preferred: string | null, word: string, strict = false): Entry | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const byLanguage = data as Record<string, unknown>;
  const usable = (code: string) => Array.isArray(byLanguage[code]) && (byLanguage[code] as unknown[]).length > 0;
  // Strict means the language is known (from the book), so a page with no section in it is a miss, not a reason to
  // show some other language's meaning of the same spelling.
  const code = preferred && usable(preferred)
    ? preferred
    : strict ? undefined : Object.keys(byLanguage).find(k => k !== 'other' && usable(k));
  if (!code) return null;

  const meanings: Meaning[] = [];
  const seen = new Set<string>();
  let language = '';
  for (const raw of byLanguage[code] as WiktionaryEntry[]) {
    if (!language) language = str(raw?.language);
    const partOfSpeech = str(raw?.partOfSpeech).toLowerCase();
    if (seen.has(partOfSpeech)) continue;
    const found = (raw?.definitions ?? [])
      .map(d => ({ d, text: stripHtml(str(d?.definition)) }))
      .find(x => x.text !== '');
    if (!found) continue;
    seen.add(partOfSpeech);

    const ex = found.d.parsedExamples?.find(e => stripHtml(str(e?.example)) !== '');
    const sentence = ex ? stripHtml(str(ex.example)) : '';
    const translation = ex ? stripHtml(str(ex.translation)) : '';
    const example = sentence && translation ? `${sentence} — ${translation}` : sentence;
    meanings.push({ partOfSpeech, definition: found.text, ...(example ? { example } : {}) });
    if (meanings.length === MAX_MEANINGS) break;
  }
  if (meanings.length === 0) return null;
  return { word, phonetic: '', meanings, source: 'wiktionary', ...(language ? { language } : {}) };
}

/** The CC BY-SA version to credit: the free API labels its data 3.0, Wiktionary itself says 4.0. */
export function licenseVersion(entry: Entry): '3.0' | '4.0' {
  return entry.source === 'dictionaryapi' ? '3.0' : '4.0';
}

/** One line to store with a saved word: "noun — the definition". */
export function summarize(entry: Entry): string {
  const m = entry.meanings[0];
  return m.partOfSpeech ? `${m.partOfSpeech} — ${m.definition}` : m.definition;
}

type Fetched = { status: 'ok'; data: unknown } | { status: 'not-found' } | { status: 'unavailable' };

// Wikimedia's policy asks API clients for a descriptive User-Agent with contact information. Native apps set
// User-Agent; browsers can't, so they get Api-User-Agent, which Wikimedia accepts instead. Sent to Wikimedia only.
const CLIENT_ID = 'rsvpmoba/1.0 (https://github.com/het03/rsvpmoba)';
export const WIKIMEDIA_HEADERS = { 'User-Agent': CLIENT_ID, 'Api-User-Agent': CLIENT_ID };

async function getJson(fetchImpl: typeof fetch, url: string, headers?: Record<string, string>): Promise<Fetched> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { signal: controller.signal, ...(headers ? { headers } : {}) });
    if (res.status === 404) return { status: 'not-found' };
    if (!res.ok) {
      console.warn(`[dict] ${res.status} from ${url}`);
      return { status: 'unavailable' };
    }
    return { status: 'ok', data: await res.json() };
  } catch (e) {
    console.warn(`[dict] request failed for ${url}:`, e);
    return { status: 'unavailable' };
  } finally {
    clearTimeout(timer);
  }
}

async function fromFreeDictionary(word: string, fetchImpl: typeof fetch): Promise<LookupResult> {
  const r = await getJson(fetchImpl, `${FREE_DICTIONARY}${encodeURIComponent(word)}`);
  if (r.status !== 'ok') return r;
  const entry = parseEntry(r.data);
  return entry ? { status: 'found', entry } : { status: 'not-found' };
}

// Wiktionary titles are case-sensitive (German nouns are capitalised), so each spelling in `forms` is tried in order
// until one has the wanted language. Arabic and Hebrew marks are dropped, since page titles don't have them.
async function fromWiktionary(forms: string[], preferred: string | null, strict: boolean, fetchImpl: typeof fetch): Promise<LookupResult> {
  const titles = [...new Set(forms.map(stripMarks))];
  for (const title of titles) {
    const r = await getJson(fetchImpl, `${WIKTIONARY}${encodeURIComponent(title)}`, WIKIMEDIA_HEADERS);
    if (r.status === 'unavailable') return r;
    if (r.status === 'not-found') continue;
    const entry = parseWiktionary(r.data, preferred, forms[0], strict);
    if (entry) return { status: 'found', entry };
  }
  return { status: 'not-found' };
}

/**
 * Looks a word up. `language` is the Wiktionary code of the language being read (from detectLanguage), which only
 * matters for Latin-script words: the same spelling means different things in different languages ("ging", "Rock"), so
 * the language picks the dictionary and the entry. Other scripts are told apart by the script itself.
 */
export async function lookupWord(
  db: SQLiteDatabase,
  text: string,
  fetchImpl: typeof fetch = fetch,
  now: number = Date.now(),
  language: string | null = null,
): Promise<LookupResult> {
  const typed = firstWord(text);
  const word = typed.toLowerCase();
  if (!word) return { status: 'not-found' };

  const script = detectScript(word);
  const lang = script.latin ? language ?? 'en' : script.preferred;
  // The cache is per language, so a word cached while reading one language is never shown for another.
  const key = `${lang ?? ''}:${word}`;

  const cached = await db.getFirstAsync<{ entry: string }>('SELECT entry FROM word_cache WHERE word = ?', [key]);
  if (cached) {
    try {
      return { status: 'found', entry: JSON.parse(cached.entry) as Entry };
    } catch {
      // A damaged cache row is just a miss; it is replaced below.
    }
  }

  let result: LookupResult;
  if (!script.latin) {
    result = await fromWiktionary([word, typed], lang, false, fetchImpl);
  } else if (lang !== 'en') {
    // Reading a known non-English language: the English dictionary has nothing for it, so go straight to Wiktionary.
    // Nouns are capitalised in German, so the word as typed goes first.
    result = await fromWiktionary([typed, word], lang, true, fetchImpl);
  } else {
    result = await fromFreeDictionary(word, fetchImpl);
    if (result.status !== 'found') {
      // The free API is often down or empty, so a failure there still gets a second chance.
      const fallback = await fromWiktionary([word, typed], 'en', language === 'en', fetchImpl);
      if (fallback.status === 'found' || result.status === 'not-found') result = fallback;
    }
  }

  if (result.status === 'found') {
    await db.runAsync('INSERT OR REPLACE INTO word_cache (word, entry, fetched_at) VALUES (?, ?, ?)', [key, JSON.stringify(result.entry), now]);
  }
  return result;
}
