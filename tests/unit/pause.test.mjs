import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  getPauseMultiplier,
  getRampMultiplier,
  getWordWeight,
  isSentenceEnd,
  prevSentenceStart,
} from '../../src/rsvp/pause.ts';

describe('isSentenceEnd', () => {
  test('plain sentence endings', () => {
    for (const w of ['end.', 'really?', 'wow!', 'wait…', 'wait...']) assert.equal(isSentenceEnd(w), true, w);
  });

  test('not a sentence end', () => {
    for (const w of ['word', 'comma,', 'semi;', 'colon:', 'dash—', '']) assert.equal(isSentenceEnd(w), false, w);
  });

  test('closing quotes and brackets after the period still end the sentence', () => {
    for (const w of ['said.”', 'said."', "said.'", 'said.)', 'said.]', 'fin.»', 'Ende.“', 'Ende.‘', '言った。」'])
      assert.equal(isSentenceEnd(w), true, w);
  });

  test('abbreviations do not end a sentence', () => {
    for (const w of ['Dr.', 'Mr.', 'Mrs.', 'Prof.', 'etc.', 'vs.', 'e.g.', 'i.e.', 'U.S.', 'a.m.', 'J.', 'R.', 'Jan.', 'Sept.'])
      assert.equal(isSentenceEnd(w), false, w);
  });

  test('an abbreviation followed by ! or ? is still an ending', () => {
    assert.equal(isSentenceEnd('Dr!'), true);
    assert.equal(isSentenceEnd('etc?'), true);
  });

  test('sentence ends in other scripts', () => {
    const enders = ['終わり。', '你好！', '你好？', 'كيف؟', 'है।', 'है॥', 'ըն։', 'ሰላር፣'.replace('፣', '።')];
    for (const w of enders) assert.equal(isSentenceEnd(w), true, w);
  });
});

describe('getPauseMultiplier', () => {
  test('paragraph end beats everything', () => {
    assert.equal(getPauseMultiplier('word', true), 4);
    assert.equal(getPauseMultiplier('end.', true), 4);
  });
  test('sentence, clause, plain', () => {
    assert.equal(getPauseMultiplier('end.', false), 2.5);
    assert.equal(getPauseMultiplier('comma,', false), 1.5);
    assert.equal(getPauseMultiplier('word', false), 1);
  });
  test('clause breaks in other scripts', () => {
    for (const w of ['你好，', 'これ、', 'مرحبا،', 'الله؛'])
      assert.equal(getPauseMultiplier(w, false), 1.5, w);
  });
  test('an abbreviation gets no sentence pause', () => {
    assert.equal(getPauseMultiplier('Dr.', false), 1);
  });
});

describe('getWordWeight', () => {
  test('short plain words run faster than average', () => {
    for (const w of ['a', 'the', 'is', 'of']) assert.equal(getWordWeight(w), 0.85, w);
  });
  test('ordinary words are normal speed', () => {
    for (const w of ['table', 'name', 'house', 'reading'.slice(0, 6)]) assert.ok(getWordWeight(w) >= 1 && getWordWeight(w) < 1.1, w);
  });
  test('longer words take longer, and it never decreases with length', () => {
    let previous = 0;
    for (const w of ['table', 'reading', 'everything', 'understanding', 'incomprehensibility']) {
      const weight = getWordWeight(w);
      assert.ok(weight >= previous, `${w}: ${weight} < ${previous}`);
      previous = weight;
    }
  });
  test('numbers, all-caps and compounds get extra time', () => {
    assert.ok(getWordWeight('1984') >= 1.3);
    assert.ok(getWordWeight('NASA') > 1.1);
    assert.ok(getWordWeight('well-known') > getWordWeight('wellknown'));
    assert.ok(getWordWeight('COVID-19') > getWordWeight('COVID'));
  });
  test('always stays between 0.85 and 1.8, even for absurd input', () => {
    for (const w of ['', '...', 'a'.repeat(500), '9'.repeat(100), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ-ABC', '\u{1F600}', '中文'.repeat(40)]) {
      const weight = getWordWeight(w);
      assert.ok(weight >= 0.85 && weight <= 1.8, `${JSON.stringify(w.slice(0, 20))}: ${weight}`);
    }
  });
});

describe('getRampMultiplier', () => {
  test('starts slow, settles to normal after 10 words', () => {
    assert.ok(Math.abs(getRampMultiplier(0) - 1.6) < 1e-9);
    assert.equal(getRampMultiplier(10), 1);
    assert.equal(getRampMultiplier(500), 1);
  });
  test('speeds up steadily', () => {
    let previous = Infinity;
    for (let i = 0; i <= 10; i++) {
      const m = getRampMultiplier(i);
      assert.ok(m <= previous);
      previous = m;
    }
  });
});

describe('prevSentenceStart', () => {
  const words = 'Dr. Smith went home. He slept well. Then he woke.'.split(' ');
  const none = new Set();

  test('from mid-sentence, goes to that sentence’s first word', () => {
    assert.equal(prevSentenceStart(words, none, 5), 4); // "slept" -> "He"
    assert.equal(prevSentenceStart(words, none, 6), 4); // "well." -> "He"
  });
  test('from a sentence start, goes to the previous sentence’s start', () => {
    assert.equal(prevSentenceStart(words, none, 4), 0); // "He" -> "Dr."
    assert.equal(prevSentenceStart(words, none, 7), 4); // "Then" -> "He"
  });
  test('does not treat "Dr." as a sentence boundary', () => {
    assert.equal(prevSentenceStart(words, none, 2), 0);
  });
  test('stops at the start of the book', () => {
    assert.equal(prevSentenceStart(words, none, 0), 0);
    assert.equal(prevSentenceStart(words, none, 1), 0);
  });
  test('paragraph ends count as boundaries too', () => {
    const w = ['one', 'two', 'three', 'four', 'five'];
    assert.equal(prevSentenceStart(w, new Set([1]), 4), 2);
    assert.equal(prevSentenceStart(w, new Set([1]), 2), 0);
  });
});
