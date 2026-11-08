// The EPUB reader page's own code (word extraction, positions, highlight, links), run in jsdom.
// epub.js itself loads from the internet, so these cover the parts of the page that are our code.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { normalizeHref } from '../../src/rsvp/anchor.ts';
import { htmlToText, tokenize } from '../../src/rsvp/tokenize.ts';
import { buildEpubHtml, htmlDoc, inlineScripts, loadEpubHelpers, randomChapterBody, xhtmlDoc } from '../helpers/pages.mjs';

// Arrays made inside jsdom belong to another JavaScript realm; copy them before deep comparison.
const texts = (extracted) => Array.from(extracted.words, (w) => w.t);
const appWords = (body) => tokenize(htmlToText(`<html><head><title>Hidden title</title></head><body>${body}</body></html>`)).words;

describe('EPUB page: script integrity', () => {
  const variants = [
    ['light theme', {}],
    ['dark theme (link + list fixes)', { theme: { bg: '#141418', fg: '#E8E6DF', link: '#8FB4E8' } }],
    ['with a highlight target', { highlight: { href: 'Text/ch1.xhtml', wordOffset: 12, text: 'the word' } }],
    ['with cached locations', { cachedLocations: '["epubcfi(/6/2!/4/2/1:0)"]', initialPct: 0.4 }],
    ['highlight text that tries to close the script block', { highlight: { href: 'a.xhtml', wordOffset: 1, text: '</script><img onerror=alert(1)>' } }],
  ];
  for (const [name, options] of variants) {
    test(`page parses and stays one script block: ${name}`, () => {
      const html = buildEpubHtml(options);
      const scripts = inlineScripts(html);
      assert.equal(scripts.length, 1);
      assert.doesNotThrow(() => new Function(scripts[0]));
    });
  }

  test('includes the behaviours we rely on', () => {
    const html = buildEpubHtml({ theme: { bg: '#141418', fg: '#E8E6DF', link: '#8FB4E8' } });
    for (const needle of [
      'offset: 1500',            // keeps more text loaded around fast scrolling
      'loc.atEnd',               // 100% only at the very end
      'rsvp-layout-style',       // centres the column in landscape
      'externalLink',            // web links go to the browser
      '__seekTo',                // scrubber jumps
      'resizeFrom',              // (rotation handling was reverted; this must NOT be present)
    ]) {
      if (needle === 'resizeFrom') assert.ok(!html.includes(needle), 'rotation handler was reverted and should be gone');
      else assert.ok(html.includes(needle), needle);
    }
  });

  test('dark theme injects a link color; light theme does not', () => {
    assert.match(buildEpubHtml({ theme: { bg: '#000', fg: '#fff', link: '#8FB4E8' } }), /var linkColor = "#8FB4E8"/);
    assert.match(buildEpubHtml({ theme: { bg: '#fff', fg: '#000', link: null } }), /var linkColor = null/);
  });
});

describe('EPUB page: words match the app (randomised)', () => {
  test('HTML documents: 250 random chapters give identical word lists', () => {
    for (let seed = 1; seed <= 250; seed++) {
      const body = randomChapterBody(seed);
      const window = htmlDoc(body);
      const { extractWords } = loadEpubHelpers(window);
      const page = texts(extractWords(window.document));
      assert.deepEqual(page, appWords(body), `seed ${seed}\n${body}`);
    }
  });

  test('XHTML documents (lower-case element names): 250 random chapters give identical word lists', () => {
    for (let seed = 1001; seed <= 1250; seed++) {
      const body = randomChapterBody(seed);
      const window = xhtmlDoc(body);
      const { extractWords } = loadEpubHelpers(window);
      const page = texts(extractWords(window.document));
      assert.deepEqual(page, appWords(body), `seed ${seed}\n${body}`);
    }
  });

  test('an unclosed <br> (valid in HTML, not in XHTML) still behaves as a space', () => {
    const body = '<p>line one<br>line two<br>line three</p>';
    const window = htmlDoc(body);
    assert.deepEqual(texts(loadEpubHelpers(window).extractWords(window.document)), appWords(body));
  });

  test('hand-picked tricky cases', () => {
    const cases = [
      '<p>wo<b>rd</b> split <i>across <u>tags</u></i></p>',
      '<p>line one<br/>line two<br/>line three</p>',
      '<div><div>nested</div>blocks<div>again</div></div>',
      '<p>keep</p><script>var hidden = 1;</script><style>p{}</style><p>this</p>',
      '<p>before</p><!-- a > b hidden --><p>after</p>',
      '<p>cover</p><svg xmlns="http://www.w3.org/2000/svg"><title>Cover art</title></svg><p>x</p>',
      '<p>caf&#233; &amp; na&#239;ve&#160;words</p>',
      '<p>   </p><p>\n</p><p>only this</p>',
      '',
    ];
    for (const body of cases) {
      const w1 = htmlDoc(body);
      const w2 = xhtmlDoc(body);
      assert.deepEqual(texts(loadEpubHelpers(w1).extractWords(w1.document)), appWords(body), body);
      assert.deepEqual(texts(loadEpubHelpers(w2).extractWords(w2.document)), appWords(body), body);
    }
  });
});

