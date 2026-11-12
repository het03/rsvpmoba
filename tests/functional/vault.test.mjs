// The Word Vault against the app's real schema, with the dictionary network call faked.
import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { getDb, initDb } from '../../src/db/index.ts';
import { clearCache, countCache, lookupWord } from '../../src/lib/dictionary.ts';
import { clearVault, countVault, isSaved, listVault, removeWord, saveWord } from '../../src/lib/vault.ts';

const section = (language, partOfSpeech, definition) => [{ partOfSpeech, language, definitions: [{ definition }] }];

// Shaped like a real Wiktionary page: an object keyed by language code.
const ENTRY = { en: section('English', 'Noun', 'A happy accident.') };

const reply = (status, body) => async () => ({ status, ok: status >= 200 && status < 300, json: async () => body });

function countingFetch(status, body) {
  const f = async (url, init) => { f.calls++; f.urls.push(url); f.inits.push(init); return reply(status, body)(); };
  f.calls = 0;
  f.urls = [];
  f.inits = [];
  return f;
}

// Serves Wiktionary pages by title, so we can see which pages a word asks for.
function routedFetch({ wiktionary = {} } = {}) {
  const f = async (url, init) => {
    f.urls.push(url);
    f.inits.push(init);
    const title = decodeURIComponent(url.split('/page/definition/')[1]);
    return wiktionary[title] ? reply(200, wiktionary[title])() : reply(404, {})();
  };
  f.urls = [];
  f.inits = [];
  return f;
}

beforeEach(async () => {
  await initDb();
  const db = await getDb();
  await db.runAsync('DELETE FROM word_cache');
  await db.runAsync('DELETE FROM vocab_words');
  await db.runAsync('DELETE FROM books');
});

describe('lookupWord', () => {
  test('fetches a definition from Wiktionary and shapes it', async () => {
    const f = countingFetch(200, ENTRY);
    const r = await lookupWord(await getDb(), '“Serendipity,”', f);
    assert.equal(r.status, 'found');
    assert.equal(r.entry.word, 'serendipity');
    assert.equal(r.entry.language, 'English');
    assert.equal(r.entry.meanings[0].definition, 'A happy accident.');
    assert.ok(f.urls[0].endsWith('/page/definition/serendipity'));
  });

  test('a second lookup of the same word is served from the cache, even with no network', async () => {
    const db = await getDb();
    const f = countingFetch(200, ENTRY);
    await lookupWord(db, 'serendipity', f);
    const offline = async () => { throw new Error('offline'); };
    const again = await lookupWord(db, 'Serendipity.', offline);
    assert.equal(again.status, 'found');
    assert.equal(again.entry.meanings[0].definition, 'A happy accident.');
    assert.equal(f.calls, 1);
  });

  test('an unknown word is not-found and is not cached', async () => {
    const db = await getDb();
    const r = await lookupWord(db, 'zzxqv', countingFetch(404, { type: 'not_found' }));
    assert.equal(r.status, 'not-found');
    assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS n FROM word_cache')).n, 0);
  });

  test('a response with no usable definition is not-found', async () => {
    const db = await getDb();
    assert.equal((await lookupWord(db, 'odd', countingFetch(200, []))).status, 'not-found');
    assert.equal((await lookupWord(db, 'odd', countingFetch(200, { en: [] }))).status, 'not-found');
    assert.equal((await lookupWord(db, 'odd', countingFetch(200, { en: section('English', 'Noun', '<span></span>') }))).status, 'not-found');
  });

  test('network failure and server errors are unavailable, and are not cached', async () => {
    const db = await getDb();
    const down = async () => { throw new Error('network'); };
    assert.equal((await lookupWord(db, 'word', down)).status, 'unavailable');
    assert.equal((await lookupWord(db, 'word', countingFetch(500, {}))).status, 'unavailable');
    assert.equal((await lookupWord(db, 'word', countingFetch(429, {}))).status, 'unavailable');
    assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS n FROM word_cache')).n, 0);
  });

  test('text with no word never touches the network', async () => {
    const f = countingFetch(200, ENTRY);
    assert.equal((await lookupWord(await getDb(), '— …', f)).status, 'not-found');
    assert.equal(f.calls, 0);
  });

  test('a damaged cache row is replaced by a fresh lookup', async () => {
    const db = await getDb();
    await db.runAsync("INSERT INTO word_cache (word, entry, fetched_at) VALUES ('en:serendipity', '{not json', 1)");
    const r = await lookupWord(db, 'serendipity', countingFetch(200, ENTRY));
    assert.equal(r.status, 'found');
    assert.equal((await lookupWord(db, 'serendipity', async () => { throw new Error('offline'); })).status, 'found');
  });
});

