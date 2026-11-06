import AsyncStorage from '@react-native-async-storage/async-storage';

export type Theme = 'light' | 'dark' | 'sepia';

export type ReaderPrefs = {
  fontSize: number;
  lineHeight: number;
  theme: Theme;
  brightness: number; // 0.2–1.0; mapped to a black overlay opacity of (1 - brightness)
};

export const THEMES: Record<Theme, { bg: string; fg: string; name: Theme }> = {
  light: { bg: '#FFFFFF', fg: '#1B1B2F', name: 'light' },
  dark:  { bg: '#141418', fg: '#E8E6DF', name: 'dark' },
  sepia: { bg: '#F4ECD8', fg: '#3B2A1A', name: 'sepia' },
};

const DEFAULT_PREFS: ReaderPrefs = { fontSize: 17, lineHeight: 1.7, theme: 'light', brightness: 1.0 };
const STORAGE_KEY = 'readerPrefs';

export async function loadPrefs(): Promise<ReaderPrefs> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function savePrefs(prefs: ReaderPrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {}
}
