import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { parseThemeMode, resolveScheme, THEME_MODES } from '../../src/lib/themeMode.ts';

describe('parseThemeMode', () => {
  test('accepts the saved light and dark values', () => {
    assert.equal(parseThemeMode('light'), 'light');
    assert.equal(parseThemeMode('dark'), 'dark');
    assert.equal(parseThemeMode('system'), 'system');
  });

  test('nothing saved, or anything unrecognised, follows the phone', () => {
    for (const bad of [null, '', 'Dark', 'sepia', 'auto', '1', 'undefined']) assert.equal(parseThemeMode(bad), 'system', String(bad));
  });
});

describe('resolveScheme', () => {
  test('a forced theme ignores the phone', () => {
    assert.equal(resolveScheme('light', 'dark'), 'light');
    assert.equal(resolveScheme('dark', 'light'), 'dark');
    assert.equal(resolveScheme('dark', null), 'dark');
  });

  test('system default follows the phone', () => {
    assert.equal(resolveScheme('system', 'dark'), 'dark');
    assert.equal(resolveScheme('system', 'light'), 'light');
  });

  test('system default is light when the phone does not say', () => {
    assert.equal(resolveScheme('system', null), 'light');
    assert.equal(resolveScheme('system', undefined), 'light');
    assert.equal(resolveScheme('system', 'unspecified'), 'light');
  });
});

describe('THEME_MODES', () => {
  test('offers System default, Light and Dark, once each, in that order', () => {
    assert.deepEqual(THEME_MODES.map(m => m.mode), ['system', 'light', 'dark']);
    assert.deepEqual(THEME_MODES.map(m => m.label), ['System default', 'Light', 'Dark']);
  });
});
