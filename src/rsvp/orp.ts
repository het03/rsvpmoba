// Combining marks (accents, Indic vowel signs, Thai tone marks) and joiners belong to the letter before them.
const MARK = /[\p{M}‌‍]/u;
// After these the next letter is fused into the same visual unit (Indic conjuncts, emoji joined with ZWJ).
const JOIN_NEXT = /[्্੍્୍்్್്්្ᐹ‍]/;

const isHigh = (c: number) => c >= 0xd800 && c <= 0xdbff;
const isLow = (c: number) => c >= 0xdc00 && c <= 0xdfff;

// The whole visual character containing UTF-16 index i, as [start, end): never splits a surrogate pair,
// a base letter from its combining marks, or an Indic conjunct.
function clusterAt(word: string, i: number): [number, number] {
  const back = (p: number) => {
    while (p > 0 && (isLow(word.charCodeAt(p)) || MARK.test(word[p]))) p--;
    return p;
  };
  let s = back(i);
  // A letter that follows a virama is the second half of a conjunct, so the unit starts earlier.
  while (s > 0 && JOIN_NEXT.test(word[s - 1])) s = back(s - 1);
  let e = s + (isHigh(word.charCodeAt(s)) ? 2 : 1);
  while (e < word.length) {
    if (MARK.test(word[e]) || isLow(word.charCodeAt(e))) {
      e++;
    } else if (JOIN_NEXT.test(word[e - 1])) {
      e += isHigh(word.charCodeAt(e)) ? 2 : 1;
    } else {
      break;
    }
  }
  return [s, Math.min(e, word.length)];
}

// Range [start, end) of the Optimal Recognition Point character to highlight.
export function getOrpRange(word: string): [number, number] {
  if (!word) return [0, 0];
  const leading = word.match(/^[^\p{L}\p{N}]*/u)?.[0].length ?? 0;
  const core = word.slice(leading).match(/^[\p{L}\p{M}\p{N}'’-]*/u)?.[0].length ?? 0;
  const offset = core <= 1 ? 0 : core <= 5 ? 1 : core <= 9 ? 2 : core <= 13 ? 3 : 4;
  return clusterAt(word, Math.min(word.length - 1, leading + offset));
}
