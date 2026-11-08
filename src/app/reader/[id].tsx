import EpubReader, { type HighlightTarget } from '@/components/Reader/EpubReader';
import ReaderTray from '@/components/Reader/ReaderTray';
import TxtReader from '@/components/Reader/TxtReader';
import RsvpReader from '@/components/Reader/RsvpReader';
import NoticeModal, { type Notice } from '@/components/NoticeModal';
import Scrubber from '@/components/Shared/Scrubber';
import { getDb, type Book } from '@/db';
import { parseEpub } from '@/lib/epub';
import { type ReaderPrefs, THEMES, loadPrefs } from '@/lib/readerPrefs';
import { webGetFile } from '@/lib/webFileStore';
import type { SelectionInfo } from '@/lib/selectionMenu';
import { findAnchor, findChapter, findNear, type RsvpAnchor } from '@/rsvp/anchor';
import { isUnsupportedBook } from '@/rsvp/script';
import { htmlToText, tokenize, tokenizeChapters, type Tokens } from '@/rsvp/tokenize';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Where RSVP last stopped, as an exact index into the book's word list (the saved reading position is
// only approximate, and the reader overwrites it with the word at the top of the screen).
const rsvpPosKey = (bookId: number) => `rsvp_pos_${bookId}`;
// After RSVP exits, the reader scrolls to the highlighted word and reports positions while it settles.
const SETTLE_MS = 2500;

function saveRsvpPos(bookId: number, index: number, total: number) {
  AsyncStorage.setItem(rsvpPosKey(bookId), JSON.stringify({ index, total })).catch(() => {});
}

async function loadRsvpPos(bookId: number): Promise<{ index: number; total: number } | null> {
  try {
    const raw = await AsyncStorage.getItem(rsvpPosKey(bookId));
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v.index === 'number' && typeof v.total === 'number' ? v : null;
  } catch {
    return null;
  }
}

