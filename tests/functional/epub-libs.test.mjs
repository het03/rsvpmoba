// The EPUB page embeds jszip and epub.js (src/lib/epubLibs.generated.ts). It must stay in step with node_modules.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { OUT, render } from '../../scripts/build-epub-libs.mjs';
import { EPUBJS_SRC, JSZIP_SRC } from '../../src/lib/epubLibs.generated.ts';
import { readSource } from '../helpers/source.mjs';

describe('embedded EPUB libraries', () => {
  test('the generated file is up to date; if this fails run `npm run build:epub-libs`', () => {
    assert.equal(fs.readFileSync(OUT, 'utf8'), render());
  });

  test('epub.js is a declared dependency at the version the app was built against', () => {
    const pkg = JSON.parse(readSource('package.json'));
    assert.ok(pkg.dependencies.epubjs, 'epubjs must be in dependencies, not only in node_modules by accident');
    assert.ok(pkg.dependencies.jszip);
    assert.match(fs.readFileSync(OUT, 'utf8'), new RegExp(`epubjs ${pkg.dependencies.epubjs.replace(/[^\\d.]/g, '')}`));
  });

  test('run in a page, jszip then epub.js define JSZip and ePub, and epub.js picks up the same JSZip', () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { runScripts: 'outside-only' });
    const { window } = dom;
    window.eval(JSZIP_SRC);
    assert.equal(typeof window.JSZip, 'function');
    const jszip = window.JSZip;
    window.eval(EPUBJS_SRC);
    assert.equal(typeof window.ePub, 'function');
    assert.equal(window.JSZip, jszip, 'epub.js must not replace or lose the JSZip it was loaded after');
  });

  test('the generated module has no raw line-separator characters (they break JavaScript string literals in some engines)', () => {
    const text = fs.readFileSync(OUT, 'utf8');
    assert.ok(!text.includes(String.fromCharCode(0x2028)) && !text.includes(String.fromCharCode(0x2029)));
  });
});
