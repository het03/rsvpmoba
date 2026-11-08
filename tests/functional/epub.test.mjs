// Builds real EPUB files (zips) and runs the app's real parsing code on them.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import JSZip from 'jszip';
import { parseEpub } from '../../src/lib/epub.ts';
import { extractEpubMetadata } from '../../src/lib/epubMetadata.ts';
import { findChapter, findNear } from '../../src/rsvp/anchor.ts';
import { htmlToText, tokenizeChapters } from '../../src/rsvp/tokenize.ts';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rsvp-epub-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

// 1x1 transparent PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const xhtml = (body) => `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Hidden title</title></head><body>${body}</body></html>`;

async function makeEpub(name, { opf, files, includeContainer = true }) {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  if (includeContainer) {
    zip.file('META-INF/container.xml', '<container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  }
  zip.file('OEBPS/content.opf', opf);
  for (const [p, content] of Object.entries(files)) zip.file(p, content);
  const file = path.join(tmp, name);
  fs.writeFileSync(file, await zip.generateAsync({ type: 'nodebuffer' }));
  return file;
}

const OPF = `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>The Test Book</dc:title>
    <dc:creator>Ada Writer</dc:creator>
    <meta name="cover" content="cover-img"/>
  </metadata>
  <manifest>
    <item id="cover-img" href="Images/cover.png" media-type="image/png"/>
    <item id="cover" href="Text/cover.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch1" href="Text/Chapter%201.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="../OEBPS/Text/ch2.xhtml" media-type="application/xhtml+xml"/>
    <item id="gone" href="Text/missing.xhtml" media-type="application/xhtml+xml"/>
    <item id="art" href="Images/plate.png" media-type="image/png"/>
    <item id="ch3" href="Text/ch3.xhtml#frag" media-type="text/html"/>
  </manifest>
  <spine>
    <itemref idref="cover-img"/>
    <itemref idref="cover"/>
    <itemref idref="ch1"/>
    <itemref idref="gone"/>
    <itemref idref="ch2"/>
    <itemref idref="art"/>
    <itemref idref="ch3"/>
    <itemref idref="not-in-manifest"/>
  </spine>
</package>`;

const FILES = {
  'OEBPS/Images/cover.png': PNG,
  'OEBPS/Images/plate.png': PNG,
  'OEBPS/Text/cover.xhtml': xhtml('<svg xmlns="http://www.w3.org/2000/svg"><title>Cover art</title><image href="../Images/cover.png"/></svg>'),
  'OEBPS/Text/Chapter 1.xhtml': xhtml('<h1>Chapter One</h1><p>It was a bright, cold day in April, and the clocks were striking thirteen.</p><p>caf&#233; and na&#239;ve &amp; more.</p>'),
  'OEBPS/Text/ch2.xhtml': xhtml('<p>The the the. Second chapter begins here.<br/>With a line break.</p><!-- a > b, hidden -->'),
  'OEBPS/Text/ch3.xhtml': xhtml('<p>Third and final chapter.</p>'),
};

describe('parseEpub', () => {
  let epub;
  test('reads the chapters in reading order', async () => {
    epub = await makeEpub('book.epub', { opf: OPF, files: FILES });
    const { chapters, hrefs, title } = await parseEpub(epub);
    assert.equal(title, 'The Test Book');
    // cover image, missing file, plate image and unknown id are skipped; four real documents remain.
    assert.equal(chapters.length, 4);
    assert.equal(hrefs.length, 4);
    assert.deepEqual([hrefs[0], hrefs[1], hrefs[3]], ['Text/cover.xhtml', 'Text/Chapter 1.xhtml', 'Text/ch3.xhtml']);
    // "../OEBPS/Text/ch2.xhtml" is stored the way the reading page normalizes it, and either spelling finds it
    assert.equal(findChapter(hrefs, '../OEBPS/Text/ch2.xhtml'), 2);
    assert.equal(findChapter(hrefs, 'Text/ch2.xhtml'), 2);
  });

  test('never reads an image from the reading order as text', async () => {
    const { chapters } = await parseEpub(epub);
    for (const c of chapters) assert.ok(!c.includes('PNG') && !c.includes('�'), 'no binary garbage');
  });

  test('handles percent-encoded names and ../ paths', async () => {
    const { chapters } = await parseEpub(epub);
    assert.match(chapters[1], /Chapter One/); // "Chapter%201.xhtml" -> "Chapter 1.xhtml"
    assert.match(chapters[2], /Second chapter/); // "../OEBPS/Text/ch2.xhtml"
    assert.match(chapters[3], /Third and final/); // "ch3.xhtml#frag"
  });

  test('missing container or garbage input fails with a clear error', async () => {
    const noContainer = await makeEpub('nocontainer.epub', { opf: OPF, files: FILES, includeContainer: false });
    await assert.rejects(parseEpub(noContainer), /container\.xml/);
    const junk = path.join(tmp, 'junk.epub');
    fs.writeFileSync(junk, 'this is not a zip file');
    await assert.rejects(parseEpub(junk));
  });
});

describe('EPUB -> RSVP words', () => {
  test('words come out clean: no titles, svg, comments or raw entities', async () => {
    const { chapters } = await parseEpub(path.join(tmp, 'book.epub'));
    const { tokens } = tokenizeChapters(chapters.map(htmlToText));
    const text = tokens.words.join(' ');
    assert.ok(!/Hidden|Cover art|hidden/.test(text), text);
    assert.ok(!/&#|&amp;|&eacute;/.test(text), text);
    assert.match(text, /café and naïve & more\./);
    assert.deepEqual(tokens.words.slice(0, 2), ['Chapter', 'One']);
  });

  test('chapter start indexes line up with the words', async () => {
    const { chapters, hrefs } = await parseEpub(path.join(tmp, 'book.epub'));
    const { tokens, starts } = tokenizeChapters(chapters.map(htmlToText));
    const ch2 = findChapter(hrefs, 'Text/ch2.xhtml');
    assert.equal(tokens.words[starts[ch2]], 'The');
    assert.equal(tokens.words[starts[ch2] + 3], 'Second'); // "The the the. Second chapter..."
    assert.equal(tokens.words[starts[findChapter(hrefs, 'OEBPS/Text/ch3.xhtml')]], 'Third');
  });

  test('a one-word selection of a common word lands exactly using chapter + offset', async () => {
    const { chapters, hrefs } = await parseEpub(path.join(tmp, 'book.epub'));
    const { tokens, starts } = tokenizeChapters(chapters.map(htmlToText));
    const ch = findChapter(hrefs, 'Text/ch2.xhtml');
    // chapter 2 is "The the the. Second ..."; select the third "the" (word offset 2)
    const estimate = starts[ch] + 2;
    assert.equal(findNear(tokens.words, estimate, 'the.', 150), estimate);
    assert.equal(tokens.words[estimate].toLowerCase(), 'the.');
  });

  test('a selection whose estimate is a few words off is corrected', async () => {
    const { chapters, hrefs } = await parseEpub(path.join(tmp, 'book.epub'));
    const { tokens, starts } = tokenizeChapters(chapters.map(htmlToText));
    const ch = findChapter(hrefs, 'Text/Chapter 1.xhtml');
    const exact = starts[ch] + tokens.words.slice(starts[ch]).findIndex((w) => w === 'bright,');
    assert.equal(findNear(tokens.words, exact + 3, 'bright, cold day in April', 150), exact);
    assert.equal(findNear(tokens.words, exact - 2, 'bright, cold day in April', 150), exact);
  });
});

describe('extractEpubMetadata', () => {
  test('title, author and cover image', async () => {
    const meta = await extractEpubMetadata(path.join(tmp, 'book.epub'));
    assert.equal(meta.title, 'The Test Book');
    assert.equal(meta.author, 'Ada Writer');
    assert.match(meta.coverData, /^data:image\/png;base64,/);
    const bytes = Buffer.from(meta.coverData.split(',')[1], 'base64');
    assert.deepEqual(bytes, PNG);
  });

  test('a book with no metadata falls back to empty values', async () => {
    const bare = await makeEpub('bare.epub', {
      opf: '<package><metadata/><manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/></spine></package>',
      files: { 'OEBPS/a.xhtml': xhtml('<p>hi</p>') },
    });
    assert.deepEqual(await extractEpubMetadata(bare), { title: '', author: '', coverData: null });
  });

  test('a corrupt file returns empty metadata instead of crashing the import', async () => {
    const junk = path.join(tmp, 'corrupt.epub');
    fs.writeFileSync(junk, 'not a zip');
    assert.deepEqual(await extractEpubMetadata(junk), { title: '', author: '', coverData: null });
  });

  test('an oversized cover is skipped rather than stored', async () => {
    const big = Buffer.alloc(400 * 1024, 7);
    const file = await makeEpub('bigcover.epub', {
      opf: OPF,
      files: { ...FILES, 'OEBPS/Images/cover.png': big },
    });
    assert.equal((await extractEpubMetadata(file)).coverData, null);
  });
});
