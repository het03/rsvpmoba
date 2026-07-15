import { Colors } from "@/constants/theme";
import { Image } from 'expo-image';
import {
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
const theme = {
    text: Colors.light.text,
    subtext: Colors.light.textSecondary,
    card: Colors.light.card
};

import type { Book } from '../types';

interface LibraryProps {
    books: Book[];
    onOpen: (book: Book) => void;
    onDelete: (id: string) => void;
}

export default function Library({
    books,
    onOpen,
    onDelete,
}: LibraryProps) {
    return (
        <View style={styles.container}>
            {books.length === 0 ? (
                <Text style={styles.empty}>No books imported yet.</Text>
            ) : (
                books.map((book) => {
                    const totalWords = book.chapters.reduce(
                        (count, chapter) =>
                            count +
                            chapter.text
                                .trim()
                                .split(/\s+/)
                                .filter(Boolean).length,
                        0
                    );

                    const progress =
                        totalWords > 0
                            ? Math.round((book.position / totalWords) * 100)
                            : 0;

                    return (
                        <View key={book.id} style={styles.bookRow}>
                            <TouchableOpacity
                                style={styles.book}
                                onPress={() => onOpen(book)}
                            >
                                <View style={styles.bookHeader}>
                                    {book.cover ? (
                                        <Image source={book.cover} style={styles.cover} />
                                    ) : null}

                                    <View style={styles.bookMeta}>
                                        <Text style={styles.bookTitle}>{book.title}</Text>
                                        {book.author ? (
                                            <Text style={styles.author}>{book.author}</Text>
                                        ) : null}

                                        {book.publisher ? (
                                            <Text style={styles.publisher}>{book.publisher}</Text>
                                        ) : null}
                                    </View>
                                </View>

                                <Text style={styles.info}>
                                    {progress}% complete
                                </Text>

                                {book.lastOpened ? (
                                    <Text style={styles.lastOpened}>Last opened: {new Date(book.lastOpened).toLocaleString()}</Text>
                                ) : null}
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.resume} onPress={() => onOpen(book)}>
                                <Text style={styles.resumeText}>Resume</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.delete}
                                onPress={() => onDelete(book.id)}
                            >
                                <Text style={styles.deleteText}>🗑</Text>
                            </TouchableOpacity>
                        </View>
                    );
                })
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: 20,
    },

    bookRow: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 10,
    },

    book: {
        flex: 1,
        backgroundColor: theme.card,
        padding: 15,
        borderRadius: 12,
    },

    bookHeader: {
        flexDirection: 'row',
        alignItems: 'center',
    },

    cover: {
        width: 48,
        height: 64,
        borderRadius: 6,
        marginRight: 12,
        backgroundColor: '#eee',
    },

    bookMeta: {
        flex: 1,
    },

    bookTitle: {
        fontSize: 18,
        fontWeight: "600",
        color: theme.text,
    },

    author: {
        marginTop: 4,
        color: theme.subtext,
        fontSize: 14,
    },

    publisher: {
        marginTop: 4,
        color: theme.subtext,
        fontSize: 12,
    },

    lastOpened: {
        marginTop: 6,
        color: theme.subtext,
        fontSize: 12,
    },

    info: {
        marginTop: 5,
        color: theme.subtext,
    },

    delete: {
        marginLeft: 10,
        width: 45,
        height: 45,
        borderRadius: 22,
        backgroundColor: "#FEE2E2",
        justifyContent: "center",
        alignItems: "center",
    },

    resume: {
        marginLeft: 10,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        backgroundColor: '#E6F0FF',
        justifyContent: 'center',
        alignItems: 'center',
    },

    resumeText: {
        color: '#0B61FF',
        fontWeight: '600',
    },

    deleteText: {
        fontSize: 20,
    },

    empty: {
        color: theme.subtext,
    },
});