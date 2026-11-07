const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

const ANCHOR_WORDS = 5;

// Where a selection sits: chapter file + words into that chapter (when the page can tell us).
export type RsvpAnchor = {
  text?: string;
  href?: string | null;
  wordOffset?: number | null;
  wordIndex?: number; // exact index into the whole word list (plain-text books)
};

export function normalizeHref(href: string): string {
  const out: string[] = [];
  let h = href.split('#')[0];
  try { h = decodeURIComponent(h); } catch {}
  for (const part of h.split('/')) {
    if (part === '..') out.pop();
    else if (part && part !== '.') out.push(part);
  }
  return out.join('/');
}

export function findChapter(hrefs: string[], href: string): number {
  const h = normalizeHref(href);
  const exact = hrefs.findIndex(x => x === h);
  if (exact >= 0) return exact;
  return hrefs.findIndex(x => x.endsWith(h) || h.endsWith(x));
}

// Finds where `text` begins within `win` words of `est`; the closest match to `est` wins.
// Falls back to `est` when the text isn't found.
export function findNear(words: string[], est: number, text: string, win: number): number {
  const e = Math.min(words.length - 1, Math.max(0, est));
  const target = text.split(/\s+/).map(norm).filter(Boolean).slice(0, ANCHOR_WORDS);
  if (target.length === 0) return e;

  const lo = Math.max(0, e - win);
  const hi = Math.min(words.length - 1, e + win);

  let best = -1;
  let bestDist = Infinity;
  for (let i = lo; i <= hi; i++) {
    if (norm(words[i]) !== target[0]) continue;
    let j = i + 1;
    let ok = true;
    for (let k = 1; k < target.length; k++) {
      while (j < words.length && norm(words[j]) === '') j++; // skip stray punctuation tokens
      if (j >= words.length || norm(words[j]) !== target[k]) { ok = false; break; }
      j++;
    }
    if (ok) {
      const d = Math.abs(i - e);
      if (d < bestDist) { best = i; bestDist = d; }
    }
  }
  return best >= 0 ? best : e;
}

// Coarse fallback: only a fraction of the book is known, so search a wide window.
export function findAnchor(words: string[], fraction: number, text: string): number {
  const est = Math.round(fraction * words.length);
  return findNear(words, est, text, Math.max(3000, Math.round(words.length * 0.08)));
}
