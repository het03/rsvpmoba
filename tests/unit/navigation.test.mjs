import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { backTarget, PARENT_ROUTES } from '../../src/lib/navigation.ts';
import { readSource, root } from '../helpers/source.mjs';

describe('backTarget', () => {
  test('Settings goes back to Profile, the page it was opened from', () => {
    assert.equal(backTarget('/settings'), '/profile');
  });

  test('the other tab pages go back to home', () => {
    for (const page of ['/profile', '/stats', '/reader']) assert.equal(backTarget(page), '/', page);
  });

  test('home is left alone so Android can exit, and a book keeps its own back handling', () => {
    assert.equal(backTarget('/'), null);
    assert.equal(backTarget('/reader/12'), null);
    assert.equal(backTarget('/reader/12/anything'), null);
  });

  test('an unknown page falls back to home rather than trapping the user', () => {
    assert.equal(backTarget('/nowhere'), '/');
  });

  test('every parent is a real page, and no page is its own parent or part of a loop', () => {
    for (const [child, parent] of Object.entries(PARENT_ROUTES)) {
      assert.notEqual(child, parent);
      assert.ok(fs.existsSync(path.join(root, `src/app${parent}.tsx`)), `${parent} exists`);
      assert.ok(fs.existsSync(path.join(root, `src/app${child}.tsx`)), `${child} exists`);
      assert.ok(!(parent in PARENT_ROUTES) || PARENT_ROUTES[parent] !== child, `${child} and ${parent} point at each other`);
    }
  });

  test('every page the Profile screen opens has a parent entry, so back never skips it', () => {
    const opened = [...readSource('src/app/profile.tsx').matchAll(/router\.push\('([^']+)'\)/g)].map(m => m[1]);
    assert.ok(opened.length > 0);
    for (const page of opened) assert.equal(PARENT_ROUTES[page], '/profile', page);
  });

  test('the root layout uses it for the hardware back button', () => {
    const layout = readSource('src/app/_layout.tsx');
    assert.ok(layout.includes("import { backTarget } from '@/lib/navigation'"));
    assert.ok(layout.includes('const target = backTarget(pathname)'));
    assert.ok(layout.includes('router.replace(target as any)'));
    assert.ok(!layout.includes("router.replace('/')"), 'back no longer always goes home');
  });
});
