// The theme fade: what is on screen at each moment, with a clock the test controls.
import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { createThemeTween } from '../../src/lib/themeTween.ts';

const LIGHT = { bg: '#FFFFFF', scheme: 'light' };
const DARK = { bg: '#111111', scheme: 'dark' };

// A clock where time only moves when the test says so, and frames run only when it asks for them.
function fakeClock() {
  let time = 0;
  let nextId = 1;
  const pending = new Map();
  return {
    now: () => time,
    request: (cb) => { const id = nextId++; pending.set(id, cb); return id; },
    cancel: (id) => { pending.delete(id); },
    /** Move time forward and run the frame that was waiting, if any. */
    tick(ms) {
      time += ms;
      const [id, cb] = [...pending.entries()][0] ?? [];
      if (id !== undefined) { pending.delete(id); cb(); }
    },
    waiting: () => pending.size,
  };
}

let clock;
let tween;
let notified;
beforeEach(() => {
  clock = fakeClock();
  tween = createThemeTween(clock);
  notified = 0;
  tween.subscribe(() => { notified++; });
});

describe('theme tween', () => {
  test('nothing is shown until a theme is set', () => {
    assert.equal(tween.get(), null);
  });

  test('the first theme is applied at once, with no fade', () => {
    tween.setTarget(LIGHT, 240);
    assert.equal(tween.get(), LIGHT);
    assert.equal(clock.waiting(), 0);
    assert.equal(notified, 1);
  });

  test('a zero duration (fades off) switches at once', () => {
    tween.setTarget(LIGHT, 240);
    tween.setTarget(DARK, 0);
    assert.equal(tween.get(), DARK);
    assert.equal(clock.waiting(), 0);
  });

  test('a change fades through colours in between, and lands on the real theme', () => {
    tween.setTarget(LIGHT, 200);
    tween.setTarget(DARK, 200);
    assert.equal(tween.get(), LIGHT, 'still the old theme before the first frame');

    clock.tick(100);
    const mid = tween.get();
    assert.notEqual(mid.bg, LIGHT.bg);
    assert.notEqual(mid.bg, DARK.bg);
    assert.match(mid.bg, /^#[0-9a-f]{6}$/);

    clock.tick(150);
    assert.equal(tween.get(), DARK, 'the finished fade is the theme itself');
    assert.equal(clock.waiting(), 0, 'no frames are left running');
  });

  test('every frame tells subscribers, and the colour moves one way', () => {
    tween.setTarget(LIGHT, 200);
    tween.setTarget(DARK, 200);
    const before = notified;
    const reds = [];
    for (let i = 0; i < 4; i++) {
      clock.tick(40);
      reds.push(parseInt(tween.get().bg.slice(1, 3), 16));
    }
    assert.equal(notified - before, 4);
    for (let i = 1; i < reds.length; i++) assert.ok(reds[i] <= reds[i - 1], `frame ${i}: ${reds}`);
  });

  test('asking for the theme already wanted does nothing, so every screen can ask', () => {
    tween.setTarget(LIGHT, 200);
    tween.setTarget(DARK, 200);
    const waiting = clock.waiting();
    tween.setTarget(DARK, 200);
    tween.setTarget(DARK, 200);
    assert.equal(clock.waiting(), waiting);
    clock.tick(300);
    assert.equal(tween.get(), DARK);
    const count = notified;
    tween.setTarget(DARK, 200);
    assert.equal(notified, count);
  });

  test('changing again mid-fade turns around from where it is, instead of jumping', () => {
    tween.setTarget(LIGHT, 200);
    tween.setTarget(DARK, 200);
    clock.tick(100);
    const part = tween.get();
    tween.setTarget(LIGHT, 200);
    assert.equal(tween.get(), part, 'no jump when the new fade starts');
    clock.tick(300);
    assert.equal(tween.get(), LIGHT);
    assert.equal(clock.waiting(), 0);
  });

  test('a fade cancelled by a newer one leaves no frame running for the old one', () => {
    tween.setTarget(LIGHT, 200);
    tween.setTarget(DARK, 200);
    clock.tick(50);
    tween.setTarget(LIGHT, 0);
    assert.equal(clock.waiting(), 0);
    assert.equal(tween.get(), LIGHT);
  });

  test('the theme name flips at the middle of the fade', () => {
    tween.setTarget(LIGHT, 200);
    tween.setTarget(DARK, 200);
    clock.tick(60);
    assert.equal(tween.get().scheme, 'light');
    clock.tick(80);
    assert.equal(tween.get().scheme, 'dark');
  });

  test('unsubscribing stops the calls', () => {
    const extra = [];
    const off = tween.subscribe(() => extra.push(1));
    tween.setTarget(LIGHT, 0);
    off();
    tween.setTarget(DARK, 0);
    assert.equal(extra.length, 1);
  });
});
