// Index (into the raw word) of the Optimal Recognition Point letter.
export function getOrpIndex(word: string): number {
  const leading = word.match(/^[^\p{L}\p{N}]*/u)?.[0].length ?? 0;
  const core = word.slice(leading).match(/^[\p{L}\p{N}'’-]*/u)?.[0].length ?? 0;
  const offset = core <= 1 ? 0 : core <= 5 ? 1 : core <= 9 ? 2 : core <= 13 ? 3 : 4;
  return Math.min(word.length - 1, leading + offset);
}
