import AsyncStorage from '@react-native-async-storage/async-storage';
import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { clearProfile, initials, loadProfile, parseProfile, PROFILE_KEY, saveProfile } from '../../src/lib/profile.ts';

describe('parseProfile', () => {
  test('a saved profile comes back with its name, email and photo', () => {
    const raw = JSON.stringify({ name: 'Het Gajera', email: 'het@example.com', photoUrl: 'https://example.com/a.png' });
    assert.deepEqual(parseProfile(raw), { name: 'Het Gajera', email: 'het@example.com', photoUrl: 'https://example.com/a.png' });
  });

  test('nothing saved, damaged data, or the wrong kind of data means signed out', () => {
    for (const bad of [null, '', '{not json', 'null', '[]', '"text"', '42', '{}', '{"name":"","email":" "}', '{"name":5}']) {
      assert.equal(parseProfile(bad), null, String(bad));
    }
  });

  test('an email alone is enough: it is shown as the name', () => {
    assert.deepEqual(parseProfile('{"email":"a@b.co"}'), { name: 'a@b.co', email: 'a@b.co', photoUrl: null });
  });

  test('only a web address is kept as the photo', () => {
    for (const photo of ['', 'file:///x.png', 'javascript:alert(1)', 'data:image/png;base64,AAAA', '/local/path.png', 7, null]) {
      assert.equal(parseProfile(JSON.stringify({ name: 'A', photoUrl: photo })).photoUrl, null, String(photo));
    }
    assert.equal(parseProfile('{"name":"A","photoUrl":"http://x.test/a.png"}').photoUrl, 'http://x.test/a.png');
  });

  test('spaces around the name and email are trimmed', () => {
    assert.deepEqual(parseProfile('{"name":"  Het  ","email":" a@b.co "}'), { name: 'Het', email: 'a@b.co', photoUrl: null });
  });
});

describe('initials', () => {
  test('first and last word give two letters; one word gives one', () => {
    assert.equal(initials('Het Gajera'), 'HG');
    assert.equal(initials('het'), 'H');
    assert.equal(initials('Mary Jane Watson'), 'MW');
  });

  test('upper-cases, trims, and skips punctuation and extra spaces', () => {
    assert.equal(initials('  ada   lovelace '), 'AL');
    assert.equal(initials('"Ada" — Lovelace'), 'AL');
    assert.equal(initials('- ada'), 'A');
  });

  test('works for other scripts and accents', () => {
    assert.equal(initials('éva nagy'), 'ÉN');
    assert.equal(initials('사랑'), '사');
  });

  test('nothing usable is a question mark', () => {
    for (const none of ['', '   ', '— …', '😀']) assert.equal(initials(none), '?', none);
  });
});

describe('profile storage', () => {
  beforeEach(() => AsyncStorage.clear());

  test('signed out until a profile is saved; a saved one comes back', async () => {
    assert.equal(await loadProfile(), null);
    await saveProfile({ name: 'Het', email: 'h@x.co', photoUrl: null });
    assert.deepEqual(await loadProfile(), { name: 'Het', email: 'h@x.co', photoUrl: null });
  });

  test('signing out forgets the profile, and does nothing harmful when already signed out', async () => {
    await saveProfile({ name: 'Het', email: '', photoUrl: null });
    await clearProfile();
    assert.equal(await loadProfile(), null);
    assert.equal(await AsyncStorage.getItem(PROFILE_KEY), null);
    await clearProfile();
  });

  test('signing out leaves other saved settings alone', async () => {
    await AsyncStorage.setItem('dailyGoal', '1500');
    await AsyncStorage.setItem('readerPrefs', '{"fontSize":20}');
    await saveProfile({ name: 'Het', email: '', photoUrl: null });
    await clearProfile();
    assert.equal(await AsyncStorage.getItem('dailyGoal'), '1500');
    assert.equal(await AsyncStorage.getItem('readerPrefs'), '{"fontSize":20}');
  });
});
