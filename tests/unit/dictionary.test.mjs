import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { cleanWord, detectScript, firstWord, MAX_MEANINGS, parseWiktionary, stripHtml, summarize } from '../../src/lib/dictionary.ts';

describe('cleanWord', () => {
  test('strips punctuation and lower-cases', () => {
    assert.equal(cleanWord('“Serendipity,”'), 'serendipity');
    assert.equal(cleanWord('  Word. '), 'word');
  });

  test('keeps apostrophes and hyphens inside a word, and normalises curly apostrophes', () => {
    assert.equal(cleanWord("don't"), "don't");
    assert.equal(cleanWord('don’t'), "don't");
    assert.equal(cleanWord('well-known,'), 'well-known');
  });

  test('a multi-word selection uses the first word', () => {
    assert.equal(cleanWord('ice cream cone'), 'ice');
  });

  test('accented letters are kept', () => {
    assert.equal(cleanWord('Café!'), 'café');
  });

  test('other scripts are words too: Korean, Arabic with marks, Hindi with vowel signs, Hebrew', () => {
    assert.equal(cleanWord('사랑,'), '사랑');
    assert.equal(cleanWord('«كِتَاب»'), 'كِتَاب');
    assert.equal(cleanWord('किताब।'), 'किताब');
    assert.equal(cleanWord('(ספר)'), 'ספר');
  });

  test('firstWord keeps the case the word was typed in', () => {
    assert.equal(firstWord('“Haus,”'), 'Haus');
    assert.equal(cleanWord('“Haus,”'), 'haus');
  });

  test('no word at all gives an empty string', () => {
    assert.equal(cleanWord(''), '');
    assert.equal(cleanWord('— … 123'), '');
  });
});

describe('detectScript', () => {
  test('picks the Wiktionary language from the script', () => {
    assert.deepEqual(detectScript('사랑'), { preferred: 'ko', latin: false });
    assert.deepEqual(detectScript('كتاب'), { preferred: 'ar', latin: false });
    assert.deepEqual(detectScript('किताब'), { preferred: 'hi', latin: false });
    assert.deepEqual(detectScript('ספר'), { preferred: 'he', latin: false });
  });

  test('Latin script, including accented letters, tries English first', () => {
    assert.deepEqual(detectScript('serendipity'), { preferred: 'en', latin: true });
    assert.deepEqual(detectScript('café'), { preferred: 'en', latin: true });
    assert.deepEqual(detectScript('über'), { preferred: 'en', latin: true });
  });

  test('an unlisted script has no preference', () => {
    assert.deepEqual(detectScript('привет'), { preferred: null, latin: false });
  });
});

describe('stripHtml', () => {
  test('removes tags and keeps their text', () => {
    assert.equal(stripHtml('<a rel="mw:WikiLink" href="/wiki/love" title="love">love</a>; <a href="/wiki/affection">affection</a>'), 'love; affection');
  });

  test('decodes entities, named and numeric', () => {
    assert.equal(stripHtml('Tom &amp; Jerry &lt;3 &quot;hi&quot; &#39;x&#39; &#x41;&nbsp;B'), 'Tom & Jerry <3 "hi" \'x\' A B');
  });

  test('list items and line breaks become spaces, not run-together words', () => {
    assert.equal(stripHtml('<ol><li>first sense</li><li>second sense</li></ol>'), 'first sense second sense');
    assert.equal(stripHtml('one<br>two'), 'one two');
  });

  test('leaves unknown entities alone and collapses whitespace', () => {
    assert.equal(stripHtml('a &bogus; b'), 'a &bogus; b');
    assert.equal(stripHtml('  a \n  b  '), 'a b');
  });

  test('an invalid code point is left as is instead of throwing', () => {
    assert.equal(stripHtml('x &#99999999; y'), 'x &#99999999; y');
  });
});

