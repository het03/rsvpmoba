import BookPlaceholder from '@/components/addBook';
import BookCard from '@/components/BookCard';
import GreetingHeader from '@/components/greetings';
import ImportModal from '@/components/ImportModal/ImportModal';
import { getDb, type Book } from '@/db';
import * as FileSystem from 'expo-file-system/legacy';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AddIcon from '../../assets/images/tabIcons/Add.svg';
import SearchIcon from '../../assets/images/tabIcons/Search.svg';

export default function Index() {
  const [books, setBooks] = useState<Book[]>([]);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState('');

  const loadBooks = useCallback(async () => {
    const db = await getDb();
    const rows = await db.getAllAsync<{
      id: number; title: string; format: string;
      file_path: string; file_size: number; date_added: number; total_words: number;
    }>(
      'SELECT id, title, format, file_path, file_size, date_added, total_words FROM books ORDER BY date_added DESC'
    );
    setBooks(rows.map(r => ({
      id: r.id,
      title: r.title,
      format: r.format as Book['format'],
      filePath: r.file_path,
      fileSize: r.file_size,
      dateAdded: r.date_added,
      totalWords: r.total_words,
    })));
  }, []);

  useEffect(() => {
    void loadBooks();
  }, [loadBooks]);

  const filtered = useMemo(
    () => query.trim()
      ? books.filter(b => b.title.toLowerCase().includes(query.toLowerCase()))
      : books,
    [books, query]
  );

  const confirmDelete = (book: Book) => {
    Alert.alert('Remove book?', book.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          if (Platform.OS !== 'web') {
            await FileSystem.deleteAsync(book.filePath, { idempotent: true });
          }
          const db = await getDb();
          await db.runAsync('DELETE FROM books WHERE id = ?', [book.id]);
          setBooks(prev => prev.filter(b => b.id !== book.id));
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <GreetingHeader title="Your shelf" />
        <View style={styles.iconContainer}>
          <TouchableOpacity
            style={styles.iconBorderContainer}
            onPress={() => setShowSearch(prev => !prev)}
          >
            <SearchIcon width={16} height={16} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBorderContainer}
            onPress={() => setIsImportOpen(true)}
          >
            <AddIcon width={16} height={16} />
          </TouchableOpacity>
        </View>
      </View>

      {showSearch && (
        <TextInput
          style={styles.searchInput}
          placeholder="Search your shelf…"
          placeholderTextColor="#AAAAAA"
          value={query}
          onChangeText={setQuery}
          autoFocus
          returnKeyType="search"
        />
      )}

      <ScrollView contentContainerStyle={styles.shelf}>
        {filtered.map(book => (
          <BookCard key={book.id} book={book} onLongPress={() => confirmDelete(book)} />
        ))}
        <BookPlaceholder onPress={() => setIsImportOpen(true)} />
      </ScrollView>

      <ImportModal
        visible={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImportComplete={loadBooks}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
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
    borderColor: '#1E1E1E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchInput: {
    marginHorizontal: 20,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: '#1E1E1E',
  },
  shelf: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    paddingTop: 24,
    gap: 12,
  },
});
