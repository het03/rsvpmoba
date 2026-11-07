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

export function htmlToText(html: string): string {
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/(p|div|h[1-6]|li|blockquote|tr)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}
