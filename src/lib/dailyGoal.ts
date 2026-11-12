// Daily word goal: pure rules, kept free of native imports so they can be unit tested. Storage and the
// notification itself live in goalNotifier.ts.

export const GOAL_KEY = 'dailyGoal';
export const GOAL_FIRED_KEY = 'dailyGoalFiredOn';

export const GOAL_STEP = 500;
export const GOAL_MIN = 500;
export const GOAL_MAX = 20000;

/** Parses a stored goal; anything that isn't a whole number in range means "no goal" (0). */
export function parseGoal(raw: string | null): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= GOAL_MIN && n <= GOAL_MAX ? n : 0;
}

/** Steps a goal up or down. From "off" (0) the first step up lands on GOAL_MIN; stepping down from GOAL_MIN turns it off. */
export function stepGoal(goal: number, direction: 1 | -1): number {
  if (goal === 0) return direction === 1 ? GOAL_MIN : 0;
  const next = goal + direction * GOAL_STEP;
  if (next < GOAL_MIN) return 0;
  return Math.min(GOAL_MAX, next);
}

/** Fraction of the goal reached today, 0–1. No goal reads as 0. */
export function goalProgress(todayWords: number, goal: number): number {
  return goal > 0 ? Math.min(1, todayWords / goal) : 0;
}

/**
 * Notify once per day, at the moment a session carries today's total across the goal: not when it was already
 * met before this session, and not again after the first notification today.
 */
export function shouldNotifyGoal(args: {
  goal: number;
  todayWords: number;
  sessionWords: number;
  firedOn: string | null;
  today: string;
}): boolean {
  const { goal, todayWords, sessionWords, firedOn, today } = args;
  if (goal <= 0 || firedOn === today) return false;
  return todayWords >= goal && todayWords - sessionWords < goal;
}
