// Reading statistics, all computed on-device from the `sessions` table (written by the RSVP reader).
// The date and chart maths is pure so it can be tested without a phone; only loadStats touches the database.
import type { SQLiteDatabase } from 'expo-sqlite';

// A book counts as finished at this progress fraction. Must match COMPLETE_THRESHOLD in app/index.tsx
// (the shelf's Completed section) so the two screens always agree; a test checks they do.
export const COMPLETE_THRESHOLD = 0.999;

// How many recent sessions the speed trend shows.
export const TREND_SESSIONS = 30;

// How many calendar weeks (Monday to Sunday, the current one included) the reading heatmap shows.
export const HEATMAP_WEEKS = 17;

export type Stats = {
  words: { today: number; week: number; month: number; total: number };
  /** Average WPM of the most recent sessions, oldest first. */
  trend: number[];
  /** Start time of each session in `trend`, same order, so a point on the chart can be dated. */
  trendTimes: number[];
  streak: { current: number; longest: number };
  /** Words read per local day ('YYYY-MM-DD'), for the days in the heatmap window that had any reading. */
  days: Record<string, number>;
  dna: {
    /** Hour of day (0–23) you most often start reading, or null with no sessions. */
    peakHour: number | null;
    /** Mean of every session's average WPM. */
    avgWpm: number;
    booksFinished: number;
    sessions: number;
  };
};

export const EMPTY_STATS: Stats = {
  words: { today: 0, week: 0, month: 0, total: 0 },
  trend: [],
  trendTimes: [],
  streak: { current: 0, longest: 0 },
  days: {},
  dna: { peakHour: null, avgWpm: 0, booksFinished: 0, sessions: 0 },
};

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar day of a timestamp as 'YYYY-MM-DD'. */
export function dateKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The day `n` calendar days from a 'YYYY-MM-DD' key (negative = earlier). Calendar maths, so DST can't skip a day. */
export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d + n).getTime());
}

/** Local midnight at the start of a 'YYYY-MM-DD' day, as a timestamp. */
export function dayStart(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** '2026-11-12' → 'Thu, Nov 12'. Written out by hand so it reads the same on every device and locale. */
export function formatDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return `${WEEKDAYS[new Date(y, m - 1, d).getDay()]}, ${MONTHS[m - 1]} ${d}`;
}

/** Local midnight today, the most recent Monday, and the 1st of this month, as timestamps. */
export function periodStarts(now: number): { day: number; week: number; month: number } {
  const d = new Date(now);
  const y = d.getFullYear();
  const m = d.getMonth();
  const date = d.getDate();
  const sinceMonday = (d.getDay() + 6) % 7;
  return {
    day: new Date(y, m, date).getTime(),
    week: new Date(y, m, date - sinceMonday).getTime(),
    month: new Date(y, m, 1).getTime(),
  };
}

/**
 * Consecutive-day streaks from the days you read ('YYYY-MM-DD' keys, any order, duplicates fine).
 * The current streak survives today having no session yet (you still have until midnight): it counts back from
 * today if you've read today, otherwise from yesterday, and is 0 once a whole day has been missed.
 */
