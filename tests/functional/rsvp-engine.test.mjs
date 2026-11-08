// The RSVP engine end to end: text -> words -> per-word timing, and the properties that make it feel right.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { getOrpRange } from '../../src/rsvp/orp.ts';
import { getPauseMultiplier, getRampMultiplier, getWordWeight, prevSentenceStart } from '../../src/rsvp/pause.ts';
import { isUnsupportedBook } from '../../src/rsvp/script.ts';
import { tokenize } from '../../src/rsvp/tokenize.ts';
import { readSource } from '../helpers/source.mjs';

const PROSE = `It was a bright cold day in April, and the clocks were striking thirteen. Winston Smith, his chin nuzzled into his breast in an effort to escape the vile wind, slipped quickly through the glass doors of Victory Mansions, though not quickly enough to prevent a swirl of gritty dust from entering along with him.

The hallway smelt of boiled cabbage and old rag mats. At one end of it a coloured poster, too large for indoor display, had been tacked to the wall. It depicted simply an enormous face, more than a metre wide: the face of a man of about forty-five, with a heavy black moustache and ruggedly handsome features.

Dr. Smith went home. "Really?" he asked. Yes!`;

// The same formula RsvpReader uses for how long each word stays on screen.
const delay = (word, isParaEnd, wpm, sinceStart = 99) =>
  (60000 / wpm) * getPauseMultiplier(word, isParaEnd) * getWordWeight(word) * getRampMultiplier(sinceStart);

const playTime = (text, wpm, withRamp = false) => {
  const { words, paraEnds } = tokenize(text);
  let ms = 0;
  words.forEach((w, i) => { ms += delay(w, paraEnds.has(i), wpm, withRamp ? i : 99); });
  return { words, ms };
};

describe('timing', () => {
  test('RsvpReader still uses this exact formula', () => {
    const src = readSource('src/components/Reader/RsvpReader.tsx');
    assert.match(src, /\(60000 \/ wpm\)\s*\*\s*getPauseMultiplier\(words\[index\], paraEnds\.has\(index\)\)\s*\*\s*getWordWeight\(words\[index\]\)\s*\*\s*getRampMultiplier\(rampCount\.current\)/);
  });

  test('higher speed always means less time', () => {
    let previous = Infinity;
    for (const wpm of [100, 200, 300, 400, 600, 800, 1000]) {
      const { ms } = playTime(PROSE, wpm);
      assert.ok(ms < previous, `${wpm} wpm`);
      previous = ms;
    }
  });

  test('time scales inversely with speed', () => {
    const slow = playTime(PROSE, 200).ms;
    const fast = playTime(PROSE, 400).ms;
    assert.ok(Math.abs(slow / fast - 2) < 1e-9);
  });

  test('real prose reads at roughly the chosen speed (pauses cost some, short words give some back)', () => {
    const { words, ms } = playTime(PROSE, 300);
    const effective = words.length / (ms / 60000);
    assert.ok(effective > 180 && effective < 330, `effective ${Math.round(effective)} wpm`);
  });

  test('paragraph ends are the longest pauses, then sentences, then commas', () => {
    const base = delay('word', false, 300);
    assert.ok(delay('word', true, 300) > delay('end.', false, 300));
    assert.ok(delay('end.', false, 300) > delay('comma,', false, 300));
    assert.ok(delay('comma,', false, 300) > base);
  });

  test('the ramp-up makes the first words slower and settles quickly', () => {
    const cold = playTime(PROSE, 300, true).ms;
    const warm = playTime(PROSE, 300, false).ms;
    assert.ok(cold > warm);
    assert.ok((cold - warm) / warm < 0.03, 'the ramp should only add a few percent over a whole chapter');
  });

  test('every delay is positive, finite, and sensible at every speed', () => {
    const { words, paraEnds } = tokenize(PROSE);
    for (const wpm of [100, 1000]) {
      words.forEach((w, i) => {
        const d = delay(w, paraEnds.has(i), wpm, i % 15);
        assert.ok(Number.isFinite(d) && d > 0 && d < 60000 / wpm * 12, `${w} @${wpm}: ${d}`);
      });
    }
  });
});

describe('what appears on screen', () => {
  test('every word of a realistic text has a valid highlighted letter', () => {
    for (const w of tokenize(PROSE).words) {
      const [s, e] = getOrpRange(w);
      assert.ok(s >= 0 && e <= w.length && e > s, w);
    }
  });

  test('"Previous sentence" walks back through the passage one sentence at a time', () => {
    const { words, paraEnds } = tokenize(PROSE);
    let index = words.length - 1;
    const stops = [];
    for (let i = 0; i < 40 && index > 0; i++) {
      const next = prevSentenceStart(words, paraEnds, index);
      assert.ok(next < index, 'must always move backwards');
      stops.push(next);
      index = next;
    }
    assert.equal(index, 0, 'reaches the start of the book');
    // "Dr. Smith went home." must be one sentence, not two
    const dr = words.indexOf('Dr.');
    assert.ok(!stops.includes(dr + 1), 'no stop between "Dr." and "Smith"');
  });

  test('a normal English book is supported', () => {
    assert.equal(isUnsupportedBook(tokenize(PROSE).words), false);
  });
});

describe('robustness', () => {
  test('strange text never breaks tokenizing, timing or the highlighted letter', () => {
    const nasty = [
      '', '   ', '\n\n\n', '\u0000\u0001', 'a'.repeat(10000), '\u{1F600} '.repeat(50), '...,,,;;;!!!???',
      'مرحبا שלום नमस्ते 中文 こんにちは',
      '"""\'\'\'((()))', '1 2 3 4 5 6 7 8 9 10', 'x́̂̃̄̅',
    ];
    for (const text of nasty) {
      const { words, paraEnds } = tokenize(text);
      words.forEach((w, i) => {
        const [s, e] = getOrpRange(w);
        assert.ok(s >= 0 && s <= e && e <= w.length);
        const d = delay(w, paraEnds.has(i), 300);
        assert.ok(Number.isFinite(d) && d > 0);
      });
    }
  });

  test('a 200,000-word book tokenizes and times in reasonable time', () => {
    const big = (PROSE + '\n\n').repeat(Math.ceil(200000 / tokenize(PROSE).words.length));
    const started = performance.now();
    const { words, paraEnds } = tokenize(big);
    let ms = 0;
    words.forEach((w, i) => { ms += delay(w, paraEnds.has(i), 300); });
    assert.ok(words.length >= 200000);
    assert.ok(performance.now() - started < 3000, 'should handle a very long book in a few seconds');
    assert.ok(ms > 0);
  });
});
