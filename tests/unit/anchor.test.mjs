import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { findAnchor, findChapter, findNear, normalizeHref } from '../../src/rsvp/anchor.ts';

describe('normalizeHref', () => {
  test('strips fragments, decodes, and resolves dot segments', () => {
    assert.equal(normalizeHref('Text/ch1.xhtml#s2'), 'Text/ch1.xhtml');
    assert.equal(normalizeHref('Text/ch%201.xhtml'), 'Text/ch 1.xhtml');
    assert.equal(normalizeHref('../Text/a.xhtml'), 'Text/a.xhtml');
    assert.equal(normalizeHref('./a/./b.xhtml'), 'a/b.xhtml');
    assert.equal(normalizeHref('a//b.xhtml'), 'a/b.xhtml');
  });
  test('a malformed percent sequence does not throw', () => {
    assert.equal(normalizeHref('bad%ZZname.xhtml'), 'bad%ZZname.xhtml');
  });
});

describe('findChapter', () => {
  const hrefs = ['Text/ch 1.xhtml', 'Text/ch2.xhtml', 'cover.xhtml'];
  test('exact and encoded matches', () => {
    assert.equal(findChapter(hrefs, 'Text/ch2.xhtml'), 1);
    assert.equal(findChapter(hrefs, 'Text/ch%201.xhtml#p3'), 0);
  });
  test('matches when one side has an extra folder prefix', () => {
    assert.equal(findChapter(hrefs, 'OEBPS/Text/ch2.xhtml'), 1);
    assert.equal(findChapter(['OEBPS/Text/ch2.xhtml'], 'Text/ch2.xhtml'), 0);
  });
  test('returns -1 when nothing matches', () => {
    assert.equal(findChapter(hrefs, 'nope.xhtml'), -1);
    assert.equal(findChapter([], 'a.xhtml'), -1);
  });
});

describe('findNear', () => {
  const words = Array.from({ length: 1000 }, (_, i) => `w${i % 50}`);
  words.splice(300, 5, 'It', 'was', 'a', 'bright,', 'cold');

  test('finds the selection exactly when the estimate is a little off', () => {
    assert.equal(findNear(words, 305, 'It was a bright, cold', 50), 300);
    assert.equal(findNear(words, 296, 'It was a bright, cold', 50), 300);
  });
  test('ignores case and punctuation when matching', () => {
    assert.equal(findNear(words, 300, 'it WAS a bright cold', 20), 300);
  });
  test('uses only the first five words of a long selection', () => {
    assert.equal(findNear(words, 300, 'It was a bright, cold day in April and then more', 20), 300);
  });
  test('falls back to the estimate when the text is outside the window or absent', () => {
    assert.equal(findNear(words, 700, 'It was a bright, cold', 50), 700);
    assert.equal(findNear(words, 300, 'not in the book', 500), 300);
  });
  test('clamps the estimate into the book', () => {
    assert.equal(findNear(words, -50, 'absent phrase', 10), 0);
    assert.equal(findNear(words, 99999, 'absent phrase', 10), words.length - 1);
  });
  test('an empty selection just returns the estimate', () => {
    assert.equal(findNear(words, 42, '', 10), 42);
    assert.equal(findNear(words, 42, '  \n ', 10), 42);
  });
  test('with several matches, the one closest to the estimate wins', () => {
    const w = ['the', 'x', 'the', 'y', 'the', 'z', 'the'];
    assert.equal(findNear(w, 4, 'the', 6), 4);
    assert.equal(findNear(w, 3, 'the', 6), 2); // tie between 2 and 4: first found wins
    assert.equal(findNear(w, 6, 'the', 6), 6);
  });
  test('skips stray punctuation tokens between matched words', () => {
    const w = ['alpha', '—', 'beta', 'gamma'];
    assert.equal(findNear(w, 0, 'alpha beta gamma', 5), 0);
  });
  test('a match that would run off the end of the book is rejected', () => {
    assert.equal(findNear(['a', 'b'], 1, 'b c d', 5), 1);
  });
});

describe('findAnchor', () => {
  test('searches a wide window around the fractional estimate', () => {
    const words = Array.from({ length: 20000 }, (_, i) => `w${i}`);
    words.splice(12000, 3, 'needle', 'in', 'haystack');
    assert.equal(findAnchor(words, 11800 / words.length, 'needle in haystack'), 12000);
  });
  test('falls back to the estimate when the text is not found', () => {
    const words = Array.from({ length: 1000 }, (_, i) => `w${i}`);
    assert.equal(findAnchor(words, 0.5, 'missing'), 500);
  });
});
