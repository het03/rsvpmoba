// Stress tests: very large inputs, many rows, many concurrent lookups, a hanging network. Slow by design, so they are
// not part of `npm test`; run them with `npm run test:stress`. Limits are generous: they exist to catch something
// going quadratic or hanging, not to benchmark. Measurements are printed at the end.
import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import { getDb, initDb } from '../../src/db/index.ts';
import { clearCache, countCache, lookupWord, parseWiktionary, stripHtml } from '../../src/lib/dictionary.ts';
import { detectLanguage } from '../../src/lib/language.ts';
import { extractSentence } from '../../src/lib/sentence.ts';
import { loadStats } from '../../src/lib/stats.ts';
import { setThemeMode, subscribeThemeMode } from '../../src/lib/themeStore.ts';
import { clearVault, countVault, listVault, saveWord } from '../../src/lib/vault.ts';
import { getOrpRange } from '../../src/rsvp/orp.ts';
import { getPauseMultiplier, getRampMultiplier, getWordWeight, prevSentenceStart } from '../../src/rsvp/pause.ts';
import { splitParagraphs, tokenize } from '../../src/rsvp/tokenize.ts';
import { buildEpubHtml, buildTxtHtml } from '../helpers/pages.mjs';

const report = [];
const mb = () => Math.round(process.memoryUsage().heapUsed / 1048576);

async function measure(name, fn, limitMs) {
  const heapBefore = mb();
  const started = performance.now();
  const result = await fn();
  const ms = Math.round(performance.now() - started);
  report.push({ name, ms, limit: limitMs, heapMB: mb() - heapBefore });
  assert.ok(ms < limitMs, `${name} took ${ms} ms (limit ${limitMs} ms)`);
  return result;
}

after(() => {
  console.log('\nStress measurements');
  for (const r of report) console.log(`  ${String(r.ms).padStart(7)} ms (limit ${String(r.limit).padStart(6)})  heap ${String(r.heapMB).padStart(4)} MB  ${r.name}`);
});

const PROSE = 'It was a bright cold day in April, and the clocks were striking thirteen. Dr. Smith went home. "Really?" he asked. Yes! The hallway smelt of boiled cabbage and old rag mats.\n\n';
const WORDS_PER_PROSE = tokenize(PROSE).words.length;
const bigText = (words) => PROSE.repeat(Math.ceil(words / WORDS_PER_PROSE));

// Letters only, because the app's word matcher stops at digits ("word12" would be looked up as "word").
const alpha = (n) => { let s = ''; do { s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26); } while (n > 0); return `w${s}`; };

beforeEach(async () => {
  await initDb();
  const db = await getDb();
  for (const t of ['sessions', 'books', 'reading_positions', 'vocab_words', 'word_cache']) await db.runAsync(`DELETE FROM ${t}`);
});

describe('stress: reading engine', () => {
  test('a 2,000,000-word book tokenizes and times every word', async () => {
    const text = bigText(2_000_000);
    const { words, paraEnds } = await measure('tokenize 2M words', () => tokenize(text), 15000);
    assert.ok(words.length >= 2_000_000);
    await measure('per-word timing + ORP over 2M words', () => {
      let total = 0;
      for (let i = 0; i < words.length; i++) {
        total += 60000 / 300 * getPauseMultiplier(words[i], paraEnds.has(i)) * getWordWeight(words[i]) * getRampMultiplier(99);
        getOrpRange(words[i]);
      }
      assert.ok(total > 0);
    }, 20000);
  });

  test('splitParagraphs on 1,000,000 words', async () => {
    const out = await measure('splitParagraphs 1M words', () => splitParagraphs(bigText(1_000_000)), 10000);
    assert.ok(out.total >= 1_000_000);
  });

  test('"previous sentence" from the end of 1M words with no sentence ends is one linear walk', async () => {
    const words = Array.from({ length: 1_000_000 }, (_, i) => `w${i}`);
    const start = await measure('prevSentenceStart over 1M unpunctuated words', () => prevSentenceStart(words, new Set(), words.length - 1), 1000);
    assert.equal(start, 0);
  });
});

