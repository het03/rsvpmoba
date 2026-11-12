import { isSentenceEnd } from '@/rsvp/pause';

export const MAX_SENTENCE = 400;

/**
 * The sentence of `text` that contains the character at `offset`, using the same sentence-end rules as RSVP
 * (so "Dr." and "e.g." don't split a sentence). Very long sentences are cut to a window around the word, marked with
 * an ellipsis. Whitespace is collapsed; empty text gives ''.
 */
export function extractSentence(text: string, offset: number, max: number = MAX_SENTENCE): string {
  const tokens = [...text.matchAll(/\S+/g)].map(m => ({ word: m[0], start: m.index!, end: m.index! + m[0].length }));
  if (tokens.length === 0) return '';

  let at = tokens.findIndex(t => offset < t.end);
  if (at === -1) at = tokens.length - 1;

  let from = at;
  while (from > 0 && !isSentenceEnd(tokens[from - 1].word)) from--;
  let to = at;
  while (to < tokens.length - 1 && !isSentenceEnd(tokens[to].word)) to++;

  const sentence = text.slice(tokens[from].start, tokens[to].end).replace(/\s+/g, ' ');
  if (sentence.length <= max) return sentence;

  // Where the chosen word starts inside the (whitespace-collapsed) sentence.
  const wordStart = text.slice(tokens[from].start, tokens[at].start).replace(/\s+/g, ' ').length;
  const start = Math.min(Math.max(0, wordStart - Math.floor(max / 2)), sentence.length - max);
  const end = start + max;
  return `${start > 0 ? '…' : ''}${sentence.slice(start, end).trim()}${end < sentence.length ? '…' : ''}`;
}
