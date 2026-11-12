// Loads the reader pages' real in-page code into jsdom (a simulated browser) so it can be tested.
import { JSDOM } from 'jsdom';
import { EPUBJS_SRC, JSZIP_SRC } from '../../src/lib/epubLibs.generated.ts';
import { readSource } from './source.mjs';

export { EPUBJS_SRC, JSZIP_SRC };

const THEME = { bg: '#ffffff', fg: '#111111', link: null };
const PREFS = { fontSize: 17, lineHeight: 1.7, theme: 'light', brightness: 1 };

// ── Page HTML, produced by the app's own template code ────────────────────────────────────────────────

export function buildTxtHtml(paragraphs, { total, initialWord = 0, highlightWord, theme = THEME, prefs = PREFS } = {}) {
  const src = readSource('src/components/Reader/TxtReader.tsx');
  const start = src.indexOf('const data = JSON.stringify(paragraphs)');
  const end = src.indexOf('</html>`;', start) + '</html>`;'.length;
  const build = new Function('paragraphs', 'total', 't', 'prefs', 'initialWord', 'highlightWord', src.slice(start, end));
  const sum = paragraphs.reduce((n, p) => n + p.n, 0);
  return build(paragraphs, total ?? sum, theme, prefs, initialWord, highlightWord);
}

export function buildEpubHtml({ theme = THEME, prefs = PREFS, epubSrc = 'file:///book.epub', initialPct = 0, cachedLocations = null, highlight = null } = {}) {
  const src = readSource('src/components/Reader/EpubReader.tsx');
  const start = src.indexOf('return `<!DOCTYPE html>') + 'return `'.length;
  const end = src.indexOf('</html>`;', start) + '</html>'.length;
  const DENOM = 1000;
  const t = theme;
  // eslint-disable-next-line no-eval
  return eval('`' + src.slice(start, end) + '`');
}

export const inlineScripts = (html) => [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

// ── A TXT page running in jsdom, with a simple fake layout ────────────────────────────────────────────

// jsdom does no layout, so the page's measurements are faked: each <p> is `paragraphHeight` tall, stacked
// below 24px of padding, in a viewport `viewport` px tall. Timers are queued so tests control when they fire.
export function openTxtPage(paragraphs, options = {}) {
  const { paragraphHeight = 100, viewport = 600, ...pageOptions } = options;
  const html = buildTxtHtml(paragraphs, pageOptions);
  const posts = [];
  const timers = [];
  const state = { scrollTop: 0, scrollHeight: 24 + paragraphs.length * paragraphHeight + 96 };
  let nextId = 1;

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.ReactNativeWebView = { postMessage: (m) => posts.push(JSON.parse(m)) };
      Object.defineProperty(window, 'innerHeight', { value: viewport, configurable: true });
      Object.defineProperty(window.Element.prototype, 'scrollTop', {
        get: () => state.scrollTop,
        set: (v) => { state.scrollTop = Number(v); },
        configurable: true,
      });
      Object.defineProperty(window.Element.prototype, 'scrollHeight', { get: () => state.scrollHeight, configurable: true });
      Object.defineProperty(window.Document.prototype, 'scrollingElement', {
        get() { return this.documentElement; },
        configurable: true,
      });
      Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', {
        get() { return this.nodeName === 'P' ? paragraphHeight : 0; },
        configurable: true,
      });
      window.Element.prototype.getBoundingClientRect = function rect() {
        const index = this.nodeName === 'P' ? Number(this.getAttribute('data-i')) : 0;
        const top = this.nodeName === 'P' ? 24 + index * paragraphHeight - state.scrollTop : 0;
        return { top, bottom: top, left: 0, right: 0, width: 0, height: this.nodeName === 'P' ? paragraphHeight : 0 };
      };
      window.setTimeout = (fn, ms = 0) => { const id = nextId++; timers.push({ id, fn, ms }); return id; };
      window.clearTimeout = (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); };
    },
  });

  const { window } = dom;
  return {
    window,
    document: window.document,
    posts,
    state,
    paragraphElements: () => [...window.document.querySelectorAll('p')],
    // Fires every queued timer (and any they queue), as if time passed.
    flush() {
      for (let round = 0; round < 20 && timers.length; round++) {
        const due = timers.splice(0).sort((a, b) => a.ms - b.ms || a.id - b.id);
        for (const t of due) t.fn();
      }
    },
    pendingTimers: () => timers.length,
    scrollTo(y) {
      state.scrollTop = y;
      window.dispatchEvent(new window.Event('scroll'));
    },
    send(message) {
      window.dispatchEvent(new window.MessageEvent('message', { data: typeof message === 'string' ? message : JSON.stringify(message) }));
    },
    // Selects text inside a paragraph from character `from` to `to` and fires the browser's selection event.
    select(paragraphIndex, from, to) {
      const p = window.document.querySelectorAll('p')[paragraphIndex];
      const range = window.document.createRange();
      range.setStart(p.firstChild, from);
      range.setEnd(p.firstChild, to);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      window.document.dispatchEvent(new window.Event('selectionchange'));
    },
  };
}