describe('stress: text helpers', () => {
  test('extractSentence: a 1,000,000-word paragraph with no sentence end, and 50,000 ordinary calls', async () => {
    const huge = Array.from({ length: 1_000_000 }, (_, i) => `word${i}`).join(' ');
    const sentence = await measure('extractSentence on one 1M-word sentence', () => extractSentence(huge, 5_000_000), 5000);
    assert.ok(sentence.length <= 402);
    const para = PROSE.repeat(12);
    await measure('extractSentence x50,000 on a 2,000-char paragraph', () => {
      for (let i = 0; i < 50_000; i++) extractSentence(para, (i * 37) % para.length);
    }, 8000);
  });

  test('detectLanguage: 5 MB of text, and 50,000 short paragraphs', async () => {
    const big = bigText(900_000);
    assert.equal(await measure('detectLanguage on ~5 MB', () => detectLanguage(big), 6000), 'en');
    await measure('detectLanguage x50,000 short paragraphs', () => {
      for (let i = 0; i < 50_000; i++) detectLanguage('Die Katze ist nicht in dem Haus, aber der Hund und die Kinder sind auch da.');
    }, 8000);
  });

  test('stripHtml: 2 MB of ordinary markup', async () => {
    const html = '<p>Some <a rel="mw:WikiLink" href="/wiki/x">linked</a> text &amp; more &#233;.</p>'.repeat(25_000);
    const out = await measure('stripHtml on 2 MB of markup', () => stripHtml(html), 3000);
    assert.ok(out.includes('linked') && !out.includes('<'));
  });

  test('stripHtml: hostile input must not hang (many "<" with no closing ">")', async () => {
    await measure('stripHtml on 2,000,000 unclosed "<"', () => stripHtml('<'.repeat(2_000_000)), 2000);
    await measure('stripHtml on 1,000,000 unclosed "<a "', () => stripHtml('<a '.repeat(1_000_000)), 2000);
    await measure('stripHtml on 1,000,000 unclosed "<li "', () => stripHtml('<li '.repeat(1_000_000)), 2000);
    await measure('stripHtml on 1,000,000 "&#"', () => stripHtml('&#'.repeat(1_000_000)), 2000);
    await measure('stripHtml on one "&#" + 2,000,000 digits (no ;)', () => stripHtml(`&#${'1'.repeat(2_000_000)}`), 2000);
  });

  test('parseWiktionary: a page with 3,000 entries of 200 definitions each', async () => {
    const entries = Array.from({ length: 3000 }, (_, i) => ({ partOfSpeech: `pos${i}`, language: 'English', definitions: Array.from({ length: 200 }, (_, j) => ({ definition: `<b>definition</b> ${j}` })) }));
    const e = await measure('parseWiktionary 600,000 definitions', () => parseWiktionary({ en: entries }, 'en', 'word'), 3000);
    assert.equal(e.meanings.length, 3);
  });
});

describe('stress: database volume', () => {
  async function inTransaction(db, fn) {
    await db.execAsync('BEGIN');
    try { await fn(); await db.execAsync('COMMIT'); } catch (e) { await db.execAsync('ROLLBACK'); throw e; }
  }

  test('Stats over 200,000 sessions', async () => {
    const db = await getDb();
    const day = 86_400_000;
    const now = new Date(2026, 10, 12, 15).getTime();
    await inTransaction(db, async () => {
      for (let i = 0; i < 200_000; i++) {
        const start = now - (i % 900) * day - (i % 24) * 3_600_000;
        await db.runAsync("INSERT INTO sessions (book_id, start_time, end_time, words_read, avg_wpm, mode) VALUES (1, ?, ?, ?, ?, 'rsvp')", [start, start + 60_000, 100 + (i % 500), 200 + (i % 400)]);
      }
    });
    const stats = await measure('loadStats over 200,000 sessions', () => loadStats(db, now), 8000);
    assert.equal(stats.dna.sessions, 200_000);
    assert.equal(stats.trend.length, 30);
    assert.ok(stats.streak.longest >= 900);
  });

  test('Word vault with 100,000 saved words: save, list everything, count, clear', async () => {
    const db = await getDb();
    await measure('save 100,000 words', () => inTransaction(db, async () => {
      for (let i = 0; i < 100_000; i++) await saveWord(db, { word: `word${i}`, definition: 'noun — a definition of reasonable length for a word', context: `A sentence number ${i} that the word came from.`, bookId: 1, bookTitle: 'A Book' }, i);
    }), 60000);
    assert.equal(await countVault(db), 100_000);
    const all = await measure('listVault with 100,000 words', () => listVault(db), 5000);
    assert.equal(all.length, 100_000);
    assert.equal(all[0].word, 'word99999');
    await measure('clearVault with 100,000 words', () => clearVault(db), 5000);
    assert.equal(await countVault(db), 0);
  });

  test('Dictionary cache with 200,000 rows: 10,000 cached lookups, then clear', async () => {
    const db = await getDb();
    await inTransaction(db, async () => {
      for (let i = 0; i < 200_000; i++) await db.runAsync('INSERT INTO word_cache (word, entry, fetched_at) VALUES (?, ?, 1)', [`en:${alpha(i)}`, JSON.stringify({ word: alpha(i), phonetic: '', meanings: [{ partOfSpeech: 'noun', definition: 'd' }] })]);
    });
    assert.equal(await countCache(db), 200_000);
    const offline = async () => { throw new Error('offline'); };
    await measure('10,000 cached lookups among 200,000 rows', async () => {
      for (let i = 0; i < 10_000; i++) assert.equal((await lookupWord(db, alpha(i * 19), offline)).status, 'found');
    }, 10000);
    await measure('clearCache with 200,000 rows', () => clearCache(db), 5000);
    assert.equal(await countCache(db), 0);
  });
});

