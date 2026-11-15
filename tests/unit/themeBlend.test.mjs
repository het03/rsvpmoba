import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { blendColor, blendTheme, easeInOut, parseColor } from '../../src/lib/themeBlend.ts';

describe('parseColor', () => {
  test('hex in its three lengths', () => {
    assert.deepEqual(parseColor('#fff'), [255, 255, 255, 1]);
    assert.deepEqual(parseColor('#1E1E1E'), [30, 30, 30, 1]);
    assert.deepEqual(parseColor('#FF000080'), [255, 0, 0, 128 / 255]);
  });

  test('rgb and rgba, with or without spaces and a leading-dot alpha', () => {
    assert.deepEqual(parseColor('rgb(1, 2, 3)'), [1, 2, 3, 1]);
    assert.deepEqual(parseColor('rgba(240,240,240,0.5)'), [240, 240, 240, 0.5]);
    assert.deepEqual(parseColor('rgba(156, 163, 175, .25)'), [156, 163, 175, 0.25]);
  });

  test('anything else is null', () => {
    for (const bad of ['', 'red', 'light', '#ggg', '#12345', 'hsl(0, 0%, 0%)', 'rgba(1,2)']) assert.equal(parseColor(bad), null, bad);
  });
});

describe('blendColor', () => {
  test('the ends are returned exactly as given', () => {
    assert.equal(blendColor('#FFFFFF', '#111111', 0), '#FFFFFF');
    assert.equal(blendColor('#FFFFFF', '#111111', 1), '#111111');
    assert.equal(blendColor('rgba(0, 0, 0, 0.5)', '#FFFFFF', 2), '#FFFFFF');
    assert.equal(blendColor('#FFFFFF', '#111111', -1), '#FFFFFF');
    assert.equal(blendColor('#FFFFFF', '#111111', NaN), '#FFFFFF');
  });

  test('halfway is the average of each channel', () => {
    assert.equal(blendColor('#000000', '#FFFFFF', 0.5), '#808080');
    assert.equal(blendColor('#FF0000', '#0000FF', 0.5), '#800080');
  });

  test('opaque colours stay hex, so adding two hex digits for see-through still works', () => {
    const mid = blendColor('#1B1B2F', '#E8E6DF', 0.3);
    assert.match(mid, /^#[0-9a-f]{6}$/);
    assert.match(mid + '33', /^#[0-9a-f]{8}$/);
    assert.equal(blendColor('#000000', '#0A0A0A', 0.5), '#050505', 'small values are zero-padded');
  });

  test('alpha is blended too', () => {
    assert.equal(blendColor('#808080', 'rgba(240,240,240,0.5)', 0.5), 'rgba(184, 184, 184, 0.75)');
    assert.equal(blendColor('rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 1)', 0.25), 'rgba(0, 0, 0, 0.25)');
  });

  test('a colour that cannot be read switches at the halfway point', () => {
    assert.equal(blendColor('light', 'dark', 0.4), 'light');
    assert.equal(blendColor('light', 'dark', 0.6), 'dark');
    assert.equal(blendColor('#000000', 'transparent', 0.9), 'transparent');
  });
});

describe('blendTheme', () => {
  const light = { bg: '#FFFFFF', text: '#1E1E1E', scheme: 'light' };
  const dark = { bg: '#111111', text: '#F0F0F0', scheme: 'dark' };

  test('blends every colour and keeps every key', () => {
    const mid = blendTheme(light, dark, 0.5);
    assert.deepEqual(Object.keys(mid).sort(), ['bg', 'scheme', 'text']);
    assert.equal(mid.bg, '#888888');
    assert.equal(mid.text, '#878787');
  });

  test('the name switches at the halfway point, not before', () => {
    assert.equal(blendTheme(light, dark, 0.49).scheme, 'light');
    assert.equal(blendTheme(light, dark, 0.51).scheme, 'dark');
  });

  test('the ends are the themes themselves, colour for colour', () => {
    assert.deepEqual(blendTheme(light, dark, 0), light);
    assert.deepEqual(blendTheme(light, dark, 1), dark);
  });

  test('does not change either theme it was given', () => {
    const a = { ...light };
    blendTheme(a, dark, 0.3);
    assert.deepEqual(a, light);
  });
});

describe('easeInOut', () => {
  test('starts at 0, ends at 1, is half at the middle', () => {
    assert.equal(easeInOut(0), 0);
    assert.equal(easeInOut(1), 1);
    assert.equal(easeInOut(0.5), 0.5);
  });

  test('is slow at the ends and never goes backwards', () => {
    assert.ok(easeInOut(0.1) < 0.1);
    assert.ok(easeInOut(0.9) > 0.9);
    let last = 0;
    for (let i = 0; i <= 100; i++) {
      const v = easeInOut(i / 100);
      assert.ok(v >= last);
      last = v;
    }
  });

  test('stays in range for out-of-range input', () => {
    assert.equal(easeInOut(-3), 0);
    assert.equal(easeInOut(7), 1);
  });
});
