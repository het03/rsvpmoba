// The in-app "Open-source licences" screen reads src/lib/notices.generated.ts, which must match what the app ships.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, test } from 'node:test';
import { OUT, render } from '../../scripts/build-notices.mjs';
import { LICENCES, UNLISTED } from '../../src/lib/notices.generated.ts';
import { readSource } from '../helpers/source.mjs';

describe('open-source notices', () => {
  test('the generated file is up to date; if this fails run `npm run build:notices`', () => {
    assert.equal(fs.readFileSync(OUT, 'utf8'), render());
  });

  test('every direct dependency the app ships is covered, with a licence text or a stated licence', () => {
    const pkg = JSON.parse(readSource('package.json'));
    const listed = new Set([
      ...LICENCES.flatMap((g) => g.packages.map((p) => p.name.replace(/ \(.*\)$/, ''))),
      ...UNLISTED.flatMap((u) => u.packages),
    ]);
    for (const name of Object.keys(pkg.dependencies)) {
      assert.ok([...listed].some((l) => l.startsWith(`${name} `)), `${name} is missing from the notices`);
    }
  });

  test('epub.js and its bundled libraries are included (they are inside the embedded epub.min.js)', () => {
    const names = LICENCES.flatMap((g) => g.packages.map((p) => p.name)).concat(UNLISTED.flatMap((u) => u.packages));
    for (const needle of ['epubjs ', 'jszip ', 'lodash ', 'localforage ']) {
      assert.ok(names.some((n) => n.startsWith(needle)), needle);
    }
  });

  test('the two bundled fonts ship their Open Font Licence text', () => {
    const ofl = LICENCES.filter((g) => /SIL OPEN FONT LICENSE/i.test(g.text));
    const names = ofl.flatMap((g) => g.packages.map((p) => p.name));
    assert.ok(names.some((n) => n.startsWith('@expo-google-fonts/fraunces ')));
    assert.ok(names.some((n) => n.startsWith('@expo-google-fonts/inter ')));
  });

  test('every group has licence text, a title and at least one package', () => {
    for (const g of LICENCES) {
      assert.ok(g.text.length > 50, g.title);
      assert.ok(g.title.length > 0);
      assert.ok(g.packages.length > 0);
    }
  });

  test('a package only appears once per licence file', () => {
    const entries = LICENCES.flatMap((g) => g.packages.map((p) => p.name));
    assert.equal(new Set(entries).size, entries.length);
  });

  test('the app’s own dev-only tools are not listed: they are not shipped', () => {
    const names = LICENCES.flatMap((g) => g.packages.map((p) => p.name)).concat(UNLISTED.flatMap((u) => u.packages));
    for (const dev of ['typescript ', 'jsdom ']) {
      assert.ok(!names.some((n) => n.startsWith(dev)), dev);
    }
  });
});