describe('EPUB page: finding a word from a position', () => {
  test('every word is found from its first letter, from inside it, and from before it', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const window = htmlDoc(randomChapterBody(seed));
      const helpers = loadEpubHelpers(window);
      const ex = helpers.extractWords(window.document);
      ex.words.forEach((w, i) => {
        const seg = ex.segs.find((s) => w.s >= s.at && w.s < s.at + s.len);
        assert.ok(seg, `word ${i} must live in some text node`);
        const at = w.s - seg.at;
        assert.equal(helpers.wordIndexAtPoint(ex, seg.node, at), i, `seed ${seed} word ${i} start`);
        if (w.e - w.s > 2 && at + 1 < seg.len) {
          assert.equal(helpers.wordIndexAtPoint(ex, seg.node, at + 1), i, `seed ${seed} word ${i} mid-word`);
        }
      });
    }
  });

  test('a point on an element boundary resolves to the next word', () => {
    const window = htmlDoc('<p>one two</p><p>three four</p>');
    const helpers = loadEpubHelpers(window);
    const ex = helpers.extractWords(window.document);
    const body = window.document.body;
    assert.equal(helpers.wordIndexAtPoint(ex, body, 0), 0);
    assert.equal(helpers.wordIndexAtPoint(ex, body, 1), 2);
  });

  test('a point at the very end of the document falls back to the last word', () => {
    const window = htmlDoc('<p>one two three</p>');
    const helpers = loadEpubHelpers(window);
    const ex = helpers.extractWords(window.document);
    assert.equal(helpers.wordIndexAtPoint(ex, window.document.body, 1), 2);
  });
});

describe('EPUB page: highlighting a word', () => {
  test('wraps exactly the word and removes cleanly, for every word in random chapters', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const body = randomChapterBody(seed);
      const probe = htmlDoc(body);
      const before = probe.document.body.textContent;
      const count = loadEpubHelpers(probe).extractWords(probe.document).words.length;
      for (let i = 0; i < count; i++) {
        const window = htmlDoc(body);
        const helpers = loadEpubHelpers(window);
        const ex = helpers.extractWords(window.document);
        const spans = helpers.wrapWord(window.document, ex, ex.words[i]);
        assert.ok(spans.length >= 1);
        assert.equal(Array.from(spans, (s) => s.textContent).join(''),  ex.words[i].t, `seed ${seed} word ${i}`);
        assert.equal(window.document.body.textContent, before, 'wrapping must not change the text');

        spans.forEach((s) => {
          const parent = s.parentNode;
          parent.replaceChild(window.document.createTextNode(s.textContent), s);
          parent.normalize();
        });
        assert.equal(window.document.body.textContent, before);
        const after = texts(helpers.extractWords(window.document));
        assert.deepEqual(after, appWords(body), 'word list unchanged after the highlight is removed');
      }
    }
  });

  test('a word split across tags is wrapped in one span per piece', () => {
    const window = htmlDoc('<p>say wo<b>rd</b> now</p>');
    const helpers = loadEpubHelpers(window);
    const ex = helpers.extractWords(window.document);
    const target = ex.words.find((w) => w.t === 'word');
    const spans = helpers.wrapWord(window.document, ex, target);
    assert.equal(spans.length, 2);
    assert.deepEqual(Array.from(spans, (s) => s.textContent), ['wo', 'rd']);
  });
});

describe('EPUB page: chapter links and paths', () => {
  const items = [
    { href: 'Text/cover.xhtml', index: 0 },
    { href: 'Text/Chapter%201.xhtml', index: 1 },
    { href: '../OEBPS/Text/ch2.xhtml', index: 2 },
  ];

  test('the page normalises paths exactly like the app does', () => {
    const window = htmlDoc('');
    const { normHref } = loadEpubHelpers(window, items);
    for (const h of ['Text/ch1.xhtml#s2', 'Text/ch%201.xhtml', '../Text/a.xhtml', './a/./b.xhtml', 'a//b.xhtml', 'bad%ZZname.xhtml', 'Chapter 1.xhtml#x']) {
      assert.equal(normHref(h), normalizeHref(h), h);
    }
  });

  test('finds a chapter by encoded, relative or fragment-bearing link', () => {
    const window = htmlDoc('');
    const { findSpineItem } = loadEpubHelpers(window, items);
    assert.equal(findSpineItem('Text/Chapter 1.xhtml').index, 1);
    assert.equal(findSpineItem('Text/Chapter%201.xhtml#p3').index, 1);
    assert.equal(findSpineItem('OEBPS/Text/ch2.xhtml').index, 2);
    assert.equal(findSpineItem('Text/missing.xhtml'), null);
  });

  test('normalising text for matching ignores case and punctuation', () => {
    const window = htmlDoc('');
    const { normText } = loadEpubHelpers(window, items);
    assert.equal(normText('Hello,'), 'hello');
    assert.equal(normText('\u201cWell-known\u201d!'), 'wellknown');
    assert.equal(normText(String.fromCharCode(0x2014)), '');
    assert.equal(normText('Caf' + String.fromCharCode(0xe9)), 'caf' + String.fromCharCode(0xe9));
  });
});
