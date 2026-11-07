import BookCard from '@/components/BookCard';
import { getDb, type Book } from '@/db';
import { useAppTheme } from '@/lib/appTheme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type RecentBook = Book & { progress: number };

const DEMO_WORDS = ['focus', 'faster', 'reading', 'without', 'losing', 'words'];
const ORP_COLOR = '#C94040';

function orpIndex(w: string) {
  return w.length <= 1 ? 0 : w.length <= 5 ? 1 : w.length <= 9 ? 2 : 3;
}

function RsvpDemo({ color }: { color: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI(n => (n + 1) % DEMO_WORDS.length), 450);
    return () => clearInterval(t);
  }, []);
  const w = DEMO_WORDS[i];
  const o = orpIndex(w);
  const style = { color, fontFamily: 'Fraunces-Regular', fontSize: 22 };
  return (
    <View style={demoStyles.row}>
      <View style={demoStyles.left}><Text style={style} numberOfLines={1}>{w.slice(0, o)}</Text></View>
      <Text style={[style, { color: ORP_COLOR, fontFamily: 'Fraunces-Bold' }]}>{w[o]}</Text>
      <View style={demoStyles.right}><Text style={style} numberOfLines={1}>{w.slice(o + 1)}</Text></View>
    </View>
  );
}

const demoStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', width: '100%', height: 36 },
  left: { flex: 1, alignItems: 'flex-end' },
  right: { flex: 1, alignItems: 'flex-start' },
});

