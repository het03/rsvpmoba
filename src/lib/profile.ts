// The reader's profile: who is signed in, kept on this phone. Nothing here talks to a server. Once Google sign-in is
// added, it will fill this in with the account's name, email and photo; until then the profile is "signed out".
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Profile = { name: string; email: string; photoUrl: string | null };

export const PROFILE_KEY = 'profile';
export const GUEST_NAME = 'Guest reader';

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/**
 * Reads a saved profile. Anything that isn't a usable one (nothing saved, damaged data, no name and no email) means
 * signed out (null). A photo is only kept if it is a web address.
 */
export function parseProfile(raw: string | null): Profile | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    const name = text(data.name);
    const email = text(data.email);
    if (!name && !email) return null;
    const photo = text(data.photoUrl);
    return { name: name || email, email, photoUrl: /^https?:\/\//i.test(photo) ? photo : null };
  } catch {
    return null;
  }
}

/** Up to two capital letters for an avatar: "Het Gajera" → "HG", "het" → "H". "?" when there is nothing to use. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w));
  if (words.length === 0) return '?';
  const first = (w: string) => Array.from(w.match(/[\p{L}\p{N}]/u)?.[0] ?? '')[0] ?? '';
  const letters = words.length === 1 ? first(words[0]) : first(words[0]) + first(words[words.length - 1]);
  return letters.toUpperCase();
}

export async function loadProfile(): Promise<Profile | null> {
  return parseProfile(await AsyncStorage.getItem(PROFILE_KEY).catch(() => null));
}

export async function saveProfile(profile: Profile): Promise<void> {
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile)).catch(() => {});
}

/** Signs out on this phone: the profile is forgotten. Books, stats and saved words are not touched. */
export async function clearProfile(): Promise<void> {
  await AsyncStorage.removeItem(PROFILE_KEY).catch(() => {});
}
