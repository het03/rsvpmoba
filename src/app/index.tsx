import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ImportModal from '../components/ImportModal';
import Library from '../components/Library';
import useLibrary from '../hooks/useLibrary';
import type { Chapter } from '../types';

export default function Index() {
    const { books, addBook, removeBook } = useLibrary();
    const router = useRouter();
    const [importVisible, setImportVisible] = useState(false);

    const addImportedBook = (data: { title: string; author?: string; cover?: string; publisher?: string; chapters: Chapter[] }) => {
        void addBook({ id: Date.now().toString(), title: data.title || 'Untitled book', author: data.author, cover: data.cover, publisher: data.publisher, chapters: data.chapters, currentChapter: 0, position: 0, createdAt: Date.now() });
        setImportVisible(false);
    };

    return (
        <SafeAreaView style={styles.screen}>
            <View style={styles.header}>
                <View><Text style={styles.eyebrow}>RSVP READER</Text><Text style={styles.title}>Your library</Text></View>
                <TouchableOpacity onPress={() => setImportVisible(true)} style={styles.importButton}><Text style={styles.importText}>Import</Text></TouchableOpacity>
            </View>
            <Text style={styles.description}>Read one word at a time, at your own pace.</Text>
            <Library books={books} onOpen={(book) => router.push({ pathname: '/reader', params: { id: book.id } })} onDelete={removeBook} />
            <ImportModal visible={importVisible} onClose={() => setImportVisible(false)} onLoad={addImportedBook} />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, paddingHorizontal: 20, backgroundColor: '#F8FAFC' }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 18 }, eyebrow: { color: '#4F46E5', fontSize: 11, fontWeight: '800', letterSpacing: 1.4 }, title: { color: '#111827', fontSize: 32, fontWeight: '800', marginTop: 2 }, importButton: { backgroundColor: '#4F46E5', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12 }, importText: { color: '#fff', fontWeight: '800' }, description: { color: '#64748B', fontSize: 15, marginTop: 14, marginBottom: 28 },
});
