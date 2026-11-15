// The root layout must not draw any screen until the database tables exist and the saved theme is loaded.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { readSource } from '../helpers/source.mjs';

const src = readSource('src/app/_layout.tsx');
const earlyReturn = src.slice(src.indexOf('export default function RootLayout'));

describe('root layout start-up', () => {
  test('waits for the database schema before rendering screens, but still opens if it fails', () => {
    assert.match(earlyReturn, /initDb\(\)[\s\S]*?\.finally\(\(\) => setDbReady\(true\)\)/);
    assert.match(earlyReturn, /if \(.*!dbReady.*\) \{\s*return null;/);
  });

  test('waits for the saved theme before rendering screens', () => {
    assert.match(earlyReturn, /loadThemeMode\(\)\.finally\(\(\) => setThemeReady\(true\)\)/);
    assert.match(earlyReturn, /if \(.*!themeReady.*\) \{\s*return null;/);
  });

  test('theme fades are switched on only once the saved theme is loaded, so start-up never fades', () => {
    assert.match(earlyReturn, /if \(themeReady\) enableThemeFades\(\)/);
  });

  test('the window background and screen container follow the wanted theme in one step, not every frame of a fade', () => {
    assert.match(earlyReturn, /const theme = useTargetTheme\(\)/);
    assert.ok(!/const theme = useAppTheme\(\)/.test(earlyReturn.slice(0, earlyReturn.indexOf('function NavBar'))));
  });

  test('keeps the splash screen up until fonts, theme and database are all ready', () => {
    assert.match(earlyReturn, /\(loaded \|\| error\) && themeReady && dbReady/);
  });
});
