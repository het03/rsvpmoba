import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  addDays,
  calcStreaks,
  chartPoints,
  dateKey,
  formatHour,
  linePath,
  peakHour,
  periodStarts,
} from '../../src/lib/stats.ts';

// Local-time timestamps, so the tests hold in any time zone.
const at = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();

describe('dateKey / addDays', () => {
  test('formats the local calendar day with zero padding', () => {
    assert.equal(dateKey(at(2026, 3, 7, 0, 5)), '2026-03-07');
    assert.equal(dateKey(at(2026, 12, 31, 23, 59)), '2026-12-31');
  });

  test('moves across month and year boundaries and leap days', () => {
    assert.equal(addDays('2026-03-01', -1), '2026-02-28');
    assert.equal(addDays('2026-01-01', -1), '2025-12-31');
    assert.equal(addDays('2028-03-01', -1), '2028-02-29');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addDays('2026-05-10', 0), '2026-05-10');
  });

  test('is not thrown off by daylight-saving changes', () => {
    // Walking back day by day across the spring and autumn clock changes never skips or repeats a day.
    for (const start of ['2026-03-31', '2026-11-03', '2026-10-28']) {
      const seen = new Set();
      let key = start;
      for (let i = 0; i < 20; i++) { seen.add(key); key = addDays(key, -1); }
      assert.equal(seen.size, 20, start);
    }
  });
});

describe('periodStarts', () => {
  test('midnight today, Monday of this week, 1st of the month', () => {
    // Wednesday 11 Nov 2026
    const s = periodStarts(at(2026, 11, 11, 15, 30));
    assert.equal(s.day, at(2026, 11, 11, 0));
    assert.equal(s.week, at(2026, 11, 9, 0));
    assert.equal(s.month, at(2026, 11, 1, 0));
  });

  test('on a Monday the week starts today; on a Sunday it started six days ago', () => {
    assert.equal(periodStarts(at(2026, 11, 9, 8)).week, at(2026, 11, 9, 0));
    assert.equal(periodStarts(at(2026, 11, 15, 23)).week, at(2026, 11, 9, 0));
  });

  test('the week can start in the previous month or year', () => {
    // Thursday 1 Jan 2026 → Monday 29 Dec 2025
    const s = periodStarts(at(2026, 1, 1, 10));
    assert.equal(s.week, at(2025, 12, 29, 0));
    assert.equal(s.month, at(2026, 1, 1, 0));
  });
});

describe('calcStreaks', () => {
  const now = at(2026, 11, 11, 14);

  test('no sessions: no streak', () => {
    assert.deepEqual(calcStreaks([], now), { current: 0, longest: 0 });
  });

  test('read today only: 1', () => {
    assert.deepEqual(calcStreaks(['2026-11-11'], now), { current: 1, longest: 1 });
  });

  test('counts consecutive days ending today', () => {
    const keys = ['2026-11-11', '2026-11-10', '2026-11-09'];
    assert.deepEqual(calcStreaks(keys, now), { current: 3, longest: 3 });
  });

  test("today having no session yet doesn't break the streak (grace until midnight)", () => {
    const keys = ['2026-11-10', '2026-11-09', '2026-11-08'];
    assert.deepEqual(calcStreaks(keys, now), { current: 3, longest: 3 });
  });

  test('a missed whole day ends the current streak but keeps the longest', () => {
    const keys = ['2026-11-09', '2026-11-08', '2026-11-07', '2026-11-06'];
    assert.deepEqual(calcStreaks(keys, now), { current: 0, longest: 4 });
  });

  test('a gap splits runs; current is the latest run, longest the biggest', () => {
    const keys = ['2026-11-11', '2026-11-10', '2026-11-07', '2026-11-06', '2026-11-05', '2026-11-04'];
    assert.deepEqual(calcStreaks(keys, now), { current: 2, longest: 4 });
  });

  test('order and duplicates do not matter', () => {
    const keys = ['2026-11-09', '2026-11-11', '2026-11-10', '2026-11-11', '2026-11-10'];
    assert.deepEqual(calcStreaks(keys, now), { current: 3, longest: 3 });
  });

  test('runs across month and year ends', () => {
    const keys = ['2026-01-02', '2026-01-01', '2025-12-31', '2025-12-30'];
    assert.deepEqual(calcStreaks(keys, at(2026, 1, 2, 9)), { current: 4, longest: 4 });
  });

  test('longest is never below current', () => {
    const keys = ['2026-11-11'];
    const r = calcStreaks(keys, now);
    assert.ok(r.longest >= r.current);
  });
});

describe('peakHour / formatHour', () => {
  test('no sessions: null', () => {
    assert.equal(peakHour([]), null);
  });

  test('the hour with the most starts', () => {
    const starts = [at(2026, 11, 1, 21, 5), at(2026, 11, 2, 21, 50), at(2026, 11, 3, 8, 0), at(2026, 11, 4, 21, 0)];
    assert.equal(peakHour(starts), 21);
  });

  test('a tie goes to the earlier hour', () => {
    assert.equal(peakHour([at(2026, 11, 1, 22), at(2026, 11, 2, 7)]), 7);
  });

  test('midnight hour is found', () => {
    assert.equal(peakHour([at(2026, 11, 1, 0, 30), at(2026, 11, 2, 0, 10), at(2026, 11, 3, 9)]), 0);
  });

  test('12-hour labels', () => {
    assert.equal(formatHour(0), '12 AM');
    assert.equal(formatHour(9), '9 AM');
    assert.equal(formatHour(12), '12 PM');
    assert.equal(formatHour(21), '9 PM');
    assert.equal(formatHour(23), '11 PM');
  });
});

describe('chartPoints / linePath', () => {
  const layout = { width: 300, height: 100, padX: 10, padY: 10 };

  test('no values, no points', () => {
    assert.deepEqual(chartPoints([], layout), []);
  });

  test('spans the padded box: oldest at the left, newest at the right, fastest at the top', () => {
    const pts = chartPoints([200, 400, 300], layout);
    assert.equal(pts[0].x, 10);
    assert.equal(pts[2].x, 290);
    assert.equal(pts[1].y, 10); // 400 is the max → top padding line
    assert.equal(pts[0].y, 90); // 200 is the min → bottom padding line
    assert.equal(pts[2].y, 50);
  });

  test('a single value sits in the middle', () => {
    assert.deepEqual(chartPoints([350], layout), [{ x: 150, y: 50 }]);
  });

  test('a flat series is a level line through the middle (no divide by zero)', () => {
    const pts = chartPoints([300, 300, 300], layout);
    assert.ok(pts.every(p => p.y === 50 && Number.isFinite(p.x)));
  });

  test('every point stays inside the padded box', () => {
    const pts = chartPoints([120, 980, 455, 301, 301, 760], layout);
    for (const p of pts) {
      assert.ok(p.x >= 10 && p.x <= 290, `x ${p.x}`);
      assert.ok(p.y >= 10 && p.y <= 90, `y ${p.y}`);
    }
  });

  test('path data starts with M and joins with L', () => {
    assert.equal(linePath([{ x: 1, y: 2 }, { x: 3.14159, y: 4 }]), 'M 1.0 2.0 L 3.1 4.0');
    assert.equal(linePath([]), '');
  });
});