export default function ReaderScreen() {
  const { id, mode } = useLocalSearchParams<{ id: string; mode?: string }>();
  const router = useRouter();

  const [book, setBook] = useState<Book | null>(null);
  const [prefs, setPrefs] = useState<ReaderPrefs>({ fontSize: 17, lineHeight: 1.7, theme: 'light', brightness: 1.0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trayOpen, setTrayOpen] = useState(false);

  // RSVP state. readerKey remounts the normal reader so it resumes at the RSVP exit position.
  const [rsvpTokens, setRsvpTokens] = useState<Tokens | null>(null);
  const [rsvpOpen, setRsvpOpen] = useState(false);
  const [rsvpLoading, setRsvpLoading] = useState(false);
  const [readerKey, setReaderKey] = useState(0);
  // Long-pressed spot (fraction of book) offered as an RSVP start; null when no pill is showing.
  const [rsvpFrom, setRsvpFrom] = useState<{ fraction: number; anchor?: RsvpAnchor } | null>(null);
  const rsvpChaptersRef = useRef<{ hrefs: string[]; starts: number[] } | null>(null);
  // Word to scroll to and flash when the normal reader reopens after RSVP.
  const [highlightWord, setHighlightWord] = useState<number | undefined>(undefined);
  const [highlightEpub, setHighlightEpub] = useState<HighlightTarget | null>(null);
  const [rsvpStart, setRsvpStart] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);
  // True while opening straight into RSVP, so the normal reader never flashes.
  const [launchingRsvp, setLaunchingRsvp] = useState(mode === 'rsvp');

  // TXT state
  const [txtContent, setTxtContent] = useState('');
  const [totalWords, setTotalWords] = useState(0);
  const [wordIndex, setWordIndex] = useState(0);
  // Where the readers open. Separate from the live wordIndex so progress updates don't re-render them.
  const [startWord, setStartWord] = useState(0);

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

  const bookRef = useRef<Book | null>(null);
  // Set when RSVP exits: lets us tell the reader settling on the highlighted word apart from the
  // user scrolling away, so a real scroll can drop the saved RSVP word.
  const rsvpGuard = useRef<{ activeAt: number; baseline: number | null } | null>(null);
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
    const guard = rsvpGuard.current;
    if (guard) {
      if (Date.now() < guard.activeAt || guard.baseline === null) {
        guard.baseline = idx; // still settling on the highlighted word
      } else if (Math.abs(idx - guard.baseline) >= (bookRef.current?.format === 'epub' ? 1 : 30)) {
        // The user scrolled after returning from RSVP, so the next RSVP should start from here instead.
        rsvpGuard.current = null;
        if (bookRef.current) AsyncStorage.removeItem(rsvpPosKey(bookRef.current.id)).catch(() => {});
      }
    }
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
          id: number; title: string; author: string; cover_data: string | null;
          format: string; file_path: string; file_size: number; date_added: number; total_words: number;
        }>('SELECT * FROM books WHERE id = ?', [Number(id)]);

        if (rows.length === 0) { setError('Book not found'); return; }

        const r = rows[0];
        const b: Book = {
          id: r.id, title: r.title, author: r.author ?? '',
          coverData: r.cover_data ?? null,
          format: r.format as Book['format'],
          filePath: r.file_path, fileSize: r.file_size,
          dateAdded: r.date_added, totalWords: r.total_words,
        };
        setBook(b);
        bookRef.current = b;
        setTotalWords(b.totalWords);

        // Load saved position
        const posRows = await db.getAllAsync<{ word_index: number }>(
          'SELECT word_index FROM reading_positions WHERE book_id = ?', [b.id]
        );
        const resumeAt = posRows[0]?.word_index ?? 0;
        setWordIndex(resumeAt);
        setStartWord(resumeAt);
        latestWordIndex.current = resumeAt;

        // Opening a book makes it the "current" one in the Reader tab.
        await db.runAsync(
          `INSERT INTO reading_positions (book_id, word_index, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(book_id) DO UPDATE SET updated_at = excluded.updated_at`,
          [b.id, resumeAt, Date.now()]
        );

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
        if (bookRef.current) savePosition(bookRef.current.id, latestWordIndex.current);
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

  // fromFraction is an approximate book position; anchor (a selection) pins it to the exact word.
  const startRsvp = async (fromFraction?: number, anchor?: RsvpAnchor) => {
    if (!book || rsvpLoading) return;
    setTrayOpen(false);
    let tokens = rsvpTokens;
    if (!tokens) {
      setRsvpLoading(true);
      try {
        let built: Tokens;
        if (book.format === 'txt') {
          built = tokenize(txtContent);
        } else {
          const buf = Platform.OS === 'web' ? await webGetFile(book.filePath) : undefined;
          const { chapters, hrefs } = await parseEpub(book.filePath, buf ?? undefined);
          const chapterized = tokenizeChapters(chapters.map(htmlToText));
          rsvpChaptersRef.current = { hrefs, starts: chapterized.starts };
          built = chapterized.tokens;
        }
        if (built.words.length === 0) throw new Error('No readable text in this book');
        if (isUnsupportedBook(built.words)) throw Object.assign(new Error('unsupported script'), { code: 'UNSUPPORTED' });
        tokens = built;
        setRsvpTokens(built);
      } catch (e: any) {
        if (e?.code === 'UNSUPPORTED') {
          setNotice({
            title: "RSVP isn't available for this book",
            message: "RSVP needs words separated by spaces, so it can't read Chinese, Japanese or Thai text yet. You can still read the book normally.",
          });
        } else {
          console.warn('RSVP prepare failed:', e);
        }
        setLaunchingRsvp(false);
        setRsvpFrom(null);
        return;
      } finally {
        setRsvpLoading(false);
      }
    }
    const frac = Math.min(1, Math.max(0, fromFraction ?? progress));
    const chapters = rsvpChaptersRef.current;
    const chapter = chapters && anchor?.href ? findChapter(chapters.hrefs, anchor.href) : -1;
    let idx: number;
    if (typeof anchor?.wordIndex === 'number') {
      // Plain text: the reader page already knows the exact word.
      idx = anchor.wordIndex;
    } else if (chapters && chapter >= 0 && typeof anchor?.wordOffset === 'number') {
      // Exact chapter + word offset: only a short search is needed to absorb markup differences.
      const est = chapters.starts[chapter] + anchor.wordOffset;
      idx = anchor.text ? findNear(tokens.words, est, anchor.text, 150) : est;
    } else if (anchor?.text) {
      idx = findAnchor(tokens.words, frac, anchor.text);
    } else {
      idx = Math.round(frac * tokens.words.length);
      if (fromFraction === undefined) {
        // Resuming RSVP: prefer the exact word RSVP last stopped on, unless the reader has since moved elsewhere.
        const len = tokens.words.length;
        const saved = await loadRsvpPos(book.id);
        if (saved && saved.total === len && Math.abs(saved.index / len - frac) <= Math.max(0.01, 600 / len)) {
          idx = saved.index;
        }
      }
    }
    idx = Math.min(tokens.words.length - 1, Math.max(0, idx));
    setRsvpStart(idx / tokens.words.length);
    setRsvpFrom(null);
    setRsvpOpen(true);
  };

  useEffect(() => {
    if (rsvpFrom === null || rsvpLoading) return;
    const t = setTimeout(() => setRsvpFrom(null), 5000);
    return () => clearTimeout(t);
  }, [rsvpFrom, rsvpLoading]);

  const autoStarted = useRef(false);
  useEffect(() => {
    if (mode !== 'rsvp' || autoStarted.current || loading || !book || error) return;
    autoStarted.current = true;
    void startRsvp();
  });

  const exitRsvp = useCallback((fraction: number, wordIndexAtExit: number) => {
    if (!book) return;
    // The reopened reader reports the word at the top of the screen, which sits before this one and would
    // overwrite it. Keep RSVP's exact stopping point so the next RSVP can resume from it.
    if (rsvpTokens) saveRsvpPos(book.id, wordIndexAtExit, rsvpTokens.words.length);
    rsvpGuard.current = { activeAt: Date.now() + SETTLE_MS, baseline: null };
    // Tell the reopened reader which word RSVP stopped on so it can scroll there and flash it.
    if (book.format === 'txt') {
      setHighlightWord(wordIndexAtExit);
    } else {
      const chapters = rsvpChaptersRef.current;
      if (chapters && rsvpTokens) {
        let c = 0;
        for (let i = 0; i < chapters.starts.length; i++) {
          if (chapters.starts[i] <= wordIndexAtExit) c = i;
          else break;
        }
        setHighlightEpub({
          href: chapters.hrefs[c],
          wordOffset: wordIndexAtExit - chapters.starts[c],
          text: rsvpTokens.words.slice(wordIndexAtExit, wordIndexAtExit + 4).join(' '),
        });
      }
    }
    // Finishing RSVP on the last word means the book is finished, not 99.99% done.
    const finished = !!rsvpTokens && wordIndexAtExit >= rsvpTokens.words.length - 1;
    const idx = Math.round((finished ? 1 : fraction) * (book.format === 'epub' ? 1000 : totalWords));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    latestWordIndex.current = idx;
    setWordIndex(idx);
    setStartWord(idx);
    savePosition(book.id, idx);
    setReaderKey(k => k + 1);
    setLaunchingRsvp(false);
    setRsvpOpen(false);
  }, [book, totalWords, savePosition, rsvpTokens]);

  // Stable callbacks for the readers (they're memoized, so new function identities would re-render them).
  // Hooks must stay above the early returns below.
  const startRsvpRef = useRef(startRsvp);
  startRsvpRef.current = startRsvp;
  const onSelectionAction = useCallback((key: string, sel: SelectionInfo) => {
    if (key === 'rsvp') void startRsvpRef.current(sel.fraction, sel);
  }, []);
  const onSelectionFallback = useCallback((sel: SelectionInfo) => {
    setRsvpFrom({ fraction: sel.fraction, anchor: sel });
  }, []);
  // Scrubber release: ask the active reader to jump to this fraction of the book.
  const [seek, setSeek] = useState<{ fraction: number; nonce: number } | null>(null);
  const handleSeek = useCallback((fraction: number) => {
    setSeek(s => ({ fraction, nonce: (s?.nonce ?? 0) + 1 }));
  }, []);
  const onSaveLocations = useCallback((data: string) => {
    const b = bookRef.current;
    if (b) AsyncStorage.setItem(`epub_locs_${b.id}`, data).catch(() => {});
  }, []);

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

  // Block iOS swipe-back while RSVP is up; it would bypass RSVP's own exit and lose the position.
  const lockSwipeBack = <Stack.Screen options={{ gestureEnabled: !(rsvpOpen || launchingRsvp) }} />;

  if (launchingRsvp && !rsvpOpen) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: theme.bg }]}>
        {lockSwipeBack}
        <ActivityIndicator color={theme.fg} />
      </SafeAreaView>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      {lockSwipeBack}
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
        <Scrubber
          value={progress}
          color={theme.fg}
          contrast={theme.bg}
          disabled={totalWords === 0}
          onSeek={handleSeek}
        />
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

      {/* Content — unmounted while RSVP is open so native selection handles can't linger over it */}
      {rsvpOpen ? null : book.format === 'txt' ? (
        <TxtReader
          key={readerKey}
          content={txtContent}
          initialWordIndex={startWord}
          prefs={prefs}
          onWordIndex={handleWordIndex}
          highlightWord={highlightWord}
          seek={seek}
          onSelectionAction={onSelectionAction}
          onSelectionFallback={onSelectionFallback}
        />
      ) : (
        <EpubReader
          key={readerKey}
          epubSrc={epubSrc}
          cachedLocations={epubCachedLocsRef.current}
          totalWords={totalWords}
          initialWordIndex={startWord}
          prefs={prefs}
          onWordIndex={handleWordIndex}
          highlight={highlightEpub}
          seek={seek}
          onSelectionAction={onSelectionAction}
          onSelectionFallback={onSelectionFallback}
          onTotalWords={handleTotalWords}
          onSaveLocations={onSaveLocations}
        />
      )}

      {/* Settings tray */}
      <ReaderTray
        visible={trayOpen}
        prefs={prefs}
        onChange={setPrefs}
        onClose={() => setTrayOpen(false)}
      />

      {rsvpFrom !== null && !rsvpOpen && !trayOpen && (
        <View style={styles.fromPillWrap} pointerEvents="box-none">
          <TouchableOpacity
            onPress={() => startRsvp(rsvpFrom.fraction, rsvpFrom.anchor)}
            activeOpacity={0.85}
            style={[styles.fromPill, { backgroundColor: theme.fg }]}
          >
            {rsvpLoading && <ActivityIndicator size="small" color={theme.bg} />}
            <Text style={[styles.fromPillText, { color: theme.bg }]}>
              {rsvpLoading
                ? 'Preparing…'
                : <><Text style={styles.fromPillBrand}>RSVP</Text> from here</>}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {rsvpOpen && rsvpTokens && (
        <RsvpReader
          bookId={book.id}
          tokens={rsvpTokens}
          startFraction={rsvpStart}
          prefs={prefs}
          onExit={exitRsvp}
        />
      )}

      <NoticeModal notice={notice} onClose={() => setNotice(null)} />
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
  fromPillWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 40,
    alignItems: 'center',
    zIndex: 15,
  },
  fromPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  fromPillBrand: {
    fontFamily: 'Inter-ExtraBold',
  },
  fromPillText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
  },
  headerTitle: {
    flex: 1,
    fontFamily: 'Fraunces-Regular',
    fontSize: 15,
    color: '#1E1E1E',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  // The scrubber is 32px tall for easy touch, but its 3px line should sit flush under the header like
  // the old bar: pull it up over the header and cancel the extra height so the page doesn't move down.
  progressRow: {
    paddingHorizontal: 0,
    marginTop: -16,
    marginBottom: -14,
    zIndex: 12, // above the reader so the scrubber's percentage bubble isn't covered
  },
});
