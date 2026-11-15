// Mixing two colours (and two whole themes) part-way, for the fade when the theme changes. Pure maths with no native
// imports, so it can be unit tested.

type Rgba = [number, number, number, number];

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** '#rgb', '#rrggbb', '#rrggbbaa', 'rgb(r, g, b)' or 'rgba(r, g, b, a)' to its channels; null for anything else. */
export function parseColor(input: string): Rgba | null {
  const s = input.trim();
  let m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) {
    const [r, g, b] = m[1].split('').map(c => parseInt(c + c, 16));
    return [r, g, b, 1];
  }
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(s);
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, m[2] ? parseInt(m[2], 16) / 255 : 1];
  }
  m = /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*(?:,\s*(\d*\.?\d+)\s*)?\)$/i.exec(s);
  if (m) return [clamp(+m[1], 0, 255), clamp(+m[2], 0, 255), clamp(+m[3], 0, 255), m[4] === undefined ? 1 : clamp(+m[4], 0, 1)];
  return null;
}

/**
 * The colour a fraction `t` of the way from `from` to `to` (0 is `from`, 1 is `to`). The ends are returned exactly as
 * given, so a finished fade lands on the real colour. A colour that can't be read just switches at the halfway point.
 */
export function blendColor(from: string, to: string, t: number): string {
  if (!(t > 0)) return from;
  if (t >= 1) return to;
  const a = parseColor(from);
  const b = parseColor(to);
  if (!a || !b) return t < 0.5 ? from : to;
  const mix = (i: number) => a[i] + (b[i] - a[i]) * t;
  const [r, g, bl] = [0, 1, 2].map(i => Math.round(mix(i)));
  const alpha = Math.round(mix(3) * 1000) / 1000;
  // Fully opaque results stay '#rrggbb', because the reader builds see-through shades by adding two hex digits
  // ('#1B1B2F' + '33'), which only works on a hex colour.
  if (alpha === 1) return `#${[r, g, bl].map(c => c.toString(16).padStart(2, '0')).join('')}`;
  return `rgba(${r}, ${g}, ${bl}, ${alpha})`;
}

/** Blends every colour in a theme; values that aren't colours (like the 'light' / 'dark' name) switch at halfway. */
export function blendTheme<T extends Record<string, string>>(from: T, to: T, t: number): T {
  const out = {} as Record<string, string>;
  for (const key of Object.keys(to)) out[key] = blendColor(from[key] ?? to[key], to[key], t);
  return out as T;
}

/** Gentle start and end, so the fade doesn't feel mechanical. t is 0–1. */
export function easeInOut(t: number): number {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
