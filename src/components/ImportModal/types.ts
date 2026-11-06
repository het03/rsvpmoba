export type UploadState = 'idle' | 'selected' | 'error' | 'ready';

export type FileEntry = {
    name: string;
    size: string;
    rawSize?: number;
    type: string;
    state: UploadState;
    uri?: string;
};

const VALID_FILE_TYPES = ['EPUB', 'TXT', 'PDF'];

export function getFileType(mimeType?: string, fileName?: string): string {
    if (fileName) {
        const ext = fileName.split('.').pop()?.toUpperCase();
        if (ext) return ext;
    }
    if (mimeType?.includes('epub')) return 'EPUB';
    if (mimeType?.includes('text')) return 'TXT';
    if (mimeType?.includes('pdf')) return 'PDF';
    if (mimeType?.includes('video/mp4')) return 'MP4';
    if (mimeType?.includes('video')) return 'VIDEO';
    if (mimeType?.includes('image')) return 'IMAGE';
    if (mimeType?.includes('audio')) return 'AUDIO';
    return 'UNKNOWN';
}

export function validateFileType(mimeType?: string, fileName?: string): boolean {
    return VALID_FILE_TYPES.includes(getFileType(mimeType, fileName));
}
