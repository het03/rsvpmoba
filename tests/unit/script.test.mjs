import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { CURSIVE_RE, RTL_RE, isUnsupportedBook } from '../../src/rsvp/script.ts';

const hebrew = 'שלום';
const arabic = 'مرحبا';
const persian = 'سلام';
const hindi = 'नमस्ते';
const thai = 'สวัสดี';
const chinese = '这是一个没有空格的中文句子需要处理';
const japanese = 'これは日本語の文章でスペースがありません';
const korean = '안녕하세요';

describe('RTL_RE', () => {
  test('matches right-to-left scripts', () => {
    for (const w of [hebrew, arabic, persian]) assert.equal(RTL_RE.test(w), true);
  });
  test('does not match left-to-right scripts', () => {
    for (const w of ['hello', 'привет', hindi, thai, chinese, korean, '1984'])
      assert.equal(RTL_RE.test(w), false, w);
  });
});

describe('CURSIVE_RE', () => {
  test('Arabic-script words are cursive (letters join)', () => {
    for (const w of [arabic, persian]) assert.equal(CURSIVE_RE.test(w), true);
  });
  test('Hebrew is right-to-left but not cursive', () => {
    assert.equal(CURSIVE_RE.test(hebrew), false);
  });
  test('other scripts are not cursive', () => {
    for (const w of ['hello', hindi, thai, chinese]) assert.equal(CURSIVE_RE.test(w), false, w);
  });
});

describe('isUnsupportedBook', () => {
  const many = (word, n = 60) => Array(n).fill(word);

  test('mostly long unspaced Chinese, Japanese or Thai runs are unsupported', () => {
    for (const w of [chinese, japanese, 'นี่คือประโยคภาษาไทย'])
      assert.equal(isUnsupportedBook(many(w)), true);
  });
  test('English, Korean, Arabic, Hebrew and Hindi are supported', () => {
    for (const w of ['word', 'extraordinarily', korean, arabic, hebrew, hindi])
      assert.equal(isUnsupportedBook(many(w)), false, w);
  });
  test('a mostly English book with a stray CJK phrase is supported', () => {
    assert.equal(isUnsupportedBook([...many('word', 200), chinese]), false);
  });
  test('short CJK tokens (a few characters) are not treated as unsupported', () => {
    assert.equal(isUnsupportedBook(many('中文')), false);
  });
  test('empty book is not "unsupported"', () => {
    assert.equal(isUnsupportedBook([]), false);
  });
  test('samples large books without scanning every word', () => {
    const big = many('word', 200000);
    const started = performance.now();
    assert.equal(isUnsupportedBook(big), false);
    assert.ok(performance.now() - started < 200, 'should be fast on 200k words');
  });
});
