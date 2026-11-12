// The TXT reader page (the real in-page script) running in jsdom with a fake layout.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { inlineScripts, buildTxtHtml, openTxtPage } from '../helpers/pages.mjs';
import { splitParagraphs } from '../../src/rsvp/tokenize.ts';

// 20 paragraphs of 10 words each: "p0w0 p0w1 ... p0w9", "p1w0 ...". Paragraph i starts at word 10*i.
const makeParagraphs = (count = 20, words = 10) =>
  Array.from({ length: count }, (_, i) => ({
    t: Array.from({ length: words }, (_, k) => `p${i}w${k}`).join(' '),
    o: i * words,
    n: words,
  }));

const PARAS = makeParagraphs();
const TOTAL = 200;

describe('TXT page: building', () => {
  test('renders one paragraph per entry, in order, with its text', () => {
    const page = openTxtPage(PARAS);
    const els = page.paragraphElements();
    assert.equal(els.length, 20);
    assert.equal(els[0].textContent, PARAS[0].t);
    assert.equal(els[19].textContent, PARAS[19].t);
    assert.equal(els[7].getAttribute('data-i'), '7');
  });

  test('keeps line breaks inside a paragraph visible (pre-wrap)', () => {
    const html = buildTxtHtml(PARAS);
    assert.match(html, /white-space:\s*pre-wrap/);
  });

  test('text that looks like HTML or script is shown as text, never run or parsed', () => {
    const nasty = [{ t: 'a </script><b>bold</b> & "quotes" \'single\'     end', o: 0, n: 10 }];
    const html = buildTxtHtml(nasty);
    assert.equal(inlineScripts(html).length, 1, 'content must not close the script block early');
    const page = openTxtPage(nasty);
    assert.equal(page.paragraphElements()[0].textContent, nasty[0].t);
    assert.equal(page.document.querySelectorAll('b').length, 0);
  });

  test('applies the theme and font settings', () => {
    const html = buildTxtHtml(PARAS, { theme: { bg: '#141418', fg: '#E8E6DF' }, prefs: { fontSize: 21, lineHeight: 1.4 } });
    assert.match(html, /background:\s*#141418/);
    assert.match(html, /color:\s*#E8E6DF/);
    assert.match(html, /font-size:\s*21px/);
    assert.match(html, /line-height:\s*1\.4/);
  });

  test('an empty book does not crash the page', () => {
    const page = openTxtPage([]);
    assert.equal(page.paragraphElements().length, 0);
    page.scrollTo(100);
    page.flush();
    assert.doesNotThrow(() => page.send({ type: 'seek', fraction: 0.5 }));
  });

  test('a very large book builds quickly', () => {
    const big = makeParagraphs(5000, 40);
    const started = performance.now();
    const page = openTxtPage(big);
    assert.equal(page.paragraphElements().length, 5000);
    assert.ok(performance.now() - started < 5000, 'should build 5,000 paragraphs well within seconds');
  });
});

describe('TXT page: opening position', () => {
  test('scrolls to the saved word', () => {
    // word 25 is half way through paragraph 2 (top 224, 100 tall) -> 224 + 50
    const page = openTxtPage(PARAS, { initialWord: 25 });
    assert.equal(page.state.scrollTop, 274);
  });

  test('opens at the top when there is no saved position', () => {
    const page = openTxtPage(PARAS, { initialWord: 0 });
    assert.equal(page.state.scrollTop, 0);
  });

  test('a highlight word wins over the saved position and sits about a third down the screen', () => {
    // word 33: paragraph 3 (top 324), 30% in -> 354, minus 35% of the 600px viewport
    const page = openTxtPage(PARAS, { initialWord: 100, highlightWord: 33 });
    assert.equal(page.state.scrollTop, 354 - 600 * 0.35);
  });

  test('a highlight near the very top never scrolls to a negative position', () => {
    const page = openTxtPage(PARAS, { highlightWord: 1 });
    assert.equal(page.state.scrollTop, 0);
  });
});

describe('TXT page: highlight', () => {
  test('flashes exactly the chosen word, then fades and removes itself, leaving the text untouched', () => {
    const page = openTxtPage(PARAS, { highlightWord: 33 }); // paragraph 3, word 3 -> "p3w3"
    const spans = page.document.querySelectorAll('span');
    assert.equal(spans.length, 1);
    assert.equal(spans[0].textContent, 'p3w3');
    assert.match(spans[0].getAttribute('style'), /rgba\(255,\s*200,\s*0/);

    page.flush(); // fade (2.6s) then unwrap (3.6s)
    assert.equal(page.document.querySelectorAll('span').length, 0);
    assert.equal(page.paragraphElements()[3].textContent, PARAS[3].t);
    assert.equal(page.paragraphElements()[3].childNodes.length, 1, 'text should be one plain node again');
  });

  test('works on the first and last words of the book', () => {
    for (const [word, text] of [[0, 'p0w0'], [199, 'p19w9']]) {
      const page = openTxtPage(PARAS, { highlightWord: word });
      assert.equal(page.document.querySelector('span').textContent, text);
    }
  });

  test('a word past the end of its paragraph is ignored without crashing', () => {
    assert.doesNotThrow(() => openTxtPage(PARAS, { highlightWord: 5000 }));
  });
});

describe('TXT page: reporting reading position', () => {
  test('reports the word at the top of the screen after scrolling (and not on every tick)', () => {
    const page = openTxtPage(PARAS);
    page.scrollTo(250); // paragraph 2 starts at 224; 26% in -> word 20 + floor(0.26 * 10) = 22
    page.scrollTo(251);
    page.scrollTo(252);
    assert.equal(page.pendingTimers() > 0, true);
    page.flush();
    const positions = page.posts.filter((p) => p.type === 'position');
    assert.equal(positions.length, 1, 'one throttled report for a burst of scroll events');
    assert.equal(positions[0].wordIndex, 22);
  });

  test('reports the end of the book (100%) when scrolled to the bottom', () => {
    const page = openTxtPage(PARAS);
    page.scrollTo(page.state.scrollHeight - 600);
    page.flush();
    assert.equal(page.posts.at(-1).wordIndex, TOTAL);
  });

  test('just short of the bottom is not 100%', () => {
    const page = openTxtPage(PARAS);
    page.scrollTo(page.state.scrollHeight - 600 - 200);
    page.flush();
    assert.ok(page.posts.at(-1).wordIndex < TOTAL);
  });

  test('never reports a negative or out-of-range word', () => {
    const page = openTxtPage(PARAS);
    for (const y of [-500, 0, 10, 1000, 99999]) {
      page.scrollTo(y);
      page.flush();
    }
    for (const p of page.posts.filter((m) => m.type === 'position')) {
      assert.ok(p.wordIndex >= 0 && p.wordIndex <= TOTAL, `word ${p.wordIndex}`);
    }
  });
});

describe('TXT page: seeking from the scrubber', () => {
  test('jumps to the matching word', () => {
    const page = openTxtPage(PARAS);
    page.send({ type: 'seek', fraction: 0.5 }); // word round(0.5 * 199) = 100 -> start of paragraph 10
    assert.equal(page.state.scrollTop, 24 + 10 * 100);
    page.send({ type: 'seek', fraction: 0 });
    assert.equal(page.state.scrollTop, 24);
  });

  test('the end of the scrubber lands near the last words', () => {
    const page = openTxtPage(PARAS);
    page.send({ type: 'seek', fraction: 1 });
    assert.equal(page.state.scrollTop, 24 + 19 * 100 + 90); // word 199 is 90% into the last paragraph
  });

  test('out-of-range fractions are clamped', () => {
    const page = openTxtPage(PARAS);
    page.send({ type: 'seek', fraction: -3 });
    assert.equal(page.state.scrollTop, 24);
    page.send({ type: 'seek', fraction: 9 });
    assert.equal(page.state.scrollTop, 24 + 19 * 100 + 90);
  });

  test('ignores malformed messages', () => {
    const page = openTxtPage(PARAS);
    assert.doesNotThrow(() => page.send('not json'));
    assert.doesNotThrow(() => page.send({ type: 'nonsense' }));
    assert.equal(page.state.scrollTop, 0);
  });
});

describe('TXT page: live style changes', () => {
  test('applies colors and sizes without losing the reading position', () => {
    const page = openTxtPage(PARAS);
    page.scrollTo(1000);
    const before = page.state.scrollTop;
    page.send({ type: 'updateStyle', bg: '#000000', fg: '#ffffff', fontSize: 24, lineHeight: 1.5 });
    const body = page.document.body;
    assert.equal(body.style.fontSize, '24px');
    assert.equal(body.style.lineHeight, '1.5');
    assert.ok(body.style.background.includes('rgb(0, 0, 0)') || body.style.background.includes('#000'));
    // the page re-aims at the start of the word that was at the top, so it can shift by less than one word
    assert.ok(Math.abs(page.state.scrollTop - before) <= 10, `moved ${page.state.scrollTop - before}px`);
  });

  test('repeated changes (like dragging a font-size slider) never creep the position', () => {
    const style = { type: 'updateStyle', bg: '#fff', fg: '#000', fontSize: 18, lineHeight: 1.6 };
    for (let y = 30; y < 1900; y += 37) {
      const page = openTxtPage(PARAS);
      page.scrollTo(y);
      page.send(style);
      const settled = page.state.scrollTop;
      for (let i = 0; i < 12; i++) page.send(style);
      assert.equal(page.state.scrollTop, settled, `drifted after repeated updates starting at y=${y}`);
    }
  });
});

describe('TXT page: selection', () => {
  const offsetOfWord = (paragraph, k) => PARAS[paragraph].t.split(' ').slice(0, k).join(' ').length + (k > 0 ? 1 : 0);

  test('reports the exact word index where the selection starts', () => {
    const page = openTxtPage(PARAS);
    const from = offsetOfWord(4, 2); // third word of paragraph 4 -> word 42
    page.select(4, from, from + 9);
    page.flush();
    const sel = page.posts.find((p) => p.type === 'selection');
    assert.equal(sel.wordIndex, 42);
    assert.equal(sel.fraction, 42 / TOTAL);
    assert.equal(sel.text, PARAS[4].t.slice(from, from + 9));
  });

  test('also reports the paragraph around the selection and where in it the selection starts', () => {
    const page = openTxtPage(PARAS);
    const from = offsetOfWord(4, 2);
    page.select(4, from, from + 9);
    page.flush();
    const sel = page.posts.find((p) => p.type === 'selection');
    assert.equal(sel.context, PARAS[4].t);
    assert.equal(sel.contextOffset, from);
    assert.equal(sel.context.slice(sel.contextOffset, sel.contextOffset + 9), sel.text);
  });

  test('a selection starting in the middle of a word counts that word', () => {
    const page = openTxtPage(PARAS);
    const from = offsetOfWord(4, 3) + 2; // two letters into the fourth word
    page.select(4, from, from + 5);
    page.flush();
    assert.equal(page.posts.find((p) => p.type === 'selection').wordIndex, 43);
  });

  test('works for the first word of the book and the last word of the last paragraph', () => {
    let page = openTxtPage(PARAS);
    page.select(0, 0, 4);
    page.flush();
    assert.equal(page.posts.find((p) => p.type === 'selection').wordIndex, 0);

    page = openTxtPage(PARAS);
    const from = offsetOfWord(19, 9);
    page.select(19, from, PARAS[19].t.length);
    page.flush();
    assert.equal(page.posts.find((p) => p.type === 'selection').wordIndex, 199);
  });

  test('long selections send at most 300 characters of text', () => {
    const page = openTxtPage(makeParagraphs(1, 200));
    page.select(0, 0, page.paragraphElements()[0].textContent.length);
    page.flush();
    assert.ok(page.posts.find((p) => p.type === 'selection').text.length <= 300);
  });

  test('clicking without selecting anything sends nothing', () => {
    const page = openTxtPage(PARAS);
    page.window.getSelection().removeAllRanges();
    page.document.dispatchEvent(new page.window.Event('selectionchange'));
    page.flush();
    assert.equal(page.posts.filter((p) => p.type === 'selection').length, 0);
  });

  test('still correct while a highlight is on screen (the paragraph is split into several text nodes)', () => {
    const page = openTxtPage(PARAS, { highlightWord: 43 }); // wraps "p4w3" in a span
    const p = page.paragraphElements()[4];
    const range = page.document.createRange();
    range.setStart(p.lastChild, 1); // inside the text after the highlighted word -> word p4w4
    range.setEnd(p.lastChild, 5);
    const selection = page.window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    page.document.dispatchEvent(new page.window.Event('selectionchange'));
    page.flush();
    assert.equal(page.posts.filter((m) => m.type === 'selection').at(-1).wordIndex, 44);
  });
});

describe('TXT page vs the app: word numbering', () => {
  test('page word indexes match splitParagraphs for text with odd spacing', () => {
    const text = 'First para line one\nline two.\r\n\r\nSecond   para here.\n\n\n\nThird.\n   \nFourth one  ends.';
    const { paragraphs, total } = splitParagraphs(text);
    const page = openTxtPage(paragraphs);
    assert.equal(page.paragraphElements().length, paragraphs.length);
    // select the first word of every paragraph; the page must report that paragraph's offset
    paragraphs.forEach((p, i) => {
      page.posts.length = 0;
      page.select(i, 0, 1);
      page.flush();
      assert.equal(page.posts.find((m) => m.type === 'selection').wordIndex, p.o, `paragraph ${i}`);
    });
    assert.equal(total, 13);
  });
});
