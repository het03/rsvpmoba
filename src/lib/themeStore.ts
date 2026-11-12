// Holds the saved theme setting in memory (so every screen updates the moment it changes) and in storage.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseThemeMode, THEME_MODE_KEY, type ThemeMode } from '@/lib/themeMode';

let current: ThemeMode = 'system';
const listeners = new Set<() => void>();

export const getThemeMode = (): ThemeMode => current;

export function subscribeThemeMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function set(mode: ThemeMode) {
  if (mode === current) return;
  current = mode;
  listeners.forEach(l => l());
}

/** Reads the saved setting. Call once at startup, before the first screen draws, so nothing flashes the wrong theme. */
export async function loadThemeMode(): Promise<ThemeMode> {
  try {
    set(parseThemeMode(await AsyncStorage.getItem(THEME_MODE_KEY)));
  } catch {
    // Unreadable storage just means the default.
  }
  return current;
}

/** Applies a new setting everywhere at once, then saves it. */
export async function setThemeMode(mode: ThemeMode): Promise<void> {
  set(mode);
  await AsyncStorage.setItem(THEME_MODE_KEY, mode).catch(() => {});
}
