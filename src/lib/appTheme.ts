import { useEffect, useSyncExternalStore } from 'react';
import { useColorScheme } from 'react-native';
import { fadeDuration } from '@/lib/themeFade';
import { resolveScheme, type ThemeMode } from '@/lib/themeMode';
import { getThemeMode, subscribeThemeMode } from '@/lib/themeStore';
import { createThemeTween } from '@/lib/themeTween';

/** The app's accent red: the reader's focus letter, the speed chart, the heatmap, and switches and + / − buttons. */
export const ACCENT_RED = '#C94040';

export type AppTheme = {
  scheme: 'light' | 'dark';
  bg: string;
  surface: string;        // modal / card surface
  text: string;           // primary text
  textSub: string;        // secondary / muted text
  border: string;         // icon buttons, search bar
  borderSubtle: string;   // close buttons, file rows
  inputBg: string;        // search / input background
  navBg: string;
  navBorder: string;
  navIconInactive: string;
  navIconActiveBg: string;
  navIconActiveColor: string;
};

const LIGHT: AppTheme = {
  scheme: 'light',
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  text: '#1E1E1E',
  textSub: '#808080',
  border: '#1E1E1E',
  borderSubtle: '#CCCCCC',
  inputBg: '#FAFAFA',
  navBg: '#FFFFFF',
  navBorder: 'rgba(156, 163, 175, 0.5)',
  navIconInactive: '#9CA3AF',
  navIconActiveBg: '#1E1E1E',
  navIconActiveColor: '#FFFFFF',
};

const DARK: AppTheme = {
  scheme: 'dark',
  bg: '#111111',
  surface: '#1C1C1E',
  text: '#F0F0F0',
  textSub: 'rgba(240,240,240,0.5)',
  border: 'rgba(240,240,240,0.75)',
  borderSubtle: 'rgba(240,240,240,0.15)',
  inputBg: '#2C2C2E',
  navBg: '#1C1C1E',
  navBorder: 'rgba(255,255,255,0.08)',
  navIconInactive: 'rgba(255,255,255,0.4)',
  navIconActiveBg: '#F0F0F0',
  navIconActiveColor: '#111111',
};

/** The saved theme setting (System default, Light or Dark); re-renders when it changes. */
export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(subscribeThemeMode, getThemeMode, getThemeMode);
}

export { enableThemeFades, THEME_FADE_MS } from '@/lib/themeFade';

const tween = createThemeTween<AppTheme>();

/** The theme that is wanted: the saved setting, or the phone's. Changes in one step, with no fade. */
export function useTargetTheme(): AppTheme {
  const mode = useThemeMode();
  const system = useColorScheme();
  return resolveScheme(mode, system) === 'dark' ? DARK : LIGHT;
}

/**
 * The theme to draw with. When the setting (or the phone's light/dark mode) changes, this moves through the colours in
 * between, so the whole app fades together; screens just use the colours it returns, as before.
 */
export function useAppTheme(): AppTheme {
  const target = useTargetTheme();
  const shown = useSyncExternalStore(tween.subscribe, tween.get, tween.get);
  useEffect(() => {
    tween.setTarget(target, fadeDuration());
  }, [target]);
  // Before the first theme is set the wanted one is used directly, so nothing draws in the wrong colours.
  return shown ?? target;
}
