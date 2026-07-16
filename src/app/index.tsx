import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import ImportModal from '../components/ImportModal';
import Library from '../components/Library';
import useLibrary from '../hooks/useLibrary';
import type { Chapter } from '../types';
import { useTheme } from '@/hooks/use-theme';

export default function Index() {
  const { books, addBook, removeBook } = useLibrary();
  const router = useRouter();
  const theme = useTheme();

  const [modalVisible, setModalVisible] = useState(false);

  function handleLoad({
    title,
    author,
    cover,
    publisher,
    chapters,
  }: {
    title: string;
    author?: string;
    cover?: string;
    publisher?: string;
    chapters: Chapter[];
  }) {
    const book = {
      id: Date.now().toString(),
      title: title || 'Unknown Title',
      author: author || undefined,
      cover: cover || undefined,
      publisher: publisher || undefined,
      chapters,
      currentChapter: 0,
      position: 0,
      createdAt: Date.now(),
    };

    addBook(book);
    setModalVisible(false);
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>My Library</Text>

        <TouchableOpacity
          style={[styles.importBtn, { backgroundColor: theme.primary }]}
          onPress={() => setModalVisible(true)}
        >
          <Text style={styles.importText}>Import</Text>
        </TouchableOpacity>
      </View>

      <Library
        books={books}
        onOpen={(book) => {
          router.push({
            pathname: '/reader',
            params: {
              id: book.id,
            },
          });
        }}
        onDelete={removeBook}
      />

      <ImportModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onLoad={handleLoad}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    marginTop: 40,
    backgroundColor: '#FAFAF9',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  importBtn: {
    backgroundColor: '#4F8EF7',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  importText: {
    color: '#fff',
    fontWeight: '600',
  },
});
