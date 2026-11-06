import EpubReader from '@/components/Reader/EpubReader';
import ReaderTray from '@/components/Reader/ReaderTray';
import TxtReader from '@/components/Reader/TxtReader';
import ProgressBar from '@/components/Shared/ProgressBar';
import { getDb, type Book } from '@/db';
import { type ReaderPrefs, THEMES, loadPrefs } from '@/lib/readerPrefs';
import { webGetFile } from '@/lib/webFileStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ReaderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [book, setBook] = useState<Book | null>(null);
  const [prefs, setPrefs] = useState<ReaderPrefs>({ fontSize: 17, lineHeight: 1.7, theme: 'light', brightness: 1.0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trayOpen, setTrayOpen] = useState(false);

  // TXT state
  const [txtContent, setTxtContent] = useState('');
  const [totalWords, setTotalWords] = useState(0);
  const [wordIndex, setWordIndex] = useState(0);

  // EPUB state — holds a URL (blob: on web, file:// on native) rather than base64 data.
  // Avoids passing megabytes of book data through the React Native bridge.
  const [epubSrc, setEpubSrc] = useState('');
  // Cached epub.js location index — loaded before epubSrc so it's ready when
  // EpubReader mounts. Stored as a ref (not state) to avoid an extra render cycle.
  const epubCachedLocsRef = useRef<string | null>(null);

  // Revoke the blob URL when it changes or the reader unmounts (web only).
  useEffect(() => {
    return () => {
      if (Platform.OS === 'web' && epubSrc.startsWith('blob:')) {
        URL.revokeObjectURL(epubSrc);
      }
    };
  }, [epubSrc]);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestWordIndex = useRef(0);

  const savePosition = useCallback(async (bookId: number, idx: number) => {
    try {
      const db = await getDb();
      await db.runAsync(
        'INSERT OR REPLACE INTO reading_positions (book_id, word_index, updated_at) VALUES (?, ?, ?)',
        [bookId, idx, Date.now()]
      );
    } catch {}
  }, []);

  const handleWordIndex = useCallback((idx: number) => {
    latestWordIndex.current = idx;
    setWordIndex(idx);
    if (book) {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => savePosition(book.id, idx), 3000);
    }
  }, [book, savePosition]);

  const handleTotalWords = useCallback((count: number) => {
    setTotalWords(count);
    if (book && count !== book.totalWords) {
      getDb().then(db =>
        db.runAsync('UPDATE books SET total_words = ? WHERE id = ?', [count, book.id])
      ).catch(() => {});
    }
  }, [book]);

  useEffect(() => {
    if (!id) return;

    async function load() {
      try {
        setLoading(true);
        const [db, prefs] = await Promise.all([getDb(), loadPrefs()]);
        setPrefs(prefs);

        const rows = await db.getAllAsync<{
          id: number; title: string; format: string;
          file_path: string; file_size: number; date_added: number; total_words: number;
        }>('SELECT * FROM books WHERE id = ?', [Number(id)]);

        if (rows.length === 0) { setError('Book not found'); return; }

        const r = rows[0];
        const b: Book = {
          id: r.id, title: r.title, format: r.format as Book['format'],
          filePath: r.file_path, fileSize: r.file_size,
          dateAdded: r.date_added, totalWords: r.total_words,
        };
        setBook(b);
        setTotalWords(b.totalWords);

        // Load saved position
        const posRows = await db.getAllAsync<{ word_index: number }>(
          'SELECT word_index FROM reading_positions WHERE book_id = ?', [b.id]
        );
        const resumeAt = posRows[0]?.word_index ?? 0;
        setWordIndex(resumeAt);
        latestWordIndex.current = resumeAt;

        if (Platform.OS === 'web') {
          const buf = await webGetFile(b.filePath);
          if (!buf) {
            setError('File not found in storage.\n\nThis book was imported in a previous session. Please remove it and re-import to read it.');
            return;
          }
          if (b.format === 'txt') {
            const text = new TextDecoder().decode(buf);
            setTxtContent(text);
            const wc = text.split(/\s+/).filter(Boolean).length;
            setTotalWords(wc);
          } else {
            epubCachedLocsRef.current = await AsyncStorage.getItem(`epub_locs_${b.id}`);
            // Create a Blob URL — epub.js fetches it directly with no encoding overhead.
            const blob = new Blob([buf], { type: 'application/epub+zip' });
            setEpubSrc(URL.createObjectURL(blob));
          }
        } else if (b.format === 'txt') {
          const text = await FileSystem.readAsStringAsync(b.filePath);
          setTxtContent(text);
          const wc = text.split(/\s+/).filter(Boolean).length;
          setTotalWords(wc);
          if (wc !== b.totalWords) {
            await db.runAsync('UPDATE books SET total_words = ? WHERE id = ?', [wc, b.id]);
          }
        } else {
          epubCachedLocsRef.current = await AsyncStorage.getItem(`epub_locs_${b.id}`);
          // Pass the file:// URI directly — no base64 round-trip, no bridge transfer.
          setEpubSrc(b.filePath);
        }
      } catch (e: any) {
        setError(e?.message ?? 'Failed to load book');
      } finally {
        setLoading(false);
      }
    }

    load();

    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        if (book) savePosition(book.id, latestWordIndex.current);
      }
    };
  }, [id]);

  useEffect(() => {
    if (!trayOpen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setTrayOpen(false);
      return true;
    });
    return () => sub.remove();
  }, [trayOpen]);

  const progress = totalWords > 0 ? Math.min(1, wordIndex / totalWords) : 0;

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color="#1E1E1E" />
      </SafeAreaView>
    );
  }

  if (error || !book) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorTitle}>Can't open book</Text>
        <Text style={styles.errorText}>{error ?? 'Book not found'}</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const theme = THEMES[prefs.theme];

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      {/* Header */}
      <SafeAreaView edges={['top']} style={[styles.header, { backgroundColor: theme.bg, borderColor: `${theme.fg}18` }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn} hitSlop={12}>
          <Text style={[styles.headerBtnText, { color: theme.fg }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.fg }]} numberOfLines={1}>{book.title}</Text>
        <TouchableOpacity onPress={() => setTrayOpen(v => !v)} style={styles.headerBtn} hitSlop={12}>
          <Text style={[styles.headerBtnText, { color: theme.fg }]}>Aa</Text>
        </TouchableOpacity>
      </SafeAreaView>

      {/* Progress */}
      <View style={styles.progressRow}>
        <ProgressBar value={progress} color={theme.fg} />
      </View>

      {/* Brightness overlay — pointerEvents none so touches pass through to content */}
      {(prefs.brightness ?? 1) < 1 && (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, {
            backgroundColor: '#000000',
            opacity: 1 - (prefs.brightness ?? 1),
            zIndex: 10,
          }]}
        />
      )}

      {/* Content */}
      {book.format === 'txt' ? (
        <TxtReader
          content={txtContent}
          totalWords={totalWords}
          initialWordIndex={wordIndex}
          prefs={prefs}
          onWordIndex={handleWordIndex}
        />
      ) : (
        <EpubReader
          epubSrc={epubSrc}
          cachedLocations={epubCachedLocsRef.current}
          totalWords={totalWords}
          initialWordIndex={wordIndex}
          prefs={prefs}
          onWordIndex={handleWordIndex}
          onTotalWords={handleTotalWords}
          onSaveLocations={(data) => book && AsyncStorage.setItem(`epub_locs_${book.id}`, data).catch(() => {})}
        />
      )}

      {/* Settings tray */}
      <ReaderTray
        visible={trayOpen}
        prefs={prefs}
        onChange={setPrefs}
        onClose={() => setTrayOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    gap: 16,
  },
  errorTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: '#1E1E1E',
    textAlign: 'center',
  },
  errorText: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: '#808080',
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: 20,
  },
  backBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CCCCCC',
  },
  backBtnText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
    color: '#1E1E1E',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderColor: '#F0F0F0',
    backgroundColor: '#FFFFFF',
  },
  headerBtn: {
    minWidth: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerBtnText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 18,
    color: '#1E1E1E',
  },
  headerTitle: {
    flex: 1,
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: '#1E1E1E',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  progressRow: {
    paddingHorizontal: 0,
  },
});
