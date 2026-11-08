// Closing quotes and brackets that can trail punctuation, across scripts: " ' ” ’ “ ‘ » › 」 』 ） ) ] 】 〕 〉 》
// (“ and ‘ close quotes in German and some other languages.)
const CLOSERS = `"'”’“‘»›」』）)\\]】〕〉》`;
// Sentence enders: Latin . ! ? …, CJK 。！？, Arabic/Urdu ؟ ۔, Devanagari । ॥, Armenian ։, Ethiopic ።
const SENTENCE_END = new RegExp(`[.!?…。！？؟۔।॥։።][${CLOSERS}]*$`);
// Clause breaks: , ; : — – plus CJK ，、；： and Arabic ، ؛
const CLAUSE_END = new RegExp(`[,;:—–，、；：،؛][${CLOSERS}]*$`);
const TRAILING_CLOSERS = new RegExp(`[${CLOSERS}]+$`);

// Periods after these don't end a sentence ("Dr. Smith", "e.g. this").
const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'mx', 'dr', 'prof', 'sr', 'jr', 'st', 'mt', 'vs', 'etc', 'inc', 'ltd', 'co', 'corp',
  'no', 'nos', 'fig', 'figs', 'vol', 'pp', 'ed', 'eds', 'approx', 'dept', 'est', 'cf', 'al',
  'gen', 'col', 'capt', 'sgt', 'lt', 'cmdr', 'rev', 'hon', 'gov', 'sen', 'rep',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
]);

function isAbbreviation(stem: string): boolean {
  const s = stem.replace(/^["'“‘(\[]+/, '');
  if (ABBREVIATIONS.has(s.toLowerCase())) return true;
  if (/^\p{Lu}$/u.test(s)) return true; // initials: "J. R. R. Tolkien"
  return /^(?:\p{L}\.)+\p{L}$/u.test(s); // "e.g", "U.S", "a.m"
}

export function isSentenceEnd(word: string): boolean {
  if (!SENTENCE_END.test(word)) return false;
  const core = word.replace(TRAILING_CLOSERS, '');
  if (!core.endsWith('.') || core.endsWith('...')) return true;
  return !isAbbreviation(core.slice(0, -1));
}

export function getPauseMultiplier(word: string, isParaEnd: boolean): number {
  if (isParaEnd) return 4;
  if (isSentenceEnd(word)) return 2.5;
  if (CLAUSE_END.test(word)) return 1.5;
  return 1;
}

function countSyllables(letters: string): number {
  const w = letters.toLowerCase();
  let n = (w.match(/[aeiouy]+/g) ?? []).length;
  if (n > 1 && /[^l]e$/.test(w)) n -= 1; // silent trailing e ("name"), but not "table"
  return Math.max(1, n);
}

// How much longer than the base delay a word deserves, from its length,
// syllables, digits, capitals and compound joiners. Tiny plain words run faster.
export function getWordWeight(word: string): number {
  const core = word.replace(/[^\p{L}\p{N}]/gu, '');
  const letters = core.replace(/\p{N}/gu, '');
  const hasDigits = core.length > letters.length;

  let extra = 0;

  // Length
  const n = core.length;
  if (n > 6) extra += 0.05 * (Math.min(n, 10) - 6);
  if (n > 10) extra += 0.07 * (Math.min(n, 14) - 10);
  if (n > 14) extra += 0.09 * (n - 14);

  // Syllables
  if (letters.length > 0) {
    const groups = countSyllables(letters);
    if (groups > 2) extra += Math.min(0.4, 0.08 * (groups - 2));
  }

  // Digits, capitals, compounds
  if (hasDigits) extra += letters.length > 0 ? 0.22 : 0.3;
  if (letters.length >= 2 && letters === letters.toUpperCase() && letters !== letters.toLowerCase()) extra += 0.14;
  if (/[\p{L}\p{N}][-–—/_][\p{L}\p{N}]/u.test(word)) extra += 0.14;

  if (extra === 0 && n <= 3) return 0.85;
  return Math.min(1.8, 1 + extra);
}

const RAMP_WORDS = 10;

// Eases the first words after play/resume: 1.6x slower, settling to 1x.
export function getRampMultiplier(wordsSinceStart: number): number {
  return 1 + 0.6 * Math.max(0, 1 - wordsSinceStart / RAMP_WORDS);
}

// Start of the current sentence, or of the previous one if already at a start.
export function prevSentenceStart(words: string[], paraEnds: Set<number>, index: number): number {
  const endsAt = (i: number) => isSentenceEnd(words[i]) || paraEnds.has(i);
  const startOf = (i: number) => {
    while (i > 0 && !endsAt(i - 1)) i--;
    return i;
  };
  const cur = startOf(index);
  if (cur < index) return cur;
  return index === 0 ? 0 : startOf(index - 1);
}
