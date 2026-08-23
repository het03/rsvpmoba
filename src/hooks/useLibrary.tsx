import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Book, Chapter } from '../types';
import { loadLibrary, saveLibrary } from '../utils/storage';

interface Progress {
    currentChapter?: number;
    absolutePosition?: number;
    position?: number;
    wpm?: number;
    fontSize?: number;
    lastOpened?: number;
}

interface LibraryContextValue {
    books: Book[];
    hydrated: boolean;
    addBook: (book: Book) => Promise<void>;
    updateProgress: (id: string, progress: Progress) => Promise<void>;
    removeBook: (id: string) => Promise<void>;
}

const LibraryContext = createContext<LibraryContextValue | null>(null);

function normalizeBook(value: any): Book {
    const chapters: Chapter[] = Array.isArray(value?.chapters)
        ? value.chapters
            .filter((chapter: unknown): chapter is Record<string, unknown> => Boolean(chapter) && typeof chapter === 'object')
            .map((chapter: Record<string, unknown>, index: number) => ({
                title: typeof chapter.title === 'string' ? chapter.title : `Chapter ${index + 1}`,
                text: typeof chapter.text === 'string' ? chapter.text : '',
            }))
        : [];

    return {
        id: typeof value?.id === 'string' ? value.id : String(value?.id ?? Date.now()),
        title: typeof value?.title === 'string' && value.title.trim() ? value.title : 'Unknown Title',
        author: value?.author && typeof value.author === 'object'
            ? value.author['#text'] ?? value.author['#value'] ?? String(value.author)
            : value?.author,
        cover: typeof value?.cover === 'string' ? value.cover : undefined,
        publisher: typeof value?.publisher === 'string' ? value.publisher : undefined,
        chapters,
        currentChapter: Number.isInteger(value?.currentChapter) && value.currentChapter >= 0
            ? Math.min(value.currentChapter, Math.max(0, chapters.length - 1))
            : 0,
        absolutePosition: typeof value?.absolutePosition === 'number' && value.absolutePosition >= 0 ? value.absolutePosition : undefined,
        position: typeof value?.position === 'number' && value.position >= 0 ? value.position : 0,
        wpm: typeof value?.wpm === 'number' && value.wpm > 0 ? value.wpm : undefined,
        fontSize: typeof value?.fontSize === 'number' && value.fontSize > 0 ? value.fontSize : undefined,
        lastOpened: typeof value?.lastOpened === 'number' ? value.lastOpened : undefined,
        createdAt: typeof value?.createdAt === 'number' ? value.createdAt : Date.now(),
    };
}

export function LibraryProvider({ children }: { children: ReactNode }) {
    const [books, setBooks] = useState<Book[]>([]);
    const [hydrated, setHydrated] = useState(false);
    const booksRef = useRef<Book[]>([]);
    const readyRef = useRef<Promise<void> | null>(null);
    const writeRef = useRef(Promise.resolve());

    useEffect(() => {
        const load = async () => {
            try {
                const saved = await loadLibrary();
                const normalized = (saved ?? []).map(normalizeBook);
                booksRef.current = normalized;
                setBooks(normalized);
            } finally {
                setHydrated(true);
            }
        };
        readyRef.current = load();
        return () => { readyRef.current = null; };
    }, []);

    async function enqueueMutation(mutator: (current: Book[]) => Book[]) {
        if (readyRef.current) await readyRef.current;
        const operation = writeRef.current.then(async () => {
            const updated = mutator(booksRef.current);
            booksRef.current = updated;
            setBooks(updated);
            await saveLibrary(updated);
        });
        writeRef.current = operation.catch(() => undefined);
        await operation;
    }

    const addBook = (book: Book) => enqueueMutation((current) => [...current, book]);

    const updateProgress = (id: string, progress: Progress) => enqueueMutation((current) => current.map((book) =>
        book.id === id
            ? {
                ...book,
                    currentChapter: progress.currentChapter ?? book.currentChapter,
                    absolutePosition: progress.absolutePosition ?? book.absolutePosition,
                position: progress.position ?? book.position,
                wpm: progress.wpm ?? book.wpm,
                fontSize: progress.fontSize ?? book.fontSize,
                lastOpened: progress.lastOpened ?? book.lastOpened,
            }
            : book
    ));

    const removeBook = (id: string) => enqueueMutation((current) => current.filter((book) => book.id !== id));

    return <LibraryContext.Provider value={{ books, hydrated, addBook, updateProgress, removeBook }}>{children}</LibraryContext.Provider>;
}

export default function useLibrary() {
    const context = useContext(LibraryContext);
    if (!context) throw new Error('useLibrary must be used inside LibraryProvider');
    return context;
}
