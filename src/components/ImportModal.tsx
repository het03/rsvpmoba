import * as DocumentPicker from "expo-document-picker";
import { useState } from "react";
import {
    Alert,
    Modal,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { extractEPUB } from "../utils/epub";

interface Chapter {
    title: string;
    text: string;
}

interface ImportModalProps {
    visible: boolean;
    onClose: () => void;
    onLoad: (book: {
        title: string;
        author: string;
        chapters: Chapter[];
        cover?: string;
        publisher?: string;
    }) => void;
}

export default function ImportModal({
    visible,
    onClose,
    onLoad,
}: ImportModalProps) {
    const [text, setText] = useState<string>("");
    const [loading, setLoading] = useState<boolean>(false);
    const [bookTitle, setBookTitle] = useState<string>("");
    const [bookAuthor, setBookAuthor] = useState<string>("");
    const [bookCover, setBookCover] = useState<string | undefined>(undefined);
    const [bookPublisher, setBookPublisher] = useState<string | undefined>(undefined);
    const [importedChapters, setImportedChapters] = useState<Chapter[]>([]);

    async function chooseFile() {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ["text/plain", "application/epub+zip"],
                copyToCacheDirectory: true,
            });

            if (result.canceled) return;

            setLoading(true);

            const asset = result.assets[0];
            const name = asset.name.toLowerCase();

            let chapters: Chapter[] = [];

            if (name.endsWith(".epub")) {
                const response = await fetch(asset.uri);
                const buffer = await response.arrayBuffer();

                const epub = await extractEPUB(buffer);

                chapters = epub.chapters;

                setBookTitle(epub.metadata.title || "Unknown Title");
                setBookAuthor(epub.metadata.author || "Unknown Author");
                setBookPublisher(epub.metadata.publisher || undefined);
                setBookCover(epub.metadata.cover || undefined);

                setText(
                    chapters
                        .map((chapter) => `${chapter.title}\n\n${chapter.text}`)
                        .join("\n\n")
                );
            } else {
                const response = await fetch(asset.uri);
                const contents = await response.text();

                chapters = [
                    {
                        title: "Book",
                        text: contents,
                    },
                ];

                setBookTitle(asset.name.replace(/\.txt$/i, ""));
                setBookAuthor("Unknown Author");
                setText(contents);
            }

            setImportedChapters(chapters);
        } catch (error) {
            console.error(error);

            Alert.alert(
                "Import failed",
                error instanceof Error ? error.message : "Unknown error"
            );
        } finally {
            setLoading(false);
        }
    }

    function startReading() {
        if (importedChapters.length === 0) {
            Alert.alert("No book", "Choose a book first.");
            return;
        }

        onLoad({
            title: bookTitle || "Unknown Title",
            author: bookAuthor || "Unknown Author",
            chapters: importedChapters,
            cover: bookCover,
            publisher: bookPublisher,
        });

        setText("");
        setBookTitle("");
        setBookAuthor("");
        setImportedChapters([]);

        onClose();
    }

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <View style={styles.card}>
                    <Text style={styles.title}>Import Book</Text>

                    <TextInput
                        style={styles.input}
                        multiline
                        value={text}
                        editable={false}
                        placeholder="Book preview..."
                    />

                    <TouchableOpacity style={styles.fileButton} onPress={chooseFile}>
                        <Text>{loading ? "Loading..." : "📚 Choose TXT / EPUB"}</Text>
                    </TouchableOpacity>

                    <View style={styles.row}>
                        <TouchableOpacity style={styles.cancel} onPress={onClose}>
                            <Text>Cancel</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.start} onPress={startReading}>
                            <Text style={styles.startText}>Add Book</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,.45)",
        justifyContent: "center",
        padding: 20,
    },

    card: {
        backgroundColor: "#fff",
        borderRadius: 20,
        padding: 20,
    },

    title: {
        fontSize: 24,
        fontWeight: "700",
        marginBottom: 15,
    },

    input: {
        height: 200,
        borderWidth: 1,
        borderColor: "#ddd",
        borderRadius: 12,
        padding: 12,
        textAlignVertical: "top",
    },

    fileButton: {
        marginTop: 15,
        backgroundColor: "#eee",
        padding: 14,
        borderRadius: 12,
        alignItems: "center",
    },

    row: {
        flexDirection: "row",
        justifyContent: "flex-end",
        marginTop: 20,
    },

    cancel: {
        padding: 12,
        marginRight: 10,
    },

    start: {
        backgroundColor: "#4F8EF7",
        paddingHorizontal: 18,
        paddingVertical: 12,
        borderRadius: 10,
    },

    startText: {
        color: "#fff",
        fontWeight: "700",
    },
});