describe('lookupWord: identifying the app', () => {
  test('every request carries a User-Agent with contact info, plus Api-User-Agent for browsers', async () => {
    const f = routedFetch({ wiktionary: { maison: { fr: section('French', 'Noun', 'house') } } });
    await lookupWord(await getDb(), 'maison', f, Date.now(), 'fr');
    assert.ok(f.inits.length > 0);
    for (const init of f.inits) {
      assert.match(init.headers['User-Agent'], /^rsvpmoba\/\d+\.\d+ \(https:\/\/github\.com\/[^)]+\)$/);
      assert.equal(init.headers['Api-User-Agent'], init.headers['User-Agent']);
    }
  });

  test('nothing but Wikimedia is ever contacted', async () => {
    const f = routedFetch({ wiktionary: { serendipity: ENTRY } });
    await lookupWord(await getDb(), 'serendipity', f);
    await lookupWord(await getDb(), 'zzxqv', f);
    assert.ok(f.urls.every(u => u.startsWith('https://en.wiktionary.org/')));
  });
});

const KO = { ko: [{ partOfSpeech: 'Noun', language: 'Korean', definitions: [{ definition: '<a href="/wiki/love">love</a>; affection' }] }] };

describe('lookupWord: other languages', () => {
  test('Korean, Arabic, Hindi and Hebrew words go to Wiktionary and come back in their own language', async () => {
    const wiktionary = {
      '사랑': KO,
      'كتاب': { ar: [{ partOfSpeech: 'Noun', language: 'Arabic', definitions: [{ definition: 'book' }] }] },
      'किताब': { hi: [{ partOfSpeech: 'Noun', language: 'Hindi', definitions: [{ definition: 'book' }] }] },
      'ספר': { he: [{ partOfSpeech: 'Noun', language: 'Hebrew', definitions: [{ definition: 'book' }] }] },
    };
    const f = routedFetch({ wiktionary });
    const db = await getDb();
    const langs = [];
    for (const w of ['사랑', 'كتاب', 'किताब', 'ספר']) {
      const r = await lookupWord(db, w, f);
      assert.equal(r.status, 'found', w);
      langs.push(r.entry.language);
    }
    assert.deepEqual(langs, ['Korean', 'Arabic', 'Hindi', 'Hebrew']);
  });

  test('a Korean definition is stripped of HTML and cached for offline use', async () => {
    const db = await getDb();
    const r = await lookupWord(db, '사랑,', routedFetch({ wiktionary: { '사랑': KO } }));
    assert.equal(r.entry.meanings[0].definition, 'love; affection');
    const offline = async () => { throw new Error('offline'); };
    assert.equal((await lookupWord(db, '사랑', offline)).entry.language, 'Korean');
  });

  test('Arabic and Hebrew marks are dropped for the page title', async () => {
    const f = routedFetch({ wiktionary: { 'كتاب': { ar: [{ partOfSpeech: 'Noun', language: 'Arabic', definitions: [{ definition: 'book' }] }] } } });
    const r = await lookupWord(await getDb(), 'كِتَاب', f);
    assert.equal(r.status, 'found');
    assert.ok(f.urls[0].endsWith(encodeURIComponent('كتاب')));
  });

  test('a Latin-script word with no known book language takes the first real language on its page', async () => {
    const wiktionary = { maison: { fr: [{ partOfSpeech: 'Noun', language: 'French', definitions: [{ definition: 'house' }] }] } };
    const f = routedFetch({ wiktionary });
    const r = await lookupWord(await getDb(), 'Maison', f);
    assert.equal(r.status, 'found');
    assert.equal(r.entry.language, 'French');
    assert.equal(f.urls.length, 1);
  });

  test('a capitalised word is retried as typed when the lower-case page is missing', async () => {
    const wiktionary = { Haus: { de: [{ partOfSpeech: 'Noun', language: 'German', definitions: [{ definition: 'house' }] }] } };
    const f = routedFetch({ wiktionary });
    const r = await lookupWord(await getDb(), 'Haus', f);
    assert.equal(r.entry.language, 'German');
    assert.ok(f.urls.some(u => u.endsWith('/Haus')));
  });

  test('not found is not-found, a network failure is unavailable, and neither is cached', async () => {
    const db = await getDb();
    assert.equal((await lookupWord(db, '사랑', routedFetch())).status, 'not-found');
    const down = async () => { throw new Error('network'); };
    assert.equal((await lookupWord(db, 'maison', down)).status, 'unavailable');
    assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS n FROM word_cache')).n, 0);
  });

  test('a cache row from before languages were added still works', async () => {
    const db = await getDb();
    await db.runAsync("INSERT INTO word_cache (word, entry, fetched_at) VALUES ('en:old', ?, 1)", [JSON.stringify({ word: 'old', phonetic: '', meanings: [{ partOfSpeech: 'adj', definition: 'aged' }] })]);
    const r = await lookupWord(await getDb(), 'old', async () => { throw new Error('offline'); });
    assert.equal(r.status, 'found');
    assert.equal(r.entry.language, undefined);
  });
});

