import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_PREFS, READER_FONTS, THEMES, fontStack, loadPrefs, savePrefs } from '../../src/lib/readerPrefs.ts';
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
    assert.deepEqual(await loadPrefs(), { fontSize: 17, lineHeight: 1.7, theme: 'light', brightness: 1, font: 'default', orpHighlight: true });
  });
  test('saved values round-trip', async () => {
    const prefs = { fontSize: 20, lineHeight: 1.5, theme: 'dark', brightness: 0.6, font: 'serif', orpHighlight: false };
    await savePrefs(prefs);
    assert.deepEqual(await loadPrefs(), prefs);
  });
  test('missing fields fall back to defaults', async () => {
    await AsyncStorage.setItem('readerPrefs', JSON.stringify({ fontSize: 22 }));
    const prefs = await loadPrefs();
    assert.equal(prefs.fontSize, 22);
    assert.equal(prefs.theme, 'light');
    assert.equal(prefs.brightness, 1);
    assert.equal(prefs.font, 'default');
    assert.equal(prefs.orpHighlight, true);
  });
  test('prefs saved before fonts and the focus-letter switch existed still load, with those at their defaults', async () => {
    await AsyncStorage.setItem('readerPrefs', JSON.stringify({ fontSize: 20, lineHeight: 1.5, theme: 'sepia', brightness: 0.8 }));
    assert.deepEqual(await loadPrefs(), { fontSize: 20, lineHeight: 1.5, theme: 'sepia', brightness: 0.8, font: 'default', orpHighlight: true });
  });
  test('a font or switch of the wrong kind falls back instead of reaching the reader', async () => {
    await AsyncStorage.setItem('readerPrefs', JSON.stringify({ font: 'comic', orpHighlight: 'yes', fontSize: 19 }));
    const prefs = await loadPrefs();
    assert.equal(prefs.font, DEFAULT_PREFS.font);
    assert.equal(prefs.orpHighlight, true);
    assert.equal(prefs.fontSize, 19);
    await AsyncStorage.setItem('readerPrefs', 'null');
    assert.deepEqual(await loadPrefs(), DEFAULT_PREFS);
  });
  test('corrupt saved data does not crash', async () => {
    await AsyncStorage.setItem('readerPrefs', '{not json');
    assert.equal((await loadPrefs()).fontSize, 17);
  });
});

describe('fontStack', () => {
  test('default keeps each format as it was: system font for TXT, Georgia serif for EPUB', () => {
    assert.match(fontStack('default', 'txt'), /^-apple-system, system-ui/);
    assert.match(fontStack('default', 'epub'), /^Georgia/);
  });

  test('serif and sans are the same in either format, and differ from each other', () => {
    for (const f of ['serif', 'sans']) assert.equal(fontStack(f, 'txt'), fontStack(f, 'epub'));
    assert.match(fontStack('serif', 'txt'), /serif$/);
    assert.match(fontStack('sans', 'txt'), /sans-serif$/);
    assert.notEqual(fontStack('serif', 'txt'), fontStack('sans', 'txt'));
  });

  test('no stack has a single quote, which would end the EPUB page script string it is written into', () => {
    for (const { font } of READER_FONTS) {
      for (const format of ['txt', 'epub']) assert.ok(!fontStack(font, format).includes("'"), `${font}/${format}`);
    }
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
