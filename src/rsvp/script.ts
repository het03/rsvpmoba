// Script detection for RSVP's word layout and for refusing books it can't present well.

// Builds a character class from [from, to] code point pairs (kept as numbers so the ranges are unambiguous).
function charClass(ranges: [number, number][]): RegExp {
  const hex = (n: number) => String.fromCharCode(n);
  return new RegExp(`[${ranges.map(([a, b]) => `${hex(a)}-${hex(b)}`).join('')}]`);
}

// Right-to-left scripts: Hebrew, Arabic, Syriac, Thaana, N'Ko, Arabic Extended, and presentation forms.
export const RTL_RE = charClass([
  [0x0590, 0x08ff],
  [0xfb1d, 0xfdff],
  [0xfe70, 0xfeff],
]);

// Cursive scripts whose letters change shape depending on their neighbours. Splitting a word into
// separate text pieces would break the joining, so these are drawn as one piece instead.
export const CURSIVE_RE = charClass([
  [0x0600, 0x077f], // Arabic, Syriac, Arabic Supplement
  [0x08a0, 0x08ff], // Arabic Extended
  [0xfb50, 0xfdff],
  [0xfe70, 0xfeff],
]);

// Scripts written without spaces between words: Thai, Lao, Myanmar, Khmer, Japanese kana, Chinese characters.
const UNSPACED_RE = charClass([
  [0x0e00, 0x0eff], // Thai, Lao
  [0x1000, 0x109f], // Myanmar
  [0x1780, 0x17ff], // Khmer
  [0x3040, 0x30ff], // Hiragana, Katakana
  [0x3400, 0x4dbf], // CJK Extension A
  [0x4e00, 0x9fff], // CJK Unified Ideographs
  [0xf900, 0xfaff], // CJK Compatibility Ideographs
]);

// True when the book is mostly long unspaced runs of text (Chinese, Japanese, Thai...), which RSVP can't split
// into words yet. A sample is enough; this avoids scanning a whole book.
export function isUnsupportedBook(words: string[]): boolean {
  const n = words.length;
  if (n === 0) return false;
  const step = Math.max(1, Math.floor(n / 4000));
  let seen = 0;
  let long = 0;
  for (let i = 0; i < n; i += step) {
    seen++;
    const w = words[i];
    if (w.length > 12 && UNSPACED_RE.test(w)) long++;
  }
  return long / seen > 0.15;
}
