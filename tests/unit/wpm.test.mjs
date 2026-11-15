import AsyncStorage from '@react-native-async-storage/async-storage';
import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { DEFAULT_WPM, loadWpm, MAX_WPM, MIN_WPM, parseWpm, saveWpm, stepWpm, WPM_KEY, WPM_STEP } from '../../src/lib/wpm.ts';

describe('parseWpm', () => {
  test('accepts whole numbers in range, ends included', () => {
    assert.equal(parseWpm('300'), 300);
    assert.equal(parseWpm(String(MIN_WPM)), MIN_WPM);
    assert.equal(parseWpm(String(MAX_WPM)), MAX_WPM);
  });

  test('anything else is the default', () => {
    for (const bad of [null, '', ' ', 'fast', '99', '1001', '300.5', '-300', 'NaN', 'Infinity']) {
      assert.equal(parseWpm(bad), DEFAULT_WPM, String(bad));
    }
  });
});

describe('stepWpm', () => {
  test('moves by whole steps either way', () => {
    assert.equal(stepWpm(300, 1), 300 + WPM_STEP);
    assert.equal(stepWpm(300, -1), 300 - WPM_STEP);
    assert.equal(stepWpm(300, 4), 400);
  });

  test('stops at the limits', () => {
    assert.equal(stepWpm(MAX_WPM, 1), MAX_WPM);
    assert.equal(stepWpm(MIN_WPM, -1), MIN_WPM);
    assert.equal(stepWpm(990, 5), MAX_WPM);
  });
});

describe('wpm storage', () => {
  beforeEach(() => AsyncStorage.clear());

  test('nothing saved is the default; a saved speed comes back', async () => {
    assert.equal(await loadWpm(), DEFAULT_WPM);
    await saveWpm(450);
    assert.equal(await loadWpm(), 450);
  });

  test('is the value the RSVP reader stores, so Settings and the reader agree', async () => {
    await saveWpm(525);
    assert.equal(await AsyncStorage.getItem(WPM_KEY), '525');
    await AsyncStorage.setItem(WPM_KEY, 'garbage');
    assert.equal(await loadWpm(), DEFAULT_WPM);
  });
});
