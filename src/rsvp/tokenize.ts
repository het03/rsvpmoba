export type Tokens = {
  words: string[];
  // Indexes of words that end a paragraph (get a longer pause).
  paraEnds: Set<number>;
};

// Word indexes match text.split(/\s+/).filter(Boolean), so TXT positions stay compatible.
export function tokenize(text: string): Tokens {
  const words: string[] = [];
  const paraEnds = new Set<number>();
  for (const para of text.split(/\n\s*\n/)) {
    const ws = para.split(/\s+/).filter(Boolean);
    if (ws.length === 0) continue;
    for (const w of ws) words.push(w);
    paraEnds.add(words.length - 1);
  }
  return { words, paraEnds };
}

// Paragraphs of a plain-text book with the index of each one's first word. Uses the same
// splitting as tokenize(), so these word indexes match RSVP's exactly.
export function splitParagraphs(text: string): {
  paragraphs: { t: string; o: number; n: number }[];
  total: number;
} {
  const paragraphs: { t: string; o: number; n: number }[] = [];
  let offset = 0;
  for (const para of text.split(/\n\s*\n/)) {
    const n = para.split(/\s+/).filter(Boolean).length;
    if (n === 0) continue;
    paragraphs.push({ t: para.trim(), o: offset, n });
    offset += n;
  }
  return { paragraphs, total: offset };
}

// Tokenizes chapters separately so each chapter's first word index is known.
export function tokenizeChapters(texts: string[]): { tokens: Tokens; starts: number[] } {
  const words: string[] = [];
  const paraEnds = new Set<number>();
  const starts: number[] = [];
  for (const text of texts) {
    starts.push(words.length);
    const t = tokenize(text);
    const offset = words.length;
    for (const w of t.words) words.push(w);
    for (const i of t.paraEnds) paraEnds.add(i + offset);
  }
  return { tokens: { words, paraEnds }, starts };
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '—', ndash: '–', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
};

// HTML 4 Latin-1 names for U+00A0–U+00FF in order, so "&eacute;" and friends become real letters.
const LATIN1_NAMES =
  'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute ' +
  'micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring ' +
  'AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times ' +
  'Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave ' +
  'eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave ' +
  'uacute ucirc uuml yacute thorn yuml';
LATIN1_NAMES.split(' ').forEach((name, i) => { ENTITIES[name] = String.fromCharCode(0xa0 + i); });
Object.assign(ENTITIES, {
  nbsp: ' ', thinsp: ' ', ensp: ' ', emsp: ' ', zwnj: '', zwj: '',
  bull: String.fromCharCode(0x2022), trade: String.fromCharCode(0x2122), euro: String.fromCharCode(0x20ac),
  sbquo: String.fromCharCode(0x201a), bdquo: String.fromCharCode(0x201e), dagger: String.fromCharCode(0x2020),
  lsaquo: String.fromCharCode(0x2039), rsaquo: String.fromCharCode(0x203a),
  oelig: String.fromCharCode(0x153), OElig: String.fromCharCode(0x152),
  scaron: String.fromCharCode(0x161), Scaron: String.fromCharCode(0x160),
});

export function htmlToText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<(script|style|svg)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/(p|div|h[1-6]|li|blockquote|tr)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z0-9]+);/gi, (m, n) => ENTITIES[n] ?? ENTITIES[n.toLowerCase()] ?? m);
}
