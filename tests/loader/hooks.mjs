// Module resolution for tests: maps the app's "@/..." alias to src/, and swaps phone-only libraries
// (React Native, Expo file system, SQLite, AsyncStorage) for small stand-ins in tests/shims.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const SHIMS = {
  'react-native': 'react-native.mjs',
  'expo-file-system/legacy': 'expo-file-system.mjs',
  'expo-sqlite': 'expo-sqlite.mjs',
  'expo-notifications': 'expo-notifications.mjs',
  '@react-native-async-storage/async-storage': 'async-storage.mjs',
};

export async function resolve(specifier, context, nextResolve) {
  if (SHIMS[specifier]) {
    return { url: pathToFileURL(path.join(root, 'tests', 'shims', SHIMS[specifier])).href, shortCircuit: true };
  }
  if (specifier.startsWith('@/')) {
    const rest = specifier.slice(2);
    for (const candidate of [`${rest}.ts`, `${rest}.tsx`, path.join(rest, 'index.ts')]) {
      const full = path.join(root, 'src', candidate);
      if (fs.existsSync(full)) return { url: pathToFileURL(full).href, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}
