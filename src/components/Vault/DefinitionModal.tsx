import { getDb } from '@/db';
import { useAppTheme } from '@/lib/appTheme';
import { firstWord, licenseVersion, lookupWord, summarize, type LookupResult } from '@/lib/dictionary';
import { isSaved, saveWord } from '@/lib/vault';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import CloseIcon from '../../../assets/images/uploadIcons/close.svg';
import WiktionaryCredit from './WiktionaryCredit';

/** `language` is the Wiktionary code of the language being read (see detectLanguage), or null if unknown. */
export type DefineRequest = { text: string; context: string; language: string | null };

type Props = {
  request: DefineRequest | null;
  bookId: number | null;
  bookTitle: string;
  onClose: () => void;
};

// Shows a word's definition (fetched once, then cached) and lets the reader save it with the sentence it came from.
export default function DefinitionModal({ request, bookId, bookTitle, onClose }: Props) {
  const theme = useAppTheme();
  const [result, setResult] = useState<LookupResult | null>(null);
  const [saved, setSaved] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Saved as typed, so a German noun keeps its capital letter.
  const word = request ? firstWord(request.text) : '';
  const context = request?.context ?? '';

  useEffect(() => {
    if (!request) return;
    let live = true;
    setResult(null);
    setSaved(false);
    getDb()
      .then(async db => {
        const [r, already] = await Promise.all([
          lookupWord(db, request.text, fetch, Date.now(), request.language),
          isSaved(db, firstWord(request.text), request.context),
        ]);
        if (!live) return;
        setResult(r);
        setSaved(already);
      })
      .catch(e => {
        console.warn('[dict] lookup failed:', e);
        if (live) setResult({ status: 'unavailable' });
      });
    return () => { live = false; };
  }, [request, attempt]);

  const save = async () => {
    if (result?.status !== 'found') return;
    setSaved(true);
    const db = await getDb();
    await saveWord(db, { word, definition: summarize(result.entry), context, bookId, bookTitle }).catch(() => setSaved(false));
  };

  return (
    <Modal visible={!!request} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.modal, { backgroundColor: theme.surface }]} onPress={() => undefined}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={[styles.word, { color: theme.text }]} numberOfLines={1}>
                {result?.status === 'found' ? result.entry.word : word || 'Define'}
              </Text>
              {result?.status === 'found' && !!(result.entry.language || result.entry.phonetic) && (
                <Text style={[styles.phonetic, { color: theme.textSub }]}>
                  {[result.entry.language, result.entry.phonetic].filter(Boolean).join(' · ')}
                </Text>
              )}
            </View>
            <TouchableOpacity style={[styles.close, { borderColor: theme.borderSubtle }]} onPress={onClose} hitSlop={10}>
              <CloseIcon width={8} height={8} color={theme.text} />
            </TouchableOpacity>
          </View>

          {result === null && <ActivityIndicator color={theme.textSub} style={styles.loading} />}

          {result?.status === 'found' && (
            <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
              {result.entry.meanings.map((m, i) => (
                <View key={i} style={styles.meaning}>
                  {m.partOfSpeech !== '' && <Text style={[styles.pos, { color: theme.textSub }]}>{m.partOfSpeech}</Text>}
                  <Text style={[styles.definition, { color: theme.text }]}>{m.definition}</Text>
                  {m.example !== undefined && <Text style={[styles.example, { color: theme.textSub }]}>“{m.example}”</Text>}
                </View>
              ))}
              {context !== '' && (
                <View style={[styles.context, { borderColor: theme.borderSubtle }]}>
                  <Text style={[styles.pos, { color: theme.textSub }]}>In your book</Text>
                  <Text style={[styles.contextText, { color: theme.text }]}>{context}</Text>
                </View>
              )}
            </ScrollView>
          )}

          {result?.status === 'not-found' && (
            <Text style={[styles.message, { color: theme.textSub }]}>
              No definition found for “{word}”. Try selecting just the word itself. Inflected forms, like a Korean noun with its
              particle attached, often aren&apos;t listed.
            </Text>
          )}
          {result?.status === 'unavailable' && (
            <Text style={[styles.message, { color: theme.textSub }]}>
              Couldn&apos;t reach the dictionary. Check your connection and try again. Words you&apos;ve looked up before still work offline.
            </Text>
          )}

          <View style={styles.footer}>
            {result?.status === 'unavailable' && (
              <TouchableOpacity style={[styles.secondary, { borderColor: theme.borderSubtle }]} onPress={() => setAttempt(n => n + 1)}>
                <Text style={[styles.secondaryText, { color: theme.textSub }]}>Try again</Text>
              </TouchableOpacity>
            )}
            {result?.status === 'found' && (
              <TouchableOpacity
                style={[styles.primary, { backgroundColor: theme.text, opacity: saved ? 0.5 : 1 }]}
                onPress={save}
                disabled={saved}
              >
                <Text style={[styles.primaryText, { color: theme.bg }]}>{saved ? 'Saved to vault' : 'Save to vault'}</Text>
              </TouchableOpacity>
            )}
          </View>

          {result?.status === 'found' && <WiktionaryCredit word={result.entry.word} versions={[licenseVersion(result.entry)]} />}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  modal: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '75%',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 14,
    boxShadow: '0px 0px 30px rgba(30, 30, 30, 0.25)',
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 },
  headerText: { flex: 1, paddingRight: 12, gap: 2 },
  word: { fontFamily: 'Fraunces-Regular', fontSize: 24 },
  phonetic: { fontFamily: 'Inter-Regular', fontSize: 12 },
  close: { width: 20, height: 20, justifyContent: 'center', alignItems: 'center', borderWidth: 0.5, borderRadius: 4 },
  loading: { marginVertical: 24 },
  body: { flexGrow: 0, marginBottom: 14 },
  meaning: { marginBottom: 12, gap: 3 },
  pos: { fontFamily: 'Inter-SemiBold', fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase' },
  definition: { fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 19 },
  example: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 18, fontStyle: 'italic' },
  context: { borderTopWidth: 1, paddingTop: 12, gap: 4 },
  contextText: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 18, fontStyle: 'italic' },
  message: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 18, marginBottom: 16 },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10 },
  secondary: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 7 },
  secondaryText: { fontFamily: 'Inter-SemiBold', fontSize: 10 },
  primary: { borderRadius: 6, paddingHorizontal: 14, paddingVertical: 7 },
  primaryText: { fontFamily: 'Inter-SemiBold', fontSize: 10 },
});
