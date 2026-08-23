import { Image } from 'expo-image';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { Book } from '../types';

interface LibraryProps { books: Book[]; onOpen: (book: Book) => void; onDelete: (id: string) => void; }

function wordCount(book: Book) {
    return (Array.isArray(book.chapters) ? book.chapters : []).reduce((total, chapter) => total + (chapter.text || '').trim().split(/\s+/).filter(Boolean).length, 0);
}

export default function Library({ books, onOpen, onDelete }: LibraryProps) {
    if (books.length === 0) return <View style={styles.empty}><Text style={styles.emptyTitle}>Your shelf is empty</Text><Text style={styles.emptyText}>Import a TXT or EPUB file to start reading.</Text></View>;

    return <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
        {books.map((book) => {
            const total = wordCount(book);
            const completed = book.absolutePosition ?? 0;
            const progress = total ? Math.min(100, Math.round(((completed + 1) / total) * 100)) : 0;
            return <View key={book.id} style={styles.row}>
                <TouchableOpacity style={styles.openArea} onPress={() => onOpen(book)}>
                    {book.cover ? <Image source={book.cover} style={styles.cover} /> : <View style={[styles.cover, styles.coverFallback]}><Text style={styles.coverLetter}>{book.title.charAt(0).toUpperCase()}</Text></View>}
                    <View style={styles.details}><Text numberOfLines={2} style={styles.bookTitle}>{book.title}</Text>{book.author ? <Text numberOfLines={1} style={styles.author}>{book.author}</Text> : null}<Text style={styles.progress}>{progress}% complete</Text></View>
                </TouchableOpacity>
                <View style={styles.actions}><TouchableOpacity onPress={() => onOpen(book)} style={styles.resume}><Text style={styles.resumeText}>Read</Text></TouchableOpacity><TouchableOpacity accessibilityLabel={`Delete ${book.title}`} onPress={() => onDelete(book.id)} style={styles.delete}><Text style={styles.deleteText}>×</Text></TouchableOpacity></View>
            </View>;
        })}
    </ScrollView>;
}

const styles = StyleSheet.create({
    list: { gap: 12, paddingBottom: 20 }, empty: { backgroundColor: '#FFFFFF', borderColor: '#E2E8F0', borderWidth: 1, borderRadius: 18, padding: 24, alignItems: 'center' }, emptyTitle: { color: '#111827', fontSize: 18, fontWeight: '700' }, emptyText: { color: '#64748B', marginTop: 6, fontSize: 14, textAlign: 'center' },
    row: { backgroundColor: '#FFFFFF', borderColor: '#E2E8F0', borderWidth: 1, borderRadius: 18, padding: 12, flexDirection: 'row', alignItems: 'center' }, openArea: { flex: 1, flexDirection: 'row', minWidth: 0 }, cover: { width: 48, height: 64, borderRadius: 10, marginRight: 12, backgroundColor: '#EEF2FF' }, coverFallback: { alignItems: 'center', justifyContent: 'center' }, coverLetter: { color: '#4F46E5', fontSize: 24, fontWeight: '800' }, details: { flex: 1, justifyContent: 'center' }, bookTitle: { color: '#111827', fontSize: 16, fontWeight: '700' }, author: { color: '#64748B', fontSize: 13, marginTop: 3 }, progress: { color: '#64748B', fontSize: 12, marginTop: 8 }, actions: { alignItems: 'center', marginLeft: 8, gap: 4 }, resume: { backgroundColor: '#4F46E5', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }, resumeText: { color: '#fff', fontSize: 12, fontWeight: '800' }, delete: { width: 34, height: 28, alignItems: 'center', justifyContent: 'center' }, deleteText: { color: '#64748B', fontSize: 24, lineHeight: 24 },
});