export default function ReaderTab() {
  const theme = useAppTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [books, setBooks] = useState<RecentBook[] | null>(null);
  const [wpm, setWpm] = useState<number | null>(null);

  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => {
      const db = await getDb();
      const rows = await db.getAllAsync<{
        id: number; title: string; author: string; cover_data: string | null;
        format: string; file_path: string; file_size: number; date_added: number;
        total_words: number; word_index: number;
      }>(
        `SELECT b.id, b.title, b.author, b.cover_data, b.format, b.file_path,
                b.file_size, b.date_added, b.total_words, rp.word_index
         FROM books b
         JOIN reading_positions rp ON rp.book_id = b.id
         ORDER BY rp.updated_at DESC
         LIMIT 8`
      );
      const stored = await AsyncStorage.getItem('rsvpWpm').catch(() => null);
      if (!active) return;
      setWpm(stored ? Number(stored) : null);
      setBooks(rows.map(r => ({
        id: r.id, title: r.title, author: r.author ?? '', coverData: r.cover_data ?? null,
        format: r.format as Book['format'], filePath: r.file_path, fileSize: r.file_size,
        dateAdded: r.date_added, totalWords: r.total_words,
        progress: r.total_words > 0 ? Math.min(1, r.word_index / r.total_words) : 0,
      })));
    })().catch(() => { if (active) setBooks([]); });
    return () => { active = false; };
  }, []));

  const current = books?.[0];
  const others = books?.slice(1) ?? [];
  const heroW = Math.min(160, Math.floor(width * 0.42));
  const open = (id: number, mode?: 'rsvp') =>
    router.push((mode ? `/reader/${id}?mode=${mode}` : `/reader/${id}`) as any);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.bg }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <Text style={[styles.heading, { color: theme.text }]}>Continue reading</Text>

        {books === null ? null : !current ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>Nothing in progress yet</Text>
            <Text style={[styles.emptySub, { color: theme.textSub }]}>
              Open a book from your shelf and it will show up here, ready to read or RSVP.
            </Text>
            <TouchableOpacity
              onPress={() => router.replace('/')}
              style={[styles.emptyBtn, { borderColor: theme.border }]}
            >
              <Text style={[styles.emptyBtnText, { color: theme.text }]}>Go to shelf</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.hero}>
              <BookCard
                book={current}
                cardWidth={heroW}
                cardHeight={Math.floor(heroW * 1.5)}
                progress={current.progress}
                onPress={() => open(current.id)}
                onLongPress={() => {}}
              />
              <View style={styles.heroInfo}>
                <Text numberOfLines={3} style={[styles.bookTitle, { color: theme.text }]}>{current.title}</Text>
                {!!current.author && (
                  <Text numberOfLines={1} style={[styles.bookAuthor, { color: theme.textSub }]}>{current.author}</Text>
                )}
                <Text style={[styles.bookProgress, { color: theme.textSub }]}>
                  {Math.round(current.progress * 100)}% read
                </Text>
              </View>
            </View>

            <View style={styles.modes}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => open(current.id)}
                style={[styles.mode, { borderColor: theme.borderSubtle, backgroundColor: theme.surface }]}
              >
                <View style={styles.modeVisual}>
                  {[0.9, 1, 0.8, 1, 0.55].map((w, i) => (
                    <View key={i} style={[styles.line, { width: `${w * 100}%`, backgroundColor: theme.text + '33' }]} />
                  ))}
                </View>
                <Text style={[styles.modeTitle, { color: theme.text }]}>Read</Text>
                <Text style={[styles.modeSub, { color: theme.textSub }]}>Scroll, at your pace</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => open(current.id, 'rsvp')}
                style={[styles.mode, { borderColor: theme.borderSubtle, backgroundColor: theme.surface }]}
              >
                <View style={styles.modeVisual}>
                  <RsvpDemo color={theme.text} />
                </View>
                <Text style={[styles.modeTitle, { color: theme.text }]}>RSVP</Text>
                <Text style={[styles.modeSub, { color: theme.textSub }]}>
                  {wpm ? `Flash at ${wpm} WPM` : 'One word at a time'}
                </Text>
              </TouchableOpacity>
            </View>

            {others.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Jump back in</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recents}>
                  {others.map(b => (
                    <BookCard
                      key={b.id}
                      book={b}
                      cardWidth={96}
                      cardHeight={144}
                      progress={b.progress}
                      onPress={() => open(b.id)}
                      onLongPress={() => open(b.id, 'rsvp')}
                    />
                  ))}
                </ScrollView>
                <Text style={[styles.tip, { color: theme.textSub }]}>Long-press a book to open it in RSVP.</Text>
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 110 },
  heading: { fontFamily: 'Fraunces-Regular', fontSize: 26 },
  hero: { flexDirection: 'row', gap: 16, marginTop: 20, alignItems: 'flex-end' },
  heroInfo: { flex: 1, gap: 4, paddingBottom: 4 },
  bookTitle: { fontFamily: 'Fraunces-Regular', fontSize: 20, lineHeight: 26 },
  bookAuthor: { fontFamily: 'Inter-Regular', fontSize: 13 },
  bookProgress: { fontFamily: 'Inter-Medium', fontSize: 12, marginTop: 6 },
  modes: { flexDirection: 'row', gap: 12, marginTop: 24 },
  mode: { flex: 1, borderWidth: 1, borderRadius: 16, padding: 16, gap: 4 },
  modeVisual: { height: 64, justifyContent: 'center', gap: 6, marginBottom: 8 },
  line: { height: 4, borderRadius: 2 },
  modeTitle: { fontFamily: 'Inter-SemiBold', fontSize: 16 },
  modeSub: { fontFamily: 'Inter-Regular', fontSize: 12 },
  sectionTitle: {
    fontFamily: 'Inter-SemiBold', fontSize: 12, letterSpacing: 0.4,
    textTransform: 'uppercase', marginTop: 32, marginBottom: 12,
  },
  recents: { gap: 12 },
  tip: { fontFamily: 'Inter-Regular', fontSize: 11, marginTop: 10 },
  empty: { alignItems: 'center', gap: 8, paddingTop: 80, paddingHorizontal: 12 },
  emptyTitle: { fontFamily: 'Fraunces-Italic', fontSize: 20, textAlign: 'center' },
  emptySub: { fontFamily: 'Inter-Regular', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  emptyBtn: { marginTop: 12, borderWidth: 1, borderRadius: 20, paddingHorizontal: 20, paddingVertical: 10 },
  emptyBtnText: { fontFamily: 'Inter-SemiBold', fontSize: 13 },
});
