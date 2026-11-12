// Guesses which Latin-script language a passage is in, from how many of its words are very common function words.
// Returns a Wiktionary language code, or null when the passage is too short or too evenly split to tell.

const STOPWORDS: Record<string, string> = {
  en: 'the and of to in that is was he she it with for as his her had not you they but on at by this from be have are',
  de: 'der die das und nicht ist ein eine ich sie er es zu mit den dem von auf für auch war sich wie aber nach noch im des zum zur dass wir sind',
  fr: 'le la les des et est un une que qui dans pour pas je il elle vous nous avec sur ne au du ce se sont mais plus par',
  es: 'el la los las y que de en un una es por con para no se su lo como pero más al del fue son este esta',
  it: 'il lo la gli le di che e un una per non con è sono ma come del della nel più anche questo era ho si',
  pt: 'o a os as de que e um uma não para com é do da em se mas como mais foi por ao dos das sua ele ela',
  nl: 'de het een en van dat is niet op te ik je hij zij ze met voor maar ook zijn dit er aan als was had wat',
};

const SETS = Object.entries(STOPWORDS).map(([code, words]) => [code, new Set(words.split(' '))] as const);

export const MIN_EVIDENCE = 3;

/** The language code of `text`, or null if it can't be told. Needs at least MIN_EVIDENCE common words and a clear lead. */
export function detectLanguage(text: string): string | null {
  const words = text.toLowerCase().match(/[\p{L}\p{M}]+/gu);
  if (!words || words.length === 0) return null;

  const scores = SETS.map(([code, set]) => {
    let n = 0;
    for (const w of words) if (set.has(w)) n++;
    return [code, n] as const;
  }).sort((a, b) => b[1] - a[1]);

  const [best, second] = scores;
  if (best[1] < MIN_EVIDENCE) return null;
  return best[1] >= second[1] * 1.5 ? best[0] : null;
}
