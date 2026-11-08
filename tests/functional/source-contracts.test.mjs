// Checks on the source itself, for mistakes that are easy to make and hard to spot on a phone.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { readSource, root } from '../helpers/source.mjs';

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const rel = (f) => path.relative(root, f).replaceAll('\\', '/');

// React requires the same hooks on every render, so none may come after a conditional return.
// (A hook placed after an early return crashed the book screen once: "Rendered more hooks than during the previous render".)
function hooksAfterEarlyReturn(source) {
  const lines = source.split('\n');
  const problems = [];
  let inComponent = false;
  let seenEarlyReturn = false;
  lines.forEach((line, i) => {
    if (/^export default function \w+|^function [A-Z]\w*\(/.test(line)) { inComponent = true; seenEarlyReturn = false; }
    if (!inComponent) return;
    if (/^  if \(.*\) \{$/.test(line) || /^  if \(.*\) return[^;]*;$/.test(line)) {
      // an `if` at component top level whose body returns
      const body = lines.slice(i, i + 12).join('\n');
      if (/^  if \(.*\) return/.test(line) || /^    return/m.test(body.split('\n  }\n')[0])) seenEarlyReturn = true;
    }
    if (seenEarlyReturn && /^  (const|let) .*= use[A-Z]\w*\(|^  use(Effect|LayoutEffect)\(/.test(line)) {
      problems.push(`line ${i + 1}: ${line.trim()}`);
    }
  });
  return problems;
}

describe('the hook checker itself', () => {
  test('flags a hook placed after an early return', () => {
    const bad = [
      'export default function Screen() {',
      '  const [a] = useState(0);',
      '  if (loading) {',
      '    return null;',
      '  }',
      '  const ref = useRef(null);',
      '  return null;',
      '}',
    ].join('\n');
    assert.equal(hooksAfterEarlyReturn(bad).length, 1);
  });

  test('accepts hooks that all come before the early return', () => {
    const good = [
      'export default function Screen() {',
      '  const [a] = useState(0);',
      '  const ref = useRef(null);',
      '  if (loading) {',
      '    return null;',
      '  }',
      '  return null;',
      '}',
    ].join('\n');
    assert.deepEqual(hooksAfterEarlyReturn(good), []);
  });
});

describe('hooks are never called after an early return', () => {
  const files = walk(path.join(root, 'src')).filter((f) => f.endsWith('.tsx'));
  for (const file of files) {
    test(rel(file), () => {
      assert.deepEqual(hooksAfterEarlyReturn(fs.readFileSync(file, 'utf8')), []);
    });
  }
});

describe('the book screen', () => {
  const src = readSource('src/app/reader/[id].tsx');

  test('declares its stable callbacks above the loading/error returns', () => {
    const firstReturn = src.indexOf('  if (loading) {');
    for (const name of ['onSelectionAction', 'onSelectionFallback', 'onSaveLocations', 'handleSeek', 'exitRsvp']) {
      const at = src.indexOf(`const ${name} = useCallback`);
      assert.ok(at > 0 && at < firstReturn, `${name} must be declared before the early returns`);
    }
  });

  test('unmounts the normal reader while RSVP is open (so native selection handles cannot linger)', () => {
    assert.match(src, /\{rsvpOpen \? null : book\.format === 'txt'/);
  });

  test('blocks iOS swipe-back while RSVP is open', () => {
    assert.match(src, /gestureEnabled: !\(rsvpOpen \|\| launchingRsvp\)/);
  });
});

describe('library: when a book counts as completed', () => {
  const threshold = () => Number(readSource('src/app/index.tsx').match(/const COMPLETE_THRESHOLD = ([0-9.]+);/)?.[1]);

  test('only a book read to the very end is Completed', () => {
    const t = threshold();
    assert.ok(t >= 0.99 && t <= 1, `threshold ${t} should be just short of 100%`);
    for (const almostDone of [0.5, 0.9, 0.95, 0.98, 0.995]) assert.ok(almostDone < t, `${almostDone * 100}% must still be In Progress`);
  });

  test('the readers report exactly 100% at the very end', () => {
    assert.match(readSource('src/components/Reader/TxtReader.tsx'), /scrollHeight - 2\) return TOTAL;/);
    assert.match(readSource('src/components/Reader/EpubReader.tsx'), /lastPct = loc\.atEnd \? 1 :/);
  });
});

describe('project hygiene', () => {
  test('no stray debug or scratch files in the project root', () => {
    const stray = fs.readdirSync(root).filter((f) => /^(debug|scratch|tmp|test_).*\.(m?js|ts|txt)$/i.test(f));
    assert.deepEqual(stray, []);
  });

  test('PDF import is blocked', () => {
    assert.doesNotMatch(readSource('src/components/ImportModal/types.ts'), /VALID_FILE_TYPES\s*=\s*\[[^\]]*PDF/);
  });

  test('every screen the nav links to exists', () => {
    const nav = readSource('src/components/Shared/Nav.tsx');
    const routes = [...nav.matchAll(/href:\s*'([^']+)'/g)].map((m) => m[1]);
    assert.ok(routes.length >= 4);
    for (const r of routes) {
      const file = r === '/' ? 'src/app/index.tsx' : `src/app${r}.tsx`;
      assert.ok(fs.existsSync(path.join(root, file)), `${r} -> ${file}`);
    }
  });

  test('the in-page scripts avoid characters that break a JavaScript regex literal when saved', () => {
    for (const file of ['src/components/Reader/TxtReader.tsx', 'src/components/Reader/EpubReader.tsx']) {
      const text = readSource(file);
      assert.ok(!text.includes(String.fromCharCode(0x2028)) && !text.includes(String.fromCharCode(0x2029)), `${file} contains a raw line-separator character`);
    }
  });
});
