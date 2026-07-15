import { useEffect, useState } from 'react';
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

export default function useLibrary() {
    const [books, setBooks] = useState<Book[]>([]);

    useEffect(() => {
        loadBooks();
    }, []);

    async function loadBooks() {
        const saved = await loadLibrary();
        const normalized = (saved ?? []).map((b: any) => ({
            ...b,
            author:
                b?.author && typeof b.author === 'object'
                    ? b.author['#text'] ?? b.author['#value'] ?? String(b.author)
                    : b?.author,
        }));

        setBooks(normalized ?? []);
    }

    async function addBook(book: Book) {
        const updated = [...books, book];
        setBooks(updated);
        await saveLibrary(updated);
    }

    async function updateProgress(id: string, progress: Progress) {
        const updated = books.map((book) =>
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
        );

        setBooks(updated);
        await saveLibrary(updated);
    }

    async function removeBook(id: string) {
        const updated = books.filter((book) => book.id !== id);
        setBooks(updated);
        await saveLibrary(updated);
    }

    return {
        books,
        addBook,
        updateProgress,
        removeBook,
    };
}