export function calcStreaks(keys: string[], now: number): { current: number; longest: number } {
  const days = new Set(keys);
  if (days.size === 0) return { current: 0, longest: 0 };

  let longest = 0;
  for (const day of days) {
    if (days.has(addDays(day, -1))) continue; // not the start of a run
    let len = 1;
    while (days.has(addDays(day, len))) len++;
    if (len > longest) longest = len;
  }

  const today = dateKey(now);
  let cursor = days.has(today) ? today : addDays(today, -1);
  let current = 0;
  while (days.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  return { current, longest: Math.max(longest, current) };
}

/** The hour of day (0–23, local) with the most session starts; the earlier hour wins a tie. Null with no sessions. */
export function peakHour(startTimes: number[]): number | null {
  if (startTimes.length === 0) return null;
  const counts = new Array<number>(24).fill(0);
  for (const t of startTimes) counts[new Date(t).getHours()]++;
  let best = 0;
  for (let h = 1; h < 24; h++) if (counts[h] > counts[best]) best = h;
  return best;
}

/** 0 → '12 AM', 9 → '9 AM', 12 → '12 PM', 21 → '9 PM'. */
export function formatHour(hour: number): string {
  return `${hour % 12 === 0 ? 12 : hour % 12} ${hour < 12 ? 'AM' : 'PM'}`;
}

export type ChartLayout = { width: number; height: number; padX: number; padY: number };
export type ChartPoint = { x: number; y: number };

/**
 * Plots values (oldest first) into a width × height box with padding. The y axis spans the data's own min–max so a
 * trend is visible even when speeds are close together; a flat series draws as a centred line, and a single value
 * sits in the middle. Larger values are higher (smaller y).
 */
export function chartPoints(values: number[], { width, height, padX, padY }: ChartLayout): ChartPoint[] {
  if (values.length === 0) return [];
  const innerW = Math.max(0, width - padX * 2);
  const innerH = Math.max(0, height - padY * 2);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo;
  return values.map((v, i) => ({
    x: values.length === 1 ? width / 2 : padX + (i / (values.length - 1)) * innerW,
    y: span === 0 ? height / 2 : padY + (1 - (v - lo) / span) * innerH,
  }));
}

/** Index of the point whose x is closest to `x` (a touch position). Null when there are no points; ties go to the earlier point. */
export function nearestPointIndex(points: ChartPoint[], x: number): number | null {
  if (points.length === 0) return null;
  let best = 0;
  for (let i = 1; i < points.length; i++) {
    if (Math.abs(points[i].x - x) < Math.abs(points[best].x - x)) best = i;
  }
  return best;
}

/** SVG path data ('M x y L x y …') through the points. */
export function linePath(points: ChartPoint[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
}

export type HeatLevel = 0 | 1 | 2 | 3 | 4;
export type HeatCell = { key: string; words: number; level: HeatLevel; future: boolean };

/** 0 for a day with no reading; otherwise 1–4 by how close the day is to the busiest day shown (that day is 4). */
export function heatLevel(words: number, max: number): HeatLevel {
  if (!(words > 0) || !(max > 0)) return 0;
  return Math.min(4, Math.max(1, Math.ceil((words / max) * 4))) as HeatLevel;
}

/** The first day (a Monday) of the heatmap window that ends with the week containing `now`. */
export function heatmapStart(now: number, weeks: number = HEATMAP_WEEKS): string {
  return addDays(dateKey(periodStarts(now).week), -7 * (weeks - 1));
}

/**
 * The reading heatmap as columns of weeks, oldest first, each column Monday to Sunday. The last column is the current
 * week, whose days after today are marked `future` so they can be left blank. Levels are relative to the busiest day
 * in the window, so the map is useful whether someone reads 500 words a day or 50,000.
 */
export function heatmapWeeks(days: Record<string, number>, now: number, weeks: number = HEATMAP_WEEKS): HeatCell[][] {
  const today = dateKey(now);
  const first = heatmapStart(now, weeks);
  let max = 0;
  for (let i = 0; i < weeks * 7; i++) max = Math.max(max, days[addDays(first, i)] ?? 0);

  const columns: HeatCell[][] = [];
  for (let w = 0; w < weeks; w++) {
    const column: HeatCell[] = [];
    for (let d = 0; d < 7; d++) {
      const key = addDays(first, w * 7 + d);
      const words = days[key] ?? 0;
      column.push({ key, words, level: heatLevel(words, max), future: key > today });
    }
    columns.push(column);
  }
  return columns;
}

/** Everything the Stats screen shows, from the database. `now` is injectable for tests. */
export async function loadStats(db: SQLiteDatabase, now: number = Date.now()): Promise<Stats> {
  const starts = periodStarts(now);

  // Sessions that never recorded a word (an abandoned or killed session leaves a row with words_read = 0) are noise.
  const totals = await db.getFirstAsync<{ today: number; week: number; month: number; total: number; sessions: number; avg: number | null }>(
    `SELECT COALESCE(SUM(CASE WHEN start_time >= ? THEN words_read END), 0) AS today,
            COALESCE(SUM(CASE WHEN start_time >= ? THEN words_read END), 0) AS week,
            COALESCE(SUM(CASE WHEN start_time >= ? THEN words_read END), 0) AS month,
            COALESCE(SUM(words_read), 0) AS total,
            COUNT(*) AS sessions,
            AVG(CASE WHEN avg_wpm > 0 THEN avg_wpm END) AS avg
     FROM sessions WHERE words_read > 0`,
    [starts.day, starts.week, starts.month],
  );

  const recent = await db.getAllAsync<{ avg_wpm: number; start_time: number }>(
    'SELECT avg_wpm, start_time FROM sessions WHERE words_read > 0 AND avg_wpm > 0 ORDER BY start_time DESC LIMIT ?',
    [TREND_SESSIONS],
  );

  const startRows = await db.getAllAsync<{ start_time: number }>('SELECT start_time FROM sessions WHERE words_read > 0');
  const startTimes = startRows.map(r => r.start_time);

  // Words per local day for the heatmap window. Grouped here rather than in SQL because days are local time.
  const windowRows = await db.getAllAsync<{ start_time: number; words_read: number }>(
    'SELECT start_time, words_read FROM sessions WHERE words_read > 0 AND start_time >= ?',
    [dayStart(heatmapStart(now))],
  );
  const days: Record<string, number> = {};
  for (const r of windowRows) {
    const key = dateKey(r.start_time);
    days[key] = (days[key] ?? 0) + r.words_read;
  }

  const finished = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM books b
     JOIN reading_positions rp ON rp.book_id = b.id
     WHERE b.total_words > 0 AND rp.word_index >= b.total_words * ?`,
    [COMPLETE_THRESHOLD],
  );

  return {
    words: {
      today: totals?.today ?? 0,
      week: totals?.week ?? 0,
      month: totals?.month ?? 0,
      total: totals?.total ?? 0,
    },
    trend: recent.map(r => r.avg_wpm).reverse(),
    trendTimes: recent.map(r => r.start_time).reverse(),
    streak: calcStreaks(startTimes.map(dateKey), now),
    days,
    dna: {
      peakHour: peakHour(startTimes),
      avgWpm: Math.round(totals?.avg ?? 0),
      booksFinished: finished?.n ?? 0,
      sessions: totals?.sessions ?? 0,
    },
  };
}