describe('parseWiktionary', () => {
  const ko = {
    ko: [
      { partOfSpeech: 'Noun', language: 'Korean', definitions: [{ definition: '<a href="/wiki/love">love</a>; <a href="/wiki/affection">affection</a>' }] },
      { partOfSpeech: 'Noun', language: 'Korean', definitions: [{ definition: 'a second noun sense' }] },
      { partOfSpeech: 'Verb', language: 'Korean', definitions: [{ definition: '' }, { definition: 'to love' }] },
    ],
  };

  test('shapes the preferred language: stripped text, lower-cased part of speech, one per part of speech', () => {
    const e = parseWiktionary(ko, 'ko', '사랑');
    assert.equal(e.word, '사랑');
    assert.equal(e.language, 'Korean');
    assert.equal(e.phonetic, '');
    assert.deepEqual(e.meanings, [
      { partOfSpeech: 'noun', definition: 'love; affection' },
      { partOfSpeech: 'verb', definition: 'to love' },
    ]);
  });

  test('uses the preferred language when the page has several', () => {
    const page = { other: [{ partOfSpeech: 'Noun', language: 'Algerian Arabic', definitions: [{ definition: 'dialect sense' }] }], arz: [{ partOfSpeech: 'Noun', language: 'Egyptian Arabic', definitions: [{ definition: 'egyptian sense' }] }], ar: [{ partOfSpeech: 'Noun', language: 'Arabic', definitions: [{ definition: 'book' }] }] };
    const e = parseWiktionary(page, 'ar', 'كتاب');
    assert.equal(e.language, 'Arabic');
    assert.equal(e.meanings[0].definition, 'book');
  });

  test('without the preferred language it takes the first real one, never "other"', () => {
    const page = { other: [{ partOfSpeech: 'Noun', language: 'Odd', definitions: [{ definition: 'x' }] }], fa: [{ partOfSpeech: 'Noun', language: 'Persian', definitions: [{ definition: 'book' }] }] };
    assert.equal(parseWiktionary(page, 'ar', 'w').language, 'Persian');
    assert.equal(parseWiktionary({ other: page.other }, 'ar', 'w'), null);
  });

  test('an example comes with its translation when there is one', () => {
    const page = { hi: [{ partOfSpeech: 'Noun', language: 'Hindi', definitions: [{ definition: 'book', parsedExamples: [{ example: 'मैं <b>किताब</b> पढ़ता हूँ।', translation: 'I read a <b>book</b>.' }] }] }] };
    assert.equal(parseWiktionary(page, 'hi', 'किताब').meanings[0].example, 'मैं किताब पढ़ता हूँ। — I read a book.');
  });

  test('strict: a missing preferred language is a miss, not another language', () => {
    const page = { bar: [{ partOfSpeech: 'Noun', language: 'Bavarian', definitions: [{ definition: 'house' }] }] };
    assert.equal(parseWiktionary(page, 'de', 'Haus', true), null);
    assert.equal(parseWiktionary(page, 'de', 'Haus', false).language, 'Bavarian');
    assert.equal(parseWiktionary({ de: [{ partOfSpeech: 'Noun', language: 'German', definitions: [{ definition: 'house' }] }] }, 'de', 'Haus', true).language, 'German');
  });

  test('Translingual entries (symbols, ISO codes) come after the real language, not before it', () => {
    const page = {
      en: [
        { partOfSpeech: 'Symbol', language: 'Translingual', definitions: [{ definition: 'ISO 639-3 language code for Chitwania Tharu.' }] },
        { partOfSpeech: 'Article', language: 'English', definitions: [{ definition: 'Definite article' }] },
        { partOfSpeech: 'Adverb', language: 'English', definitions: [{ definition: 'By that much' }] },
      ],
    };
    const e = parseWiktionary(page, 'en', 'the');
    assert.equal(e.language, 'English');
    assert.deepEqual(e.meanings.map(m => m.partOfSpeech), ['article', 'adverb']);
  });

  test('a page that is only Translingual still gives that, rather than nothing', () => {
    const page = { en: [{ partOfSpeech: 'Symbol', language: 'Translingual', definitions: [{ definition: 'a symbol' }] }] };
    const e = parseWiktionary(page, 'en', 'x');
    assert.equal(e.language, 'Translingual');
    assert.equal(e.meanings[0].definition, 'a symbol');
  });

  test('is capped at MAX_MEANINGS', () => {
    const page = { en: ['a', 'b', 'c', 'd', 'e'].map(p => ({ partOfSpeech: p, language: 'English', definitions: [{ definition: p }] })) };
    assert.equal(parseWiktionary(page, 'en', 'x').meanings.length, MAX_MEANINGS);
  });

  test('anything that is not a usable page gives null', () => {
    assert.equal(parseWiktionary(null, 'ko', 'x'), null);
    assert.equal(parseWiktionary([], 'ko', 'x'), null);
    assert.equal(parseWiktionary({}, 'ko', 'x'), null);
    assert.equal(parseWiktionary({ ko: [] }, 'ko', 'x'), null);
    assert.equal(parseWiktionary({ ko: [{ partOfSpeech: 'Noun', definitions: [{ definition: '<span></span>' }] }] }, 'ko', 'x'), null);
  });
});

describe('summarize', () => {
  test('part of speech and definition on one line', () => {
    const e = parseWiktionary({ en: [{ partOfSpeech: 'Verb', language: 'English', definitions: [{ definition: 'To move quickly on foot.' }] }] }, 'en', 'run');
    assert.equal(summarize(e), 'verb — To move quickly on foot.');
  });

  test('no part of speech: just the definition', () => {
    assert.equal(summarize({ word: 'x', phonetic: '', meanings: [{ partOfSpeech: '', definition: 'plain' }] }), 'plain');
  });
});