describe('stress: concurrency and failure', () => {
  const section = (language, partOfSpeech, definition) => [{ partOfSpeech, language, definitions: [{ definition }] }];

  test('500 concurrent lookups of 50 words all succeed and leave exactly one cache row per word', async () => {
    const db = await getDb();
    let calls = 0;
    const fetchFake = async (url) => {
      calls++;
      await new Promise((r) => setTimeout(r, Math.random() * 5));
      const word = decodeURIComponent(url.split('/').pop());
      return { status: 200, ok: true, json: async () => ({ en: section('English', 'Noun', `meaning of ${word}`) }) };
    };
    const results = await measure('500 concurrent lookups (50 distinct words)', () => Promise.all(Array.from({ length: 500 }, (_, i) => lookupWord(db, alpha(i % 50), fetchFake))), 15000);
    assert.ok(results.every((r, i) => r.status === 'found' && r.entry.meanings[0].definition === `meaning of ${alpha(i % 50)}`));
    assert.equal(await countCache(db), 50);
    report.push({ name: `  (network calls made for those 500 lookups: ${calls}; there is no in-flight de-duplication)`, ms: 0, limit: 0, heapMB: 0 });
  });

  test('concurrent lookups of the same spelling in two languages never mix up the languages', async () => {
    const db = await getDb();
    const pages = { ging: { en: section('English', 'Noun', 'a gang'), de: section('German', 'Verb', 'preterite of gehen') } };
    const fetchFake = async (url) => ({ status: 200, ok: true, json: async () => pages[decodeURIComponent(url.split('/').pop())] });
    const langs = Array.from({ length: 200 }, (_, i) => (i % 2 ? 'de' : 'en'));
    const results = await Promise.all(langs.map((l) => lookupWord(db, 'ging', fetchFake, Date.now(), l)));
    assert.ok(results.every((r, i) => r.entry.language === (langs[i] === 'de' ? 'German' : 'English')));
  });

  test('a network that never answers ends as "unavailable" after the timeout instead of hanging', async () => {
    const db = await getDb();
    const hang = (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    const started = performance.now();
    const r = await lookupWord(db, 'slowword', hang);
    const ms = Math.round(performance.now() - started);
    report.push({ name: 'lookup against a network that never answers (timeout)', ms, limit: 10000, heapMB: 0 });
    assert.equal(r.status, 'unavailable');
    assert.ok(ms >= 7500 && ms < 10000, `timed out after ${ms} ms`);
    assert.equal(await countCache(db), 0);
  });

  test('100 lookups that all fail (500s) leave nothing cached and nothing pending', async () => {
    const db = await getDb();
    const failing = async () => ({ status: 500, ok: false, json: async () => ({}) });
    const results = await Promise.all(Array.from({ length: 100 }, (_, i) => lookupWord(db, `bad${i}`, failing)));
    assert.ok(results.every((r) => r.status === 'unavailable'));
    assert.equal(await countCache(db), 0);
  });

  test('theme store: 5,000 listeners and 2,000 theme switches', async () => {
    let calls = 0;
    const offs = Array.from({ length: 5000 }, () => subscribeThemeMode(() => { calls++; }));
    await measure('2,000 theme switches x 5,000 listeners', async () => {
      for (let i = 0; i < 2000; i++) await setThemeMode(i % 2 ? 'dark' : 'light');
    }, 5000);
    assert.equal(calls, 2000 * 5000);
    offs.forEach((off) => off());
    await setThemeMode('system');
  });
});

describe('stress: reader pages', () => {
  test('a TXT reader page for 500,000 words builds, and the EPUB page (with embedded libraries) builds 200 times', async () => {
    const paragraphs = Array.from({ length: 5000 }, (_, i) => ({ t: `Paragraph ${i} ` + 'word '.repeat(99), n: 100 }));
    const html = await measure('build TXT page, 500,000 words', () => buildTxtHtml(paragraphs, { total: 500_000 }), 5000);
    report.push({ name: `  (TXT page size: ${(html.length / 1048576).toFixed(1)} MB)`, ms: 0, limit: 0, heapMB: 0 });
    let size = 0;
    await measure('build EPUB page x200', () => { for (let i = 0; i < 200; i++) size = buildEpubHtml({}).length; }, 5000);
    report.push({ name: `  (EPUB page size: ${(size / 1024).toFixed(0)} KB, of which ~313 KB is the embedded libraries)`, ms: 0, limit: 0, heapMB: 0 });
    assert.ok(size > 300_000);
  });
});
