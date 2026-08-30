import * as DocumentPicker from 'expo-document-picker';
import { useMemo, useState } from 'react';
import {
    Pressable,
    StyleSheet,
    Text,
    View
} from 'react-native';
import UploadFileIcon from '../../../assets/images/uploadIcons/Upload_File.svg';
import WrongFileIcon from '../../../assets/images/uploadIcons/Wrong_File.svg';
import FileRow from './FileRow';

export type UploadState = 'idle' | 'selected' | 'error' | 'ready';

export type FileEntry = {
    name: string;
    size: string;
    type: string;
    state: UploadState;
    uri?: string;
};

type DropZoneProps = {
    files: FileEntry[];
    onFilesChange: (files: FileEntry[]) => void;
};

const VALID_FILE_TYPES = ['EPUB', 'TXT', 'PDF'];
const MAX_FILES = 5;

const formatFileSize = (bytes: number | undefined): string => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 10) / 10 + ' ' + sizes[i];
};

export const getFileType = (mimeType?: string, fileName?: string): string => {
    if (fileName) {
        const ext = fileName.split('.').pop()?.toUpperCase();
        if (ext) {
            if (VALID_FILE_TYPES.includes(ext)) return ext;
            return ext;
        }
    }
    if (mimeType?.includes('epub')) return 'EPUB';
    if (mimeType?.includes('text')) return 'TXT';
    if (mimeType?.includes('pdf')) return 'PDF';
    if (mimeType?.includes('video/mp4')) return 'MP4';
    if (mimeType?.includes('video')) return 'VIDEO';
    if (mimeType?.includes('image')) return 'IMAGE';
    if (mimeType?.includes('audio')) return 'AUDIO';

    return 'UNKNOWN';
};

const validateFileType = (mimeType?: string, fileName?: string): boolean => {
    const fileType = getFileType(mimeType, fileName);
    return VALID_FILE_TYPES.includes(fileType);
};

export default function DropZone({ files, onFilesChange }: DropZoneProps) {
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
            });

            if (result.assets && result.assets.length > 0) {
                const remainingSlots = MAX_FILES - files.length;
                const filesToAdd = result.assets.slice(0, remainingSlots);

                const newFiles: FileEntry[] = filesToAdd.map((asset) => {
                    const isValid = validateFileType(asset.mimeType, asset.name);
                    return {
                        name: asset.name,
                        size: formatFileSize(asset.size),
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
                    isDragging && styles.dropZoneActive,
                    hasFiles && files.every((file) => file.state === 'error') && styles.dropZoneError,
                ]}
                onTouchStart={() => setIsDragging(true)}
                onTouchEnd={() => setIsDragging(false)}
            >
                <Pressable onPress={handlePickFiles} style={{ flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center' }}>
                    {files.length === 0 || !files.every((file) => file.state === 'error') ? (
                        <>
                            <UploadFileIcon width={24} height={24} style={styles.uploadIcon} />
                            <Text style={styles.dropText}>{dropZoneLabel}</Text>
                            <Text style={styles.dropSubText}>or drag and drop it here</Text>
                        </>
                    ) : (
                        <>
                            <WrongFileIcon width={24} height={24} style={styles.uploadIcon} />
                            <Text style={styles.errorText}>Wrong file type</Text>
                            <Text style={styles.dropSubText}>Drop an EPUB or TXT file</Text>
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
        borderColor: '#1E1E1E',
        borderRadius: 12,
        backgroundColor: '#FFFFFF',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 20,
        paddingHorizontal: 16,
        marginBottom: 12,
    },
    dropZoneActive: {
        borderColor: '#5F7B72',
        backgroundColor: '#FFFFFF',
    },
    dropZoneError: {
        borderColor: '#EF4444',
        backgroundColor: '#FFFFFF',
    },
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
        color: '#1E1E1E',
        textAlign: 'center',
    },
    dropSubText: {
        fontSize: 10,
        fontFamily: 'Inter-Regular',
        color: '#1E1E1E',
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
