export interface Chapter {
    title: string;
    text: string;
}

export interface Book {
    id: string;
    title: string;
    author?: string;
    chapters: Chapter[];
    currentChapter: number;
    /** Word offset within the complete book. Older records may not have this. */
    absolutePosition?: number;
    position: number;
    createdAt: number;
    // Persistent reading state
    wpm?: number;
    fontSize?: number;
    theme?: 'light' | 'dark' | 'sepia';
    lastOpened?: number;
    cover?: string;
    publisher?: string;
}
