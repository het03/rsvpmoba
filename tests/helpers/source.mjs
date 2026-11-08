import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const readSource = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

// Pulls a SQL statement out of a source file so tests run the app's real query, not a copy that could drift.
// Fails loudly if the statement can no longer be found.
export function sqlFrom(relative, pattern) {
  const match = readSource(relative).match(pattern);
  if (!match) throw new Error(`SQL not found in ${relative}: ${pattern}`);
  return (match[1] ?? match[0]).trim();
}
