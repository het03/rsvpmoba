import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Book } from '../types';
import { loadLibrary, saveLibrary } from '../utils/storage';

interface Progress {
    currentChapter?: number;
    position?: number;
    wpm?: number;
    fontSize?: number;
    theme?: 'light' | 'dark' | 'sepia';
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
    return {
        ...value,
        author: value?.author && typeof value.author === 'object'
            ? value.author['#text'] ?? value.author['#value'] ?? String(value.author)
            : value?.author,
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
                position: progress.position ?? book.position,
                wpm: progress.wpm ?? book.wpm,
                fontSize: progress.fontSize ?? book.fontSize,
                theme: progress.theme ?? book.theme,
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
