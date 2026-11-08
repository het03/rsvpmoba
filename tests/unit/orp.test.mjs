import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { getOrpRange } from '../../src/rsvp/orp.ts';

const parts = (word) => {
  const [s, e] = getOrpRange(word);
  return [word.slice(0, s), word.slice(s, e), word.slice(e)];
};

describe('getOrpRange', () => {
  test('empty word and single letter', () => {
    assert.deepEqual(getOrpRange(''), [0, 0]);
    assert.deepEqual(parts('x'), ['', 'x', '']);
  });

  test('picks a letter about a third of the way in, by word length', () => {
    assert.equal(parts('an')[1], 'n');         // 2 letters -> 2nd
    assert.equal(parts('hello')[1], 'e');      // up to 5 -> 2nd
    assert.equal(parts('reading')[1], 'a');    // up to 9 -> 3rd
    assert.equal(parts('extraordinary')[1], 'r'); // up to 13 -> 4th
    assert.equal(parts('internationalization')[1], 'r'); // longer -> 5th
  });

  test('skips leading punctuation and quotes', () => {
    assert.equal(parts('"Hello')[1], 'e');
    assert.equal(parts('«Hola»')[1], 'o');
    assert.equal(parts('(42)')[1], '2');
  });

  test('never splits an accented letter from its combining mark', () => {
    const decomposed = 'école';
    const [s, e] = getOrpRange(decomposed);
    const chosen = decomposed.slice(s, e);
    assert.ok(!/^[̀-ͯ]/.test(chosen), 'highlight must not start on a bare accent');
    // if the accented letter is the highlighted one, its accent comes with it
    assert.ok(chosen === 'c' || chosen === 'é');
  });

  test('keeps a Hindi conjunct together', () => {
    const [s, e] = getOrpRange('क्षत्रिय'); // kshatriya
    const chosen = 'क्षत्रिय'.slice(s, e);
    assert.equal(chosen, 'क्ष'); // the whole kssa conjunct, not half of it
  });

  test('keeps a Hindi consonant with its vowel signs', () => {
    const word = 'नमस्ते'; // namaste
    const [s, e] = getOrpRange(word);
    assert.equal(word.slice(s, e), 'स्ते');
  });

  test('keeps a Thai letter with its tone mark', () => {
    const word = 'ก็ได้';
    const [s, e] = getOrpRange(word);
    assert.equal(word.slice(s, e), 'ก็');
  });

  test('never splits an emoji surrogate pair', () => {
    const word = '\u{1F600}\u{1F600}\u{1F600}';
    const [s, e] = getOrpRange(word);
    const chosen = word.slice(s, e);
    assert.ok(chosen.length === 2, 'one emoji is two UTF-16 units');
    assert.equal([...chosen].length, 1);
  });

  test('Hebrew and Arabic words highlight a real letter', () => {
    const hebrew = 'שלום';
    const [hs, he] = getOrpRange(hebrew);
    assert.equal(hebrew.slice(hs, he), 'ל');
    const arabic = 'مرحبا';
    const [as, ae] = getOrpRange(arabic);
    assert.equal(arabic.slice(as, ae), 'ر');
  });

  test('invariants hold for a broad mix of words', () => {
    const words = [
      'a', 'I', 'the', 'quick', 'brown', 'fox’s', "don't", 'well-known', '1984', 'COVID-19', 'café',
      'naïve', 'Über', '中文', 'こんにちは', '한글', '...', '—',
      '¿Qué?', 'مرحبا', 'שלום', 'x́ŷz̃',
      'नमस्ते', '\u{1F44D}\u{1F3FD}ok', 'a'.repeat(60),
    ];
    for (const w of words) {
      const [s, e] = getOrpRange(w);
      assert.ok(s >= 0 && e <= w.length && s <= e, `${w}: range [${s}, ${e}] out of bounds`);
      assert.ok(e > s, `${w}: empty highlight`);
      const code = w.charCodeAt(s);
      assert.ok(!(code >= 0xdc00 && code <= 0xdfff), `${w}: starts on a low surrogate`);
      assert.ok(!/^\p{M}/u.test(w.slice(s, e)), `${w}: starts on a combining mark`);
    }
  });
});
