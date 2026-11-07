import BookPlaceholder from '@/components/addBook';
import BookCard from '@/components/BookCard';
import DeleteConfirmModal from '@/components/DeleteConfirmModal';
import GreetingHeader from '@/components/greetings';
import ImportModal from '@/components/ImportModal/ImportModal';
import { getDb, type Book } from '@/db';
import { useAppTheme } from '@/lib/appTheme';
import { webDeleteFile } from '@/lib/webFileStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AddIcon from '../../assets/images/tabIcons/Add.svg';
import SearchIcon from '../../assets/images/tabIcons/Search.svg';

// 2 columns on phones, 3 on tablets/landscape (width ≥ 600pt).
const SPACING = 16;
const NAV_CLEARANCE = 110;
// Books at or above this progress fraction are shown in Completed.
const COMPLETE_THRESHOLD = 0.9;

type BookWithProgress = Book & { progress: number };

function SectionHeader({ title, count }: { title: string; count: number }) {
  const theme = useAppTheme();
  return (
    <View style={sectionStyles.row}>
      <Text style={[sectionStyles.title, { color: theme.text }]}>{title}</Text>
      <View style={[sectionStyles.badge, { backgroundColor: theme.text + '14' }]}>
        <Text style={[sectionStyles.badgeText, { color: theme.textSub }]}>{count}</Text>
      </View>
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: SPACING,
    paddingTop: 24,
    paddingBottom: 4,
  },
  title: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  badge: {
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeText: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
  },
});

export default function Index() {
  const theme = useAppTheme();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const cols = screenWidth >= 600 ? 3 : 2;
  const cardWidth = Math.floor((screenWidth - SPACING * (cols + 1)) / cols);
  const cardHeight = Math.floor(cardWidth * 1.5);

  const [books, setBooks] = useState<BookWithProgress[]>([]);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [bookToDelete, setBookToDelete] = useState<Book | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState('');

  const loadBooks = useCallback(async () => {
    const db = await getDb();
    const rows = await db.getAllAsync<{
      id: number; title: string; author: string; cover_data: string | null;
      format: string; file_path: string; file_size: number; date_added: number;
      total_words: number; word_index: number;
    }>(
      `SELECT b.id, b.title, b.author, b.cover_data, b.format, b.file_path,
              b.file_size, b.date_added, b.total_words,
              COALESCE(rp.word_index, 0) AS word_index
       FROM books b
       LEFT JOIN reading_positions rp ON rp.book_id = b.id
       ORDER BY b.date_added DESC`
    );
    setBooks(rows.map(r => ({
      id: r.id,
      title: r.title,
      author: r.author ?? '',
      coverData: r.cover_data ?? null,
      format: r.format as Book['format'],
      filePath: r.file_path,
      fileSize: r.file_size,
      dateAdded: r.date_added,
      totalWords: r.total_words,
      progress: r.total_words > 0 ? r.word_index / r.total_words : 0,
    })));
  }, []);

  useFocusEffect(useCallback(() => { void loadBooks(); }, [loadBooks]));

  // When searching: flat list; when browsing: split into sections.
  const searchActive = query.trim().length > 0;

  const filtered = useMemo(
    () => searchActive
      ? books.filter(b => b.title.toLowerCase().includes(query.toLowerCase()) ||
                          b.author.toLowerCase().includes(query.toLowerCase()))
      : books,
    [books, query, searchActive]
  );

  const inProgress = useMemo(
    () => books.filter(b => b.progress < COMPLETE_THRESHOLD),
    [books]
  );
  const completed = useMemo(
    () => books.filter(b => b.progress >= COMPLETE_THRESHOLD),
    [books]
  );

  const handleDelete = async (book: Book) => {
    setBookToDelete(null);
    if (Platform.OS === 'web') {
      await webDeleteFile(book.filePath);
    } else {
      try {
        await FileSystem.deleteAsync(book.filePath, { idempotent: true });
      } catch {}
    }
    const db = await getDb();
    await db.runAsync('DELETE FROM books WHERE id = ?', [book.id]);
    await db.runAsync('DELETE FROM reading_positions WHERE book_id = ?', [book.id]);
    AsyncStorage.removeItem(`epub_locs_${book.id}`).catch(() => {});
    setBooks(prev => prev.filter(b => b.id !== book.id));
  };

  const renderCard = (book: BookWithProgress) => (
    <BookCard
      key={book.id}
      book={book}
      cardWidth={cardWidth}
      cardHeight={cardHeight}
      progress={book.progress}
      onPress={() => router.push(`/reader/${book.id}` as any)}
      onLongPress={() => setBookToDelete(book)}
    />
  );

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.bg }]}>
      {/* Header */}
      <View style={styles.header}>
        <GreetingHeader title="Your shelf" />
        <View style={styles.iconContainer}>
          <TouchableOpacity
            style={[styles.iconBorderContainer, { borderColor: theme.border }]}
            onPress={() => setShowSearch(prev => !prev)}
          >
            <SearchIcon width={16} height={16} color={theme.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconBorderContainer, { borderColor: theme.border }]}
            onPress={() => setIsImportOpen(true)}
          >
            <AddIcon width={16} height={16} color={theme.text} />
          </TouchableOpacity>
        </View>
      </View>

      {showSearch && (
        <View style={[styles.searchRow, { borderColor: theme.border, backgroundColor: theme.inputBg }]}>
          <SearchIcon width={14} height={14} color={theme.text} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search your shelf…"
            placeholderTextColor={theme.textSub}
            value={query}
            onChangeText={setQuery}
            autoFocus
            returnKeyType="search"
          />
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false}>
        {searchActive ? (
          /* Flat search results */
          <View style={styles.grid}>
            {filtered.map(renderCard)}
          </View>
        ) : (
          <>
            {/* In Progress */}
            <SectionHeader title="In Progress" count={inProgress.length} />
            <View style={styles.grid}>
              {inProgress.map(renderCard)}
              <BookPlaceholder
                onPress={() => setIsImportOpen(true)}
                cardWidth={cardWidth}
                cardHeight={cardHeight}
              />
            </View>

            {/* Completed */}
            {completed.length > 0 && (
              <>
                <SectionHeader title="Completed" count={completed.length} />
                <View style={styles.grid}>
                  {completed.map(renderCard)}
                </View>
              </>
            )}
          </>
        )}
        {/* Clear the floating nav bar (64 + 26 padding) */}
        <View style={{ height: NAV_CLEARANCE }} />
      </ScrollView>

      <ImportModal
        visible={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImportComplete={loadBooks}
      />
      <DeleteConfirmModal
        book={bookToDelete}
        onCancel={() => setBookToDelete(null)}
        onConfirm={handleDelete}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  iconContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  iconBorderContainer: {
    width: 32,
    height: 32,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 10,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 9,
    fontFamily: 'Inter-Regular',
    fontSize: 13,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: SPACING,
    paddingTop: SPACING,
    gap: SPACING,
  },
});
