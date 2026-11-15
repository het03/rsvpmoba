import AsyncStorage from '@react-native-async-storage/async-storage';

export type Theme = 'light' | 'dark' | 'sepia';

/** Which typeface the page text uses. 'default' keeps each format's own look: system font for TXT, Georgia for EPUB. */
export type ReaderFont = 'default' | 'serif' | 'sans';

export type ReaderPrefs = {
  fontSize: number;
  lineHeight: number;
  theme: Theme;
  brightness: number; // 0.2–1.0; mapped to a black overlay opacity of (1 - brightness)
  font: ReaderFont;
  /** RSVP mode: colour the focus letter of each word. Off shows the word in one colour (it is still centred on it). */
  orpHighlight: boolean;
};

// `link` overrides hyperlink color in EPUBs; null keeps the book's own link color.
export const THEMES: Record<Theme, { bg: string; fg: string; name: Theme; link: string | null }> = {
  light: { bg: '#FFFFFF', fg: '#1B1B2F', name: 'light', link: null },
  dark:  { bg: '#141418', fg: '#E8E6DF', name: 'dark', link: '#8FB4E8' },
  sepia: { bg: '#F4ECD8', fg: '#3B2A1A', name: 'sepia', link: null },
};

/** Just the two colours of each book theme, as fixed objects, so the reader can fade between them (see useReaderColors). */
export type ReaderColors = { bg: string; fg: string };
export const READER_COLORS: Record<Theme, ReaderColors> = {
  light: { bg: THEMES.light.bg, fg: THEMES.light.fg },
  dark: { bg: THEMES.dark.bg, fg: THEMES.dark.fg },
  sepia: { bg: THEMES.sepia.bg, fg: THEMES.sepia.fg },
};

export const READER_FONTS: { font: ReaderFont; label: string }[] = [
  { font: 'default', label: 'Default' },
  { font: 'serif', label: 'Serif' },
  { font: 'sans', label: 'Sans' },
];

// The reader pages run in a WebView, which can't see the fonts bundled with the app, so these are system font stacks.
// Only double quotes inside, because the EPUB page puts a stack inside a single-quoted script string.
const SERIF = 'Georgia, "Times New Roman", serif';
const SANS = '"Helvetica Neue", Helvetica, Arial, Roboto, sans-serif';
const SYSTEM = '-apple-system, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** The CSS font-family for a font choice in a given kind of book. */
export function fontStack(font: ReaderFont, format: 'txt' | 'epub'): string {
  if (font === 'serif') return SERIF;
  if (font === 'sans') return SANS;
  return format === 'epub' ? SERIF : SYSTEM;
}

export const DEFAULT_PREFS: ReaderPrefs = { fontSize: 17, lineHeight: 1.7, theme: 'light', brightness: 1.0, font: 'default', orpHighlight: true };
const STORAGE_KEY = 'readerPrefs';

// Saved data can be from an older version or damaged, so a field of the wrong kind falls back to its default.
function sanitize(saved: unknown): ReaderPrefs {
  const s = (saved && typeof saved === 'object' ? saved : {}) as Record<string, unknown>;
  const merged = { ...DEFAULT_PREFS, ...s } as ReaderPrefs;
  return {
    ...merged,
    font: READER_FONTS.some(f => f.font === merged.font) ? merged.font : DEFAULT_PREFS.font,
    orpHighlight: typeof merged.orpHighlight === 'boolean' ? merged.orpHighlight : DEFAULT_PREFS.orpHighlight,
  };
}

export async function loadPrefs(): Promise<ReaderPrefs> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? sanitize(JSON.parse(raw)) : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function savePrefs(prefs: ReaderPrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {}
}
