import * as DocumentPicker from 'expo-document-picker';
import { useMemo, useState } from 'react';
import { useAppTheme } from '@/lib/appTheme';
import {
    Pressable,
    StyleSheet,
    Text,
    View
} from 'react-native';
import UploadFileIcon from '../../../assets/images/uploadIcons/Upload_File.svg';
import WrongFileIcon from '../../../assets/images/uploadIcons/Wrong_File.svg';
import FileRow from './FileRow';
import { type FileEntry, getFileType, validateFileType } from './types';

export type { FileEntry };

type DropZoneProps = {
    files: FileEntry[];
    onFilesChange: (files: FileEntry[]) => void;
};

const MAX_FILES = 5;

const formatFileSize = (bytes: number | undefined): string => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 10) / 10 + ' ' + sizes[i];
};

export default function DropZone({ files, onFilesChange }: DropZoneProps) {
    const theme = useAppTheme();
    const [isDragging, setIsDragging] = useState(false);

    const hasFiles = files.length > 0;

    const dropZoneLabel = useMemo(() => {
        const allFilesAreErrors = files.length > 0 && files.every((file) => file.state === 'error');

        if (allFilesAreErrors) {
            return 'Wrong file type';
        }

        return 'Select a TXT or EPUB file to start reading';
    }, [files]);

    const handlePickFiles = async () => {
        try {
            if (files.length >= MAX_FILES) {
                alert(`Maximum ${MAX_FILES} files allowed`);
                return;
            }

            const result = await DocumentPicker.getDocumentAsync({
                multiple: true,
                copyToCacheDirectory: false,
            });

            if (result.assets && result.assets.length > 0) {
                const remainingSlots = MAX_FILES - files.length;
                const filesToAdd = result.assets.slice(0, remainingSlots);

                const newFiles: FileEntry[] = filesToAdd.map((asset) => {
                    const isValid = validateFileType(asset.mimeType, asset.name);
                    return {
                        name: asset.name,
                        size: formatFileSize(asset.size),
                        rawSize: asset.size,
                        type: getFileType(asset.mimeType, asset.name),
                        state: isValid ? 'ready' : 'error',
                        uri: asset.uri,
                    };
                });

                onFilesChange([...files, ...newFiles]);

                if (result.assets.length > remainingSlots) {
                    alert(`Only ${remainingSlots} file(s) can be added. Maximum ${MAX_FILES} files allowed.`);
                }
            }
        } catch (error) {
            console.error('Error picking documents:', error);
        }
    };

    const handleRemoveFile = (index: number) => {
        onFilesChange(files.filter((_, i) => i !== index));
    };

    const readyCount = files.filter((file) => file.state === 'ready').length;
    const skipCount = files.filter((file) => file.state === 'error').length;

    return (
        <>
            <View
                style={[
                    styles.dropZone,
                    { backgroundColor: theme.surface, borderColor: theme.border },
                    isDragging && { borderColor: '#5F7B72' },
                    hasFiles && files.every((file) => file.state === 'error') && { borderColor: '#EF4444' },
                ]}
                onTouchStart={() => setIsDragging(true)}
                onTouchEnd={() => setIsDragging(false)}
            >
                <Pressable onPress={handlePickFiles} style={{ flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center' }}>
                    {files.length === 0 || !files.every((file) => file.state === 'error') ? (
                        <>
                            <UploadFileIcon width={24} height={24} style={styles.uploadIcon} />
                            <Text style={[styles.dropText, { color: theme.text }]}>{dropZoneLabel}</Text>
                            <Text style={[styles.dropSubText, { color: theme.textSub }]}>or drag and drop it here</Text>
                        </>
                    ) : (
                        <>
                            <WrongFileIcon width={24} height={24} style={styles.uploadIcon} />
                            <Text style={styles.errorText}>Wrong file type</Text>
                            <Text style={[styles.dropSubText, { color: theme.textSub }]}>Drop an EPUB or TXT file</Text>
                        </>
                    )}
                </Pressable>
            </View>

            {hasFiles && (
                <View style={styles.summaryContainer}>
                    {readyCount > 0 && (
                        <View style={styles.readyPill}>
                            <Text style={styles.readyPillText}>{readyCount} ready</Text>
                        </View>
                    )}
                    {skipCount > 0 && (
                        <View style={styles.skipPill}>
                            <Text style={styles.skipPillText}>{skipCount} will be skipped</Text>
                        </View>
                    )}
                </View>
            )}

            {hasFiles && (
                <View style={styles.fileList}>
                    {files.map((file, index) => (
                        <FileRow key={`${file.name}-${index}`} file={file} index={index} onRemove={handleRemoveFile} />
                    ))}
                </View>
            )}
        </>
    );
}

const styles = StyleSheet.create({
    dropZone: {
        minHeight: 150,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 20,
        paddingHorizontal: 16,
        marginBottom: 12,
    },
    dropZoneActive: {},
    dropZoneError: {},
    uploadIcon: {
        marginBottom: 10,
    },
    errorText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#EF4444',
        marginBottom: 4,
    },
    dropText: {
        fontSize: 14,
        fontFamily: 'Inter-Medium',
        textAlign: 'center',
    },
    dropSubText: {
        fontSize: 10,
        fontFamily: 'Inter-Regular',
        textAlign: 'center',
    },
    fileList: {
        gap: 8,
        marginBottom: 14,
    },
    summaryContainer: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 12,
        alignItems: 'center',
    },
    readyPill: {
        backgroundColor: '#D1FAE5',
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    readyPillText: {
        fontSize: 10,
        fontFamily: 'Inter-Medium',
        color: '#059669',
    },
    skipPill: {
        backgroundColor: '#FF000025',
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    skipPillText: {
        fontSize: 10,
        fontFamily: 'Inter-Medium',
        color: '#EF4444',
    },
});
