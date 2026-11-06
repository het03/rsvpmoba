import { getDb } from '@/db';
import { useAppTheme } from '@/lib/appTheme';
import { extractEpubMetadata } from '@/lib/epubMetadata';
import { webStoreFile } from '@/lib/webFileStore';
import * as FileSystem from 'expo-file-system/legacy';
import { useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import CloseIcon from '../../../assets/images/uploadIcons/close.svg';
import DropZone, { FileEntry } from './DropZone';

type ImportModalProps = {
    visible: boolean;
    onClose: () => void;
    onImportComplete?: () => void;
};

export default function ImportModal({ visible, onClose, onImportComplete }: ImportModalProps) {
    const theme = useAppTheme();
    const [files, setFiles] = useState<FileEntry[]>([]);
    const [isImporting, setIsImporting] = useState(false);

    const hasFiles = files.length > 0;
    const allFilesAreInvalid = hasFiles && files.every((file) => file.state === 'error');
    const isImportDisabled = !hasFiles || allFilesAreInvalid || isImporting;

    const closeAndClearModal = () => {
        setFiles([]);
        onClose();
    };

    const handleApplyFiles = async () => {
        if (isImportDisabled) return;

        const validFiles = files.filter((f) => f.state === 'ready' && f.uri);
        if (validFiles.length === 0) {
            closeAndClearModal();
            return;
        }

        setIsImporting(true);
        try {
            const isWeb = Platform.OS === 'web';
            const booksDir = isWeb ? '' : `${FileSystem.documentDirectory}books/`;

            if (!isWeb) {
                await FileSystem.makeDirectoryAsync(booksDir, { intermediates: true });
            }

            const db = await getDb();
            for (const file of validFiles) {
                const format = file.name.toLowerCase().endsWith('.epub') ? 'epub' : 'txt';
                let dest = file.uri!;
                let webBuf: ArrayBuffer | undefined;

                if (!isWeb) {
                    dest = booksDir + file.name;
                    await FileSystem.copyAsync({ from: file.uri!, to: dest });
                } else {
                    // Persist file bytes to IndexedDB now — the picker URI expires after this session.
                    const resp = await fetch(file.uri!);
                    webBuf = await resp.arrayBuffer();
                    await webStoreFile(file.uri!, webBuf);
                }

                // Extract metadata from EPUB; fall back to filename as title.
                let title = file.name.replace(/\.(epub|txt)$/i, '');
                let author = '';
                let coverData: string | null = null;
                if (format === 'epub') {
                    const meta = await extractEpubMetadata(dest, webBuf);
                    if (meta.title) title = meta.title;
                    author = meta.author;
                    coverData = meta.coverData;
                }

                await db.runAsync(
                    'INSERT OR IGNORE INTO books (title, author, cover_data, format, file_path, file_size, date_added, total_words) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [title, author, coverData, format, dest, file.rawSize ?? 0, Date.now(), 0]
                );
            }

            onImportComplete?.();
        } catch (e) {
            console.error('Import failed:', e);
        } finally {
            setIsImporting(false);
            closeAndClearModal();
        }
    };

    const handleReset = () => {
        setFiles([]);
    };

    const handleClose = () => {
        handleReset();
        onClose();
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
            <Pressable style={styles.backdrop} onPress={handleClose}>
                <Pressable style={[styles.modal, { backgroundColor: theme.surface }]} onPress={() => undefined}>
                    <View style={styles.modalHeader}>
                        <Text style={[styles.title, { color: theme.text }]}>Import</Text>
                        <TouchableOpacity style={[styles.close, { borderColor: theme.borderSubtle }]} onPress={handleClose} hitSlop={10}>
                            <CloseIcon width={8} height={8} color={theme.text} />
                        </TouchableOpacity>
                    </View>

                    <DropZone files={files} onFilesChange={setFiles} />

                    <View style={styles.footer}>
                        <TouchableOpacity style={[styles.cancelButton, { borderColor: theme.borderSubtle }]} onPress={handleClose}>
                            <Text style={[styles.cancelText, { color: theme.textSub }]}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.primaryButton, { backgroundColor: isImportDisabled ? theme.borderSubtle : theme.navIconActiveBg }]} onPress={handleApplyFiles} disabled={isImportDisabled}>
                            {isImporting ? (
                                <ActivityIndicator size="small" color={theme.navIconActiveColor} />
                            ) : (
                                <Text style={[styles.primaryText, { color: isImportDisabled ? theme.textSub : theme.navIconActiveColor }]}>{hasFiles ? 'Import Files' : 'Import File'}</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24,
        backgroundColor: 'rgba(0, 0, 0, 0.2)',
    },
    modal: {
        width: '100%',
        maxWidth: 420,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: 'transparent',
        paddingHorizontal: 18,
        paddingTop: 12,
        paddingBottom: 14,
        boxShadow: '0px 0px 30px rgba(30, 30, 30, 0.25)',
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    title: {
        fontFamily: 'Inter-SemiBold',
        fontSize: 14,
    },
    close: {
        width: 20,
        height: 20,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 0.5,
        borderRadius: 4,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: 10,
        marginTop: 8,
    },
    cancelButton: {
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderRadius: 6,
        paddingHorizontal: 12,
        paddingVertical: 7,
    },
    cancelText: {
        fontFamily: 'Inter-SemiBold',
        fontSize: 10,
    },
    primaryButton: {
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 6,
        paddingHorizontal: 12,
        paddingVertical: 7,
    },
    primaryText: {
        fontFamily: 'Inter-SemiBold',
        fontSize: 10,
    },
});