// ── The EPUB page's word-extraction helpers, run on any document ──────────────────────────────────────

// Pulls the helper functions out of the EPUB page script (they don't depend on epub.js) and returns them
// bound to a jsdom window. `spineItems` stands in for epub.js's list of chapters.
export function loadEpubHelpers(window, spineItems = []) {
  const src = readSource('src/components/Reader/EpubReader.tsx');
  const words = src.slice(src.indexOf('var BLOCKS'), src.indexOf('// Jump to a word'));
  const hrefs = src.slice(src.indexOf('function normText'), src.indexOf('// Jump to a word (chapter + word offset'));
  // The TypeScript source holds the script inside a template string, so "\\n" there means "\n" in the page.
  const unescape = (s) => s.replace(/\\\\/g, '\\');
  window.book = { spine: { spineItems } };
  window.eval(`${unescape(hrefs)}\n${unescape(words)}\nwindow.__helpers = { normText, normHref, findSpineItem, extractWords, wordIndexAtPoint, wrapWord };`);
  return window.__helpers;
}

// runScripts: 'outside-only' lets the tests run the page's helper code inside the simulated window.
export const htmlDoc = (body) => new JSDOM(
  `<!DOCTYPE html><html><head><title>Hidden title</title></head><body>${body}</body></html>`,
  { runScripts: 'outside-only' },
).window;
export const xhtmlDoc = (body) => new JSDOM(
  `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Hidden title</title></head><body>${body}</body></html>`,
  { contentType: 'application/xhtml+xml', runScripts: 'outside-only' },
).window;

// ── A seeded generator of well-formed chapter HTML, for comparing the page's words with the app's ─────

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomChapterBody(seed) {
  const rnd = mulberry32(seed);
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const WORDS = ['alpha', 'Beta,', 'gamma.', 'delta', 'x&amp;y', 'caf&#233;', 'na&#239;ve', '12:30', '"quoted"', 'end!', 'well-known', 'A', 'I', 'one&#160;two'];
  const space = () => pick([' ', ' ', '  ', '\n', '\t', ' \n ']);
  const text = () => {
    const n = 1 + Math.floor(rnd() * 4);
    let s = '';
    for (let i = 0; i < n; i++) s += pick(WORDS) + (i < n - 1 ? space() : '');
    return s;
  };
  const inline = (depth) => {
    const n = 1 + Math.floor(rnd() * 3);
    let s = '';
    for (let i = 0; i < n; i++) {
      const r = rnd();
      if (r < 0.5 || depth > 2) s += text();
      else if (r < 0.62) s += `<b>${inline(depth + 1)}</b>`;
      else if (r < 0.72) s += `<i>${inline(depth + 1)}</i>`;
      else if (r < 0.8) s += `<a href="#x">${inline(depth + 1)}</a>`;
      else if (r < 0.86) s += '<br/>';
      else if (r < 0.9) s += '<!-- c > d -->';
      else if (r < 0.93) s += '<svg xmlns="http://www.w3.org/2000/svg"><title>t</title></svg>';
      else if (r < 0.96) s += '<span>wo</span><span>rd</span>';
      else s += '<script>var x=1;</script>';
      if (rnd() < 0.5) s += space();
    }
    return s;
  };
  const blocks = (depth) => {
    const n = 1 + Math.floor(rnd() * 3);
    const out = [];
    for (let i = 0; i < n; i++) {
      const r = rnd();
      if (r < 0.4) out.push(`<p>${inline(0)}</p>`);
      else if (r < 0.55) out.push(`<h2>${inline(0)}</h2>`);
      else if (r < 0.7) out.push(`<ul><li>${inline(0)}</li><li>${inline(0)}</li></ul>`);
      else if (depth < 2) out.push(`<div>${blocks(depth + 1)}</div>`);
      else out.push(`<p>${inline(0)}</p>`);
    }
    return out.join(space());
  };
  return blocks(0);
}
