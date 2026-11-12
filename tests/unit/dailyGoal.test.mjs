import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { GOAL_MAX, GOAL_MIN, GOAL_STEP, goalProgress, parseGoal, shouldNotifyGoal, stepGoal } from '../../src/lib/dailyGoal.ts';

describe('parseGoal', () => {
  test('accepts whole numbers in range', () => {
    assert.equal(parseGoal('500'), 500);
    assert.equal(parseGoal('20000'), 20000);
  });

  test('anything else means no goal', () => {
    for (const bad of [null, '', 'abc', '0', '499', '20001', '1500.5', '-500']) assert.equal(parseGoal(bad), 0, String(bad));
  });
});

describe('stepGoal', () => {
  test('from off, up lands on the minimum and down stays off', () => {
    assert.equal(stepGoal(0, 1), GOAL_MIN);
    assert.equal(stepGoal(0, -1), 0);
  });

  test('moves by one step', () => {
    assert.equal(stepGoal(2000, 1), 2000 + GOAL_STEP);
    assert.equal(stepGoal(2000, -1), 2000 - GOAL_STEP);
  });

  test('stepping down from the minimum turns the goal off', () => {
    assert.equal(stepGoal(GOAL_MIN, -1), 0);
  });

  test('stops at the maximum', () => {
    assert.equal(stepGoal(GOAL_MAX, 1), GOAL_MAX);
  });
});

describe('goalProgress', () => {
  test('fraction of the goal, capped at 1, and 0 with no goal', () => {
    assert.equal(goalProgress(250, 1000), 0.25);
    assert.equal(goalProgress(5000, 1000), 1);
    assert.equal(goalProgress(500, 0), 0);
    assert.equal(goalProgress(0, 1000), 0);
  });
});

describe('shouldNotifyGoal', () => {
  const base = { goal: 1000, todayWords: 1200, sessionWords: 400, firedOn: null, today: '2026-11-12' };

  test('fires when the session carries today across the goal', () => {
    assert.equal(shouldNotifyGoal(base), true);
  });

  test('fires when the session lands exactly on the goal', () => {
    assert.equal(shouldNotifyGoal({ ...base, todayWords: 1000, sessionWords: 100 }), true);
  });

  test('does not fire below the goal', () => {
    assert.equal(shouldNotifyGoal({ ...base, todayWords: 900, sessionWords: 400 }), false);
  });

  test('does not fire when the goal was already met before this session', () => {
    assert.equal(shouldNotifyGoal({ ...base, todayWords: 1500, sessionWords: 200 }), false);
  });

  test('fires only once a day', () => {
    assert.equal(shouldNotifyGoal({ ...base, firedOn: '2026-11-12' }), false);
    assert.equal(shouldNotifyGoal({ ...base, firedOn: '2026-11-11' }), true);
  });

  test('never fires with no goal', () => {
    assert.equal(shouldNotifyGoal({ ...base, goal: 0 }), false);
  });
});
