// When theme changes fade, and for how long. Shared by the app theme and the book reader's own theme, so both follow
// the same rules.
import { AccessibilityInfo } from 'react-native';

/** How long the colours take to change when the theme does. */
export const THEME_FADE_MS = 240;

// Held off until the first screen is up, so a saved theme loading at start-up never shows as a fade, and skipped for
// people who have turned animations off in the phone's accessibility settings.
let enabled = false;
let reduceMotion = false;

/** Call once the first screen is about to draw. From then on, theme changes fade instead of switching at once. */
export function enableThemeFades(): void {
  if (enabled) return;
  enabled = true;
  AccessibilityInfo.isReduceMotionEnabled().then(on => { reduceMotion = on; }).catch(() => {});
  AccessibilityInfo.addEventListener('reduceMotionChanged', on => { reduceMotion = on; });
}

/** The fade length to use right now: THEME_FADE_MS, or 0 (switch at once) before fades are enabled or with reduce motion on. */
export function fadeDuration(): number {
  return enabled && !reduceMotion ? THEME_FADE_MS : 0;
}
