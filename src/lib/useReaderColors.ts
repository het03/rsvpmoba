import { READER_COLORS, type ReaderColors, type Theme } from '@/lib/readerPrefs';
import { fadeDuration } from '@/lib/themeFade';
import { createThemeTween } from '@/lib/themeTween';
import { useEffect, useRef, useSyncExternalStore } from 'react';

/**
 * The background and text colour of a book theme, fading between themes when the reader picks another one.
 *
 * Each caller keeps its own fade, started on its first draw, so a screen that opens already on Dark never fades
 * from Light. `ready` says when the real theme is known (a screen still loading its saved settings passes false):
 * the colours switch at once until then, and fade only afterwards. The colours are '#rrggbb', so the reader can
 * still add two hex digits for a see-through shade.
 */
export function useReaderColors(theme: Theme, ready: boolean = true): ReaderColors {
  const target = READER_COLORS[theme];
  const tweenRef = useRef<ReturnType<typeof createThemeTween<ReaderColors>> | null>(null);
  if (!tweenRef.current) tweenRef.current = createThemeTween<ReaderColors>();
  const tween = tweenRef.current;
  const armed = useRef(false);

  const shown = useSyncExternalStore(tween.subscribe, tween.get, tween.get);
  useEffect(() => {
    tween.setTarget(target, ready && armed.current ? fadeDuration() : 0);
    if (ready) armed.current = true;
  }, [tween, target, ready]);
  // Before the first colours are set the wanted ones are used directly, so nothing draws in the wrong colours.
  return shown ?? target;
}
