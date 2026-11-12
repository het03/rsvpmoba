// The saved theme setting: kept in memory so every screen updates at once, and in storage so it survives a restart.
import AsyncStorage from '@react-native-async-storage/async-storage';
import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { THEME_MODE_KEY } from '../../src/lib/themeMode.ts';
import { getThemeMode, loadThemeMode, setThemeMode, subscribeThemeMode } from '../../src/lib/themeStore.ts';

beforeEach(async () => {
  await AsyncStorage.clear();
  await setThemeMode('system');
  await AsyncStorage.clear();
});

describe('theme store', () => {
  test('starts on system default', () => {
    assert.equal(getThemeMode(), 'system');
  });

  test('setting a theme applies at once and is saved', async () => {
    await setThemeMode('dark');
    assert.equal(getThemeMode(), 'dark');
    assert.equal(await AsyncStorage.getItem(THEME_MODE_KEY), 'dark');
  });

  test('the saved theme comes back after a restart', async () => {
    await setThemeMode('light');
    await setThemeMode('system'); // memory is reset to something else, as on a fresh start
    await AsyncStorage.setItem(THEME_MODE_KEY, 'dark');
    assert.equal(await loadThemeMode(), 'dark');
    assert.equal(getThemeMode(), 'dark');
  });

  test('nothing saved, or a corrupt value, loads as system default', async () => {
    await setThemeMode('dark');
    await AsyncStorage.clear();
    assert.equal(await loadThemeMode(), 'system');
    await AsyncStorage.setItem(THEME_MODE_KEY, 'purple');
    assert.equal(await loadThemeMode(), 'system');
  });

  test('screens are told when the theme changes, once per change', async () => {
    let calls = 0;
    const off = subscribeThemeMode(() => { calls++; });
    await setThemeMode('dark');
    await setThemeMode('dark'); // unchanged: no re-render for nobody
    await setThemeMode('light');
    assert.equal(calls, 2);
    off();
  });

  test('a screen that stopped listening is not told', async () => {
    let calls = 0;
    const off = subscribeThemeMode(() => { calls++; });
    off();
    await setThemeMode('dark');
    assert.equal(calls, 0);
  });

  test('unreadable storage on startup falls back to the current theme instead of throwing', async () => {
    await setThemeMode('dark');
    const real = AsyncStorage.getItem;
    AsyncStorage.getItem = async () => { throw new Error('storage down'); };
    try {
      assert.equal(await loadThemeMode(), 'dark');
    } finally {
      AsyncStorage.getItem = real;
    }
  });

  test('a theme still applies at once even if saving it fails', async () => {
    const real = AsyncStorage.setItem;
    AsyncStorage.setItem = async () => { throw new Error('disk full'); };
    try {
      await setThemeMode('dark');
      assert.equal(getThemeMode(), 'dark');
    } finally {
      AsyncStorage.setItem = real;
    }
  });

  test('every listener is told, not just the first', async () => {
    const seen = [];
    const offs = [1, 2, 3].map(n => subscribeThemeMode(() => seen.push(n)));
    await setThemeMode('dark');
    assert.deepEqual(seen, [1, 2, 3]);
    offs.forEach(off => off());
  });
});
