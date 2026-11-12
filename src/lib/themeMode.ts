// The app's theme setting: follow the phone, or force light or dark. Pure rules, so they can be unit tested.

export type ThemeMode = 'system' | 'light' | 'dark';

export const THEME_MODE_KEY = 'themeMode';

export const THEME_MODES: { mode: ThemeMode; label: string }[] = [
  { mode: 'system', label: 'System default' },
  { mode: 'light', label: 'Light' },
  { mode: 'dark', label: 'Dark' },
];

/** Reads a saved value; anything unrecognised means "follow the phone". */
export function parseThemeMode(raw: string | null): ThemeMode {
  return raw === 'light' || raw === 'dark' ? raw : 'system';
}

/** The scheme to draw with: the forced one, or the phone's (light when the phone doesn't say). */
export function resolveScheme(mode: ThemeMode, system: string | null | undefined): 'light' | 'dark' {
  if (mode === 'system') return system === 'dark' ? 'dark' : 'light';
  return mode;
}
