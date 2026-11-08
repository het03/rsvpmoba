import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { THEMES, loadPrefs, savePrefs } from '../../src/lib/readerPrefs.ts';
import { SELECTION_MENU } from '../../src/lib/selectionMenu.ts';

describe('THEMES', () => {
  test('every theme has colors; only dark overrides link color', () => {
    for (const name of ['light', 'dark', 'sepia']) {
      assert.match(THEMES[name].bg, /^#[0-9A-F]{6}$/i);
      assert.match(THEMES[name].fg, /^#[0-9A-F]{6}$/i);
      assert.equal(THEMES[name].name, name);
    }
    assert.equal(THEMES.light.link, null);
    assert.equal(THEMES.sepia.link, null);
    assert.match(THEMES.dark.link, /^#[0-9A-F]{6}$/i);
  });
});

describe('reader prefs storage', () => {
  beforeEach(() => AsyncStorage.clear());

  test('defaults when nothing is saved', async () => {
    assert.deepEqual(await loadPrefs(), { fontSize: 17, lineHeight: 1.7, theme: 'light', brightness: 1 });
  });
  test('saved values round-trip', async () => {
    const prefs = { fontSize: 20, lineHeight: 1.5, theme: 'dark', brightness: 0.6 };
    await savePrefs(prefs);
    assert.deepEqual(await loadPrefs(), prefs);
  });
  test('missing fields fall back to defaults', async () => {
    await AsyncStorage.setItem('readerPrefs', JSON.stringify({ fontSize: 22 }));
    const prefs = await loadPrefs();
    assert.equal(prefs.fontSize, 22);
    assert.equal(prefs.theme, 'light');
    assert.equal(prefs.brightness, 1);
  });
  test('corrupt saved data does not crash', async () => {
    await AsyncStorage.setItem('readerPrefs', '{not json');
    assert.equal((await loadPrefs()).fontSize, 17);
  });
});

describe('SELECTION_MENU', () => {
  test('has the RSVP action with a unique key', () => {
    const keys = SELECTION_MENU.map((m) => m.key);
    assert.ok(keys.includes('rsvp'));
    assert.equal(new Set(keys).size, keys.length);
    for (const item of SELECTION_MENU) assert.ok(item.label.length > 0);
  });
});
