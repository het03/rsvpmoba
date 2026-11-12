import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { extractSentence } from '../../src/lib/sentence.ts';

const text = 'It was late. Dr. Smith opened the door slowly. Nobody answered! He waited.';
const at = (needle) => text.indexOf(needle);

describe('extractSentence', () => {
  test('returns the sentence the offset is in', () => {
    assert.equal(extractSentence(text, at('late')), 'It was late.');
    assert.equal(extractSentence(text, at('door')), 'Dr. Smith opened the door slowly.');
    assert.equal(extractSentence(text, at('Nobody')), 'Nobody answered!');
    assert.equal(extractSentence(text, at('waited')), 'He waited.');
  });

  test('an abbreviation does not end the sentence', () => {
    assert.equal(extractSentence(text, at('Smith')), 'Dr. Smith opened the door slowly.');
  });

  test('the first and last words work, and an offset past the end uses the last sentence', () => {
    assert.equal(extractSentence(text, 0), 'It was late.');
    assert.equal(extractSentence(text, text.length - 1), 'He waited.');
    assert.equal(extractSentence(text, 9999), 'He waited.');
  });

  test('an offset on the space between words uses the next word', () => {
    assert.equal(extractSentence(text, at('late.') + 5), 'Dr. Smith opened the door slowly.');
  });

  test('line breaks and runs of spaces collapse to single spaces', () => {
    assert.equal(extractSentence('One  two\nthree   four.', 5), 'One two three four.');
  });

  test('text with no sentence end is returned whole', () => {
    assert.equal(extractSentence('just a fragment', 7), 'just a fragment');
  });

  test('empty text gives an empty string', () => {
    assert.equal(extractSentence('', 0), '');
    assert.equal(extractSentence('   ', 1), '');
  });

  test('a very long sentence is cut to a window around the word, with ellipses', () => {
    const long = Array.from({ length: 300 }, (_, i) => `word${i}`).join(' ') + '.';
    const mid = long.indexOf('word150');
    const out = extractSentence(long, mid, 100);
    assert.ok(out.length <= 102, `length ${out.length}`);
    assert.ok(out.startsWith('…') && out.endsWith('…'));
    assert.ok(out.includes('word150'));
  });

  test('a long sentence cut at the start only has a trailing ellipsis', () => {
    const long = Array.from({ length: 300 }, (_, i) => `word${i}`).join(' ') + '.';
    const out = extractSentence(long, 0, 100);
    assert.ok(out.startsWith('word0') && out.endsWith('…') && !out.startsWith('…'));
  });
});
