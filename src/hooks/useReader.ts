import { useEffect, useRef, useState } from 'react';
import type { Book, Chapter } from '../types';
import { getPauseMultiplier } from '../utils/orp';
import { parseText } from '../utils/parser';

export default function useReader() {
    const [words, setWords] = useState<string[]>([]);
    const [index, setIndex] = useState(0);
    const [chapters, setChapters] = useState<Chapter[]>([]);
    const [chapterIndex, setChapterIndex] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [wpm, setWpm] = useState(300);
    const [fontSize, setFontSize] = useState<number>(52);
    const [theme, setTheme] = useState<'light' | 'dark' | 'sepia'>('light');

    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    function clearTimer() {
        if (timer.current) {
            clearTimeout(timer.current);
            timer.current = null;
        }
    }

    useEffect(() => {
        clearTimer();

        if (!playing) return;

        if (words.length === 0 || index >= words.length) {
            setPlaying(false);
            return;
        }

        const currentWord = words[index];
        const delay = (60000 / wpm) * getPauseMultiplier(currentWord);

        timer.current = setTimeout(() => {
            setIndex((current) => {
                if (current >= words.length - 1) {
                    if (chapterIndex < chapters.length - 1) {
                        const nextChapter = chapterIndex + 1;
                        const nextWords = parseText(chapters[nextChapter].text);

                        setChapterIndex(nextChapter);
                        setWords(nextWords);

                        return 0;
                    }

                    setPlaying(false);
                    return current;
                }

                return current + 1;
            });
        }, delay);

        return clearTimer;
    }, [playing, index, wpm, words, chapterIndex, chapters]);

    function loadBook(book: Book) {
        const bookChapters = book.chapters || [];
        const savedChapter = book.currentChapter || 0;

        const chapterWords = parseText(
            bookChapters[savedChapter]?.text || ''
        );

        setChapters(bookChapters);
        setChapterIndex(savedChapter);
        setWords(chapterWords);
        setIndex(book.position || 0);
        setPlaying(false);
        // Load persisted settings if present
        if (book.wpm) setWpm(book.wpm);
        if (book.fontSize) setFontSize(book.fontSize);
        if (book.theme) setTheme(book.theme);
    }

    function playPause() {
        if (words.length === 0) return;
        setPlaying((value) => !value);
    }

    function next10() {
        setIndex((value) => Math.min(words.length - 1, value + 10));
    }

    function prev10() {
        setIndex((value) => Math.max(0, value - 10));
    }

    function increaseSpeed() {
        setWpm((value) => Math.min(1200, value + 25));
    }

    function decreaseSpeed() {
        setWpm((value) => Math.max(100, value - 25));
    }

    function goToChapter(number: number) {
        if (!chapters[number]) return;

        const newWords = parseText(chapters[number].text);

        setChapterIndex(number);
        setWords(newWords);
        setIndex(0);
    }

    const progress =
        words.length === 0 ? 0 : (index + 1) / words.length;

    function calculateETA() {
        if (words.length === 0 || index >= words.length) return 0;

        return words.slice(index).reduce((seconds, currentWord) => {
            const delay = (60000 / wpm) * getPauseMultiplier(currentWord);
            return seconds + delay / 1000;
        }, 0);
    }

    const eta = Math.max(0, Math.round(calculateETA()));

    return {
        words,
        word: words[index] || '',
        index,
        chapters,
        chapterIndex,
        progress,
        playing,
        wpm,
        eta,
        fontSize,
        theme,
        loadBook,
        goToChapter,
        playPause,
        next10,
        prev10,
        increaseSpeed,
        decreaseSpeed,
        setFontSize,
        setTheme,
    };
}