// Shaped like the real Wiktionary pages: the same spelling has sections in several languages.
const PAGES = {
  Haus: { en: section('English', 'Proper noun', 'A surname'), bar: section('Bavarian', 'Noun', 'house'), de: section('German', 'Noun', 'house, building'), lb: section('Luxembourgish', 'Noun', 'house') },
  haus: { bar: section('Bavarian', 'Noun', 'alternative form of Haus'), de: section('German', 'Verb', 'singular imperative of hausen') },
  ging: { en: section('English', 'Noun', 'A company; troop; a gang.'), nl: section('Dutch', 'Verb', 'singular past indicative of gaan'), de: section('German', 'Verb', 'first/third-person singular preterite of gehen') },
  Die: { en: section('English', 'Proper noun', 'A surname') },
  die: { nl: section('Dutch', 'Pronoun', 'that one'), de: section('German', 'Article', 'the (feminine nominative singular)') },
  maison: { fr: section('French', 'Noun', 'house') },
  und: { de: section('German', 'Conjunction', 'and') },
  the: { en: section('English', 'Article', 'Definite article') },
};

describe('lookupWord: reading a German book', () => {
  test('tries the word as typed first and picks the German section', async () => {
    const f = routedFetch({ wiktionary: PAGES });
    const r = await lookupWord(await getDb(), 'Haus,', f, Date.now(), 'de');
    assert.equal(r.status, 'found');
    assert.equal(r.entry.language, 'German');
    assert.equal(r.entry.meanings[0].definition, 'house, building');
    assert.equal(r.entry.word, 'Haus');
    assert.equal(f.urls.length, 1);
    assert.ok(f.urls[0].endsWith('/Haus'));
  });

  test('a spelling that means something else in English or Dutch gets the German meaning', async () => {
    const r = await lookupWord(await getDb(), 'ging', routedFetch({ wiktionary: PAGES }), Date.now(), 'de');
    assert.equal(r.entry.language, 'German');
    assert.equal(r.entry.meanings[0].definition, 'first/third-person singular preterite of gehen');
  });

  test('a sentence-initial capital falls back to the lower-case page when the capitalised one has no German', async () => {
    const f = routedFetch({ wiktionary: PAGES });
    const r = await lookupWord(await getDb(), 'Die', f, Date.now(), 'de');
    assert.equal(r.entry.language, 'German');
    assert.equal(r.entry.meanings[0].partOfSpeech, 'article');
    assert.deepEqual(f.urls.map(u => u.split('/').pop()), ['Die', 'die']);
  });

  test('a page with no German section is not-found rather than another language’s meaning', async () => {
    const r = await lookupWord(await getDb(), 'maison', routedFetch({ wiktionary: PAGES }), Date.now(), 'de');
    assert.equal(r.status, 'not-found');
  });

  test('French, Spanish and others work the same way', async () => {
    const f = routedFetch({ wiktionary: PAGES });
    const r = await lookupWord(await getDb(), 'maison', f, Date.now(), 'fr');
    assert.equal(r.entry.language, 'French');
  });

  test('the cache is per language: the same spelling is not served across languages', async () => {
    const db = await getDb();
    const f = routedFetch({ wiktionary: PAGES });
    const en = await lookupWord(db, 'ging', f, Date.now(), 'en');
    const de = await lookupWord(db, 'ging', f, Date.now(), 'de');
    assert.equal(en.entry.meanings[0].definition, 'A company; troop; a gang.');
    assert.equal(de.entry.meanings[0].definition, 'first/third-person singular preterite of gehen');
    // Each is now cached on its own and works offline.
    const offline = async () => { throw new Error('offline'); };
    assert.equal((await lookupWord(db, 'ging', offline, Date.now(), 'de')).entry.language, 'German');
    assert.equal((await lookupWord(db, 'ging', offline, Date.now(), 'en')).entry.meanings[0].definition, 'A company; troop; a gang.');
  });
});

describe('lookupWord: reading an English book', () => {
  test('English words come from Wiktionary, lower-case page first', async () => {
    const f = routedFetch({ wiktionary: PAGES });
    const r = await lookupWord(await getDb(), 'The', f, Date.now(), 'en');
    assert.equal(r.status, 'found');
    assert.equal(r.entry.language, 'English');
    assert.equal(r.entry.meanings[0].definition, 'Definite article');
    assert.deepEqual(f.urls.map(u => u.split('/').pop()), ['the']);
  });

  test('when the book is known to be English, only the English section counts', async () => {
    const f = routedFetch({ wiktionary: PAGES });
    assert.equal((await lookupWord(await getDb(), 'und', f, Date.now(), 'en')).status, 'not-found');
  });

  test('with no known language an English-looking word still finds whatever the page has', async () => {
    const f = routedFetch({ wiktionary: PAGES });
    const r = await lookupWord(await getDb(), 'und', f);
    assert.equal(r.entry.language, 'German');
  });

  test('Wiktionary being down is unavailable, not not-found', async () => {
    const down = async () => { throw new Error('offline'); };
    assert.equal((await lookupWord(await getDb(), 'word', down, Date.now(), 'en')).status, 'unavailable');
  });
});

describe('settings: clearing data', () => {
  test('clearing the dictionary cache empties it and leaves saved words alone', async () => {
    const db = await getDb();
    await lookupWord(db, 'serendipity', countingFetch(200, ENTRY));
    await saveWord(db, { word: 'serendipity', definition: 'noun — A happy accident.', context: 'ctx', bookId: 1, bookTitle: 'A Book' });
    assert.equal(await countCache(db), 1);
    await clearCache(db);
    assert.equal(await countCache(db), 0);
    assert.equal(await countVault(db), 1);
  });

  test('after clearing, a word is fetched again', async () => {
    const db = await getDb();
    const f = countingFetch(200, ENTRY);
    await lookupWord(db, 'serendipity', f);
    await clearCache(db);
    await lookupWord(db, 'serendipity', f);
    assert.equal(f.calls, 2);
  });

  test('clearing the vault removes every saved word and leaves the cache alone', async () => {
    const db = await getDb();
    await lookupWord(db, 'serendipity', countingFetch(200, ENTRY));
    await saveWord(db, { word: 'a', definition: 'd', context: '1', bookId: 1, bookTitle: 'B' });
    await saveWord(db, { word: 'b', definition: 'd', context: '2', bookId: 1, bookTitle: 'B' });
    await clearVault(db);
    assert.equal(await countVault(db), 0);
    assert.deepEqual(await listVault(db), []);
    assert.equal(await countCache(db), 1);
  });

  test('clearing something that is already empty is harmless', async () => {
    const db = await getDb();
    await clearCache(db);
    await clearVault(db);
    assert.equal(await countCache(db), 0);
    assert.equal(await countVault(db), 0);
  });
});

describe('vault', () => {
  const w = (over = {}) => ({ word: 'serendipity', definition: 'noun — A happy accident.', context: 'It was pure serendipity.', bookId: 1, bookTitle: 'A Book', ...over });

  test('saves a word with its sentence and book, due for review in a day', async () => {
    const db = await getDb();
    assert.equal(await saveWord(db, w(), 1_000), true);
    const row = await db.getFirstAsync('SELECT * FROM vocab_words');
    assert.equal(row.word, 'serendipity');
    assert.equal(row.context, 'It was pure serendipity.');
    assert.equal(row.book_title, 'A Book');
    assert.equal(row.saved_at, 1_000);
    assert.equal(row.next_review, 1_000 + 86_400_000);
    assert.equal(row.interval_days, 1);
    assert.equal(row.ease, 2.5);
  });

  test('saving the same word from the same sentence twice keeps one entry', async () => {
    const db = await getDb();
    assert.equal(await saveWord(db, w()), true);
    assert.equal(await saveWord(db, w()), false);
    assert.equal(await countVault(db), 1);
  });

  test('the same word from a different sentence is a separate entry', async () => {
    const db = await getDb();
    await saveWord(db, w());
    assert.equal(await saveWord(db, w({ context: 'Another sentence entirely.' })), true);
    assert.equal(await countVault(db), 2);
  });

  test('isSaved matches on word and sentence', async () => {
    const db = await getDb();
    await saveWord(db, w());
    assert.equal(await isSaved(db, 'serendipity', 'It was pure serendipity.'), true);
    assert.equal(await isSaved(db, 'serendipity', 'Somewhere else.'), false);
    assert.equal(await isSaved(db, 'other', 'It was pure serendipity.'), false);
  });

  test('lists newest first', async () => {
    const db = await getDb();
    await saveWord(db, w({ word: 'first', context: 'a' }), 1_000);
    await saveWord(db, w({ word: 'second', context: 'b' }), 2_000);
    await saveWord(db, w({ word: 'third', context: 'c' }), 3_000);
    assert.deepEqual((await listVault(db)).map(x => x.word), ['third', 'second', 'first']);
  });

  test('a listed word carries the fields the vault screen shows', async () => {
    const db = await getDb();
    await saveWord(db, w(), 5_000);
    const [item] = await listVault(db);
    assert.deepEqual({ ...item, id: undefined }, { id: undefined, word: 'serendipity', definition: 'noun — A happy accident.', context: 'It was pure serendipity.', bookTitle: 'A Book', savedAt: 5_000 });
  });

  test('removing a word removes only that one', async () => {
    const db = await getDb();
    await saveWord(db, w({ word: 'keep', context: 'a' }));
    await saveWord(db, w({ word: 'drop', context: 'b' }));
    const drop = (await listVault(db)).find(x => x.word === 'drop');
    await removeWord(db, drop.id);
    assert.deepEqual((await listVault(db)).map(x => x.word), ['keep']);
  });

  test('saved words stay, with their book title, after the book is deleted', async () => {
    const db = await getDb();
    const { lastInsertRowId } = await db.runAsync("INSERT INTO books (title, author, format, file_path, file_size, total_words, date_added) VALUES ('A Book', '', 'txt', '/b', 1, 10, 1)");
    await saveWord(db, w({ bookId: lastInsertRowId }));
    await db.runAsync('DELETE FROM books');
    const [item] = await listVault(db);
    assert.equal(item.word, 'serendipity');
    assert.equal(item.bookTitle, 'A Book');
  });
});
