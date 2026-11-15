// RSVP reading speed: its limits and how it is stored. The reader remembers the last speed you used, and the Settings
// screen edits that same saved value, so "default speed" is simply where the next session starts.
import AsyncStorage from '@react-native-async-storage/async-storage';

export const WPM_KEY = 'rsvpWpm';
export const MIN_WPM = 100;
export const MAX_WPM = 1000;
export const WPM_STEP = 25;
export const DEFAULT_WPM = 300;

/** Parses a stored speed; anything that isn't a whole number in range means "not set" (DEFAULT_WPM). */
export function parseWpm(raw: string | null): number {
  const n = Number(raw);
  return raw !== null && raw.trim() !== '' && Number.isInteger(n) && n >= MIN_WPM && n <= MAX_WPM ? n : DEFAULT_WPM;
}

/** Moves a speed by whole steps and keeps it in range. */
export function stepWpm(wpm: number, steps: number): number {
  return Math.min(MAX_WPM, Math.max(MIN_WPM, wpm + steps * WPM_STEP));
}

export async function loadWpm(): Promise<number> {
  return parseWpm(await AsyncStorage.getItem(WPM_KEY).catch(() => null));
}

export async function saveWpm(wpm: number): Promise<void> {
  await AsyncStorage.setItem(WPM_KEY, String(wpm)).catch(() => {});
}
