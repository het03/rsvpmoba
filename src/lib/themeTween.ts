// Fades the app from one theme to the next. It holds the theme currently on screen (which is part-way between two
// during a fade) and tells subscribers on every frame, so every screen repaints together. The clock is injectable, so
// the timing can be tested without waiting.
import { blendTheme, easeInOut } from '@/lib/themeBlend';

export type Clock = {
  now: () => number;
  request: (callback: () => void) => unknown;
  cancel: (handle: unknown) => void;
};

const hasFrames = typeof requestAnimationFrame === 'function';
export const frameClock: Clock = {
  now: () => Date.now(),
  request: cb => (hasFrames ? requestAnimationFrame(cb) : setTimeout(cb, 16)),
  cancel: h => (hasFrames ? cancelAnimationFrame(h as number) : clearTimeout(h as ReturnType<typeof setTimeout>)),
};

export function createThemeTween<T extends Record<string, string>>(clock: Clock = frameClock) {
  let shown: T | null = null;
  let target: T | null = null;
  let handle: unknown = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(l => l());

  const stop = () => {
    if (handle !== null) clock.cancel(handle);
    handle = null;
  };

  return {
    /** The theme on screen right now, or null before the first one is set. */
    get: (): T | null => shown,

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },

    /**
     * Fade to `next` over `duration` ms, starting from whatever is on screen (so changing again mid-fade turns around
     * smoothly). The first theme, and a zero duration, are applied at once. Asking again for the theme already being
     * shown or faded to does nothing, so every screen can ask.
     */
    setTarget(next: T, duration: number): void {
      if (target === next) return;
      target = next;
      stop();
      if (shown === null || !(duration > 0)) {
        shown = next;
        notify();
        return;
      }
      const from = shown;
      const start = clock.now();
      const step = () => {
        const p = (clock.now() - start) / duration;
        if (p >= 1) {
          handle = null;
          shown = next;
          notify();
          return;
        }
        shown = blendTheme(from, next, easeInOut(p));
        notify();
        handle = clock.request(step);
      };
      handle = clock.request(step);
    },
  };
}
