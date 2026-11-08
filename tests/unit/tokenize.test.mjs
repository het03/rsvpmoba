import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { htmlToText, splitParagraphs, tokenize, tokenizeChapters } from '../../src/rsvp/tokenize.ts';

describe('tokenize', () => {
  test('splits on any whitespace and marks paragraph ends', () => {
    const { words, paraEnds } = tokenize('alpha beta\n\ngamma   delta');
    assert.deepEqual(words, ['alpha', 'beta', 'gamma', 'delta']);
    assert.deepEqual([...paraEnds], [1, 3]);
  });

  test('handles Windows line endings and many blank lines', () => {
    const { words, paraEnds } = tokenize('one two\r\n\r\nthree\n\n\n\nfour');
    assert.deepEqual(words, ['one', 'two', 'three', 'four']);
    assert.deepEqual([...paraEnds], [1, 2, 3]);
  });

  test('a line of only spaces is a paragraph break, not a word', () => {
    const { words } = tokenize('a\n   \nb');
    assert.deepEqual(words, ['a', 'b']);
  });

  test('empty and whitespace-only input produce no words', () => {
    assert.deepEqual(tokenize('').words, []);
    assert.deepEqual(tokenize('  \n\n \t ').words, []);
    assert.equal(tokenize('').paraEnds.size, 0);
  });

  test('word list always equals a plain whitespace split (TXT positions depend on this)', () => {
    const samples = [
      'The quick  brown\nfox.\n\nJumps\tover   the lazy dog.',
      '\n\nleading blank lines and trailing\n\n',
      'single',
      'a b c d e f g\n\nh i j',
      'tabs\tand\nnewlines\r\nmixed\r\n\r\nend',
    ];
    for (const s of samples) {
      assert.deepEqual(tokenize(s).words, s.split(/\s+/).filter(Boolean), JSON.stringify(s));
    }
  });
});

describe('splitParagraphs', () => {
  test('gives each paragraph its first-word index and word count', () => {
    const { paragraphs, total } = splitParagraphs('one two three\n\nfour five\n\nsix');
    assert.deepEqual(paragraphs.map((p) => [p.o, p.n]), [[0, 3], [3, 2], [5, 1]]);
    assert.equal(total, 6);
  });

  test('keeps single line breaks inside a paragraph and trims the ends', () => {
    const { paragraphs } = splitParagraphs('  first line\nsecond line  \n\nnext');
    assert.equal(paragraphs[0].t, 'first line\nsecond line');
  });

  test('skips empty paragraphs', () => {
    const { paragraphs, total } = splitParagraphs('a\n\n   \n\n\n\nb');
    assert.equal(paragraphs.length, 2);
    assert.equal(total, 2);
  });

  test('offsets line up exactly with tokenize() for any text', () => {
    const text = 'First para line one\nline two.\r\n\r\nSecond   para here.\n\n\n\nThird.\n   \nFourth one  ends.';
    const { words } = tokenize(text);
    const { paragraphs, total } = splitParagraphs(text);
    assert.equal(total, words.length);
    for (const p of paragraphs) {
      const own = p.t.split(/\s+/).filter(Boolean);
      assert.equal(own.length, p.n);
      assert.deepEqual(words.slice(p.o, p.o + p.n), own);
    }
  });
});

describe('tokenizeChapters', () => {
  test('records where each chapter starts and offsets paragraph ends', () => {
    const { tokens, starts } = tokenizeChapters(['a b\n\nc', 'd e f', 'g']);
    assert.deepEqual(tokens.words, ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    assert.deepEqual(starts, [0, 3, 6]);
    assert.deepEqual([...tokens.paraEnds].sort(), [1, 2, 5, 6]);
  });

  test('an empty chapter shares its start with the next one', () => {
    const { tokens, starts } = tokenizeChapters(['one two', '', 'three']);
    assert.deepEqual(starts, [0, 2, 2]);
    assert.deepEqual(tokens.words, ['one', 'two', 'three']);
  });

  test('no chapters means no words', () => {
    const { tokens, starts } = tokenizeChapters([]);
    assert.deepEqual(tokens.words, []);
    assert.deepEqual(starts, []);
  });
});

describe('htmlToText', () => {
  const words = (html) => tokenize(htmlToText(html)).words;

  test('block elements end a paragraph; <br> is just a space', () => {
    assert.deepEqual([...tokenize(htmlToText('<p>a b</p><p>c</p>')).paraEnds], [1, 2]);
    assert.deepEqual(words('<p>line one<br/>line two</p>'), ['line', 'one', 'line', 'two']);
    assert.equal(tokenize(htmlToText('<p>x<br>y</p>')).paraEnds.size, 1);
  });

  test('inline tags do not split a word', () => {
    assert.deepEqual(words('<p>wo<b>rd</b> and <i>an <u>other</u></i></p>'), ['word', 'and', 'an', 'other']);
  });

  test('removes head, script, style and svg content', () => {
    const html = '<head><title>Hidden title</title></head><body><p>keep</p><script>var x = "hidden";</script>'
      + '<style>p { color: red }</style><svg><title>Cover art</title></svg><p>this</p></body>';
    assert.deepEqual(words(html), ['keep', 'this']);
  });

  test('removes comments, even ones containing ">"', () => {
    assert.deepEqual(words('<p>before</p><!-- a > b, hidden words --><p>after</p>'), ['before', 'after']);
  });

  test('keeps CDATA text but drops its wrapper', () => {
    assert.deepEqual(words('<p><![CDATA[inside cdata]]> tail</p>'), ['inside', 'cdata', 'tail']);
  });

  test('images contribute no words (alt text and data URIs are dropped)', () => {
    assert.deepEqual(
      words('<p>see <img src="data:image/png;base64,AAAA" alt="a picture"/> here <img src="x.jpg"/>now</p>'),
      ['see', 'here', 'now'],
    );
  });

  test('decodes numeric, hex and common named entities', () => {
    assert.equal(htmlToText('<p>caf&#233; &#xE9; &amp; &lt;b&gt; &quot;q&quot; &mdash; &hellip;</p>').trim(),
      'café é & <b> "q" — …');
  });

  test('decodes the Latin-1 named entities books use for accents', () => {
    const out = htmlToText('<p>caf&eacute; &Eacute;cole na&iuml;ve &ntilde; &uuml;ber &szlig; &copy; &frac12; &euro;5 &bull;</p>').trim();
    assert.equal(out, 'café École naïve ñ über ß © ½ €5 •');
  });

  test('leaves unknown entities untouched instead of inventing text', () => {
    assert.match(htmlToText('<p>&unknown; &zzz;</p>'), /&unknown; &zzz;/);
  });

  test('non-breaking space counts as whitespace', () => {
    assert.deepEqual(words('<p>one&nbsp;two&#160;three</p>'), ['one', 'two', 'three']);
  });

  test('empty and tag-only documents give no words', () => {
    assert.deepEqual(words(''), []);
    assert.deepEqual(words('<html><body><div><img src="a.jpg"/></div></body></html>'), []);
  });
});
