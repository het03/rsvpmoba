import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, AppStateStatus, FlatList, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ProgressBar from '../components/ProgressBar';
import ReaderGestures from '../components/ReaderGestures';
import WordDisplay from '../components/WordDisplay';
import useLibrary from '../hooks/useLibrary';
import useReader from '../hooks/useReader';

const colors = { text: '#111827', background: '#F8FAFC', backgroundElement: '#EEF2FF', textSecondary: '#64748B', card: '#FFFFFF', primary: '#4F46E5', border: '#E2E8F0' };

export default function ReaderScreen() {
    const { id } = useLocalSearchParams<{ id?: string }>();
    const { books, hydrated, updateProgress } = useLibrary();
    const foundBook = books.find((candidate) => candidate.id === id);
    const book = useMemo(() => foundBook ?? { id: '', title: '', chapters: [], currentChapter: 0, position: 0, createdAt: 0 }, [foundBook]);
    const loaded = useRef(false);
    const [chaptersVisible, setChaptersVisible] = useState(false);
    const { word, words, index, chapterIndex, chapters, bookProgress, absolutePosition, playing, wpm, eta, loadBook, playPause, next10, prev10, increaseSpeed, decreaseSpeed, fontSize, setFontSize, goToChapter } = useReader();
    const latestProgress = useRef({ bookId: '', currentChapter: 0, absolutePosition: 0, position: 0, wpm: 300, fontSize: 52 });

    useEffect(() => {
        loaded.current = false;
        loadBook(book);
        const timeout = setTimeout(() => { loaded.current = true; }, 250);
        return () => clearTimeout(timeout);
    }, [book, loadBook]);
    useEffect(() => { latestProgress.current = { bookId: book.id, currentChapter: chapterIndex, absolutePosition, position: index, wpm, fontSize }; }, [absolutePosition, book.id, chapterIndex, fontSize, index, wpm]);

    const saveProgress = useCallback(async () => {
        const current = latestProgress.current;
        if (!loaded.current || !current.bookId) return;
        await updateProgress(current.bookId, { ...current, lastOpened: Date.now() });
    }, [updateProgress]);
    useEffect(() => { if (loaded.current && words.length > 0) void saveProgress(); }, [absolutePosition, chapterIndex, saveProgress, words.length]);
    useEffect(() => { if (loaded.current && !playing) void saveProgress(); }, [playing, saveProgress]);
    useEffect(() => {
        const subscription = AppState.addEventListener('change', (state: AppStateStatus) => { if (state !== 'active') void saveProgress(); });
        const interval = setInterval(() => void saveProgress(), 30000);
        return () => { subscription.remove(); clearInterval(interval); void saveProgress(); };
    }, [saveProgress]);

    if (!hydrated || !foundBook) return <SafeAreaView style={styles.status}><Text style={styles.statusText}>{hydrated ? 'This book is no longer available.' : 'Loading library…'}</Text></SafeAreaView>;
    const changeFontSize = (amount: number) => setFontSize(Math.max(24, Math.min(120, fontSize + amount)));

    return (
        <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
            <View style={styles.header}>
                <TouchableOpacity accessibilityLabel="Back to library" onPress={() => router.back()} style={styles.headerButton}><Text style={[styles.headerIcon, { color: colors.text }]}>‹</Text></TouchableOpacity>
                <View style={styles.headerTitle}><Text numberOfLines={1} style={[styles.bookTitle, { color: colors.text }]}>{book.title}</Text><Text style={[styles.chapterLabel, { color: colors.textSecondary }]}>Chapter {chapterIndex + 1} of {chapters.length}</Text></View>
                <TouchableOpacity accessibilityLabel="Choose chapter" onPress={() => setChaptersVisible(true)} style={styles.headerButton}><Text style={[styles.menuIcon, { color: colors.text }]}>☰</Text></TouchableOpacity>
            </View>
            <ReaderGestures onNext={next10} onPrevious={prev10} onIncreaseSpeed={increaseSpeed} onDecreaseSpeed={decreaseSpeed} onTogglePlay={playPause}>
                <View style={styles.readerArea}><View style={[styles.wordPanel, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.focusLine, { backgroundColor: colors.primary }]} /><WordDisplay word={word} fontSize={fontSize} textColor={colors.text} /></View><Text style={[styles.gestureHint, { color: colors.textSecondary }]}>Tap to {playing ? 'pause' : 'play'} · swipe sideways to seek</Text></View>
            </ReaderGestures>
            <View style={styles.bottom}>
                <ProgressBar progress={bookProgress} />
                <View style={styles.metrics}><Text style={[styles.metric, { color: colors.textSecondary }]}>{index + 1} / {words.length} words</Text><Text style={[styles.metric, { color: colors.textSecondary }]}>{wpm} WPM</Text><Text style={[styles.metric, { color: colors.textSecondary }]}>{eta > 60 ? `${Math.ceil(eta / 60)} min left` : `${eta}s left`}</Text></View>
                <View style={styles.playbackControls}><TouchableOpacity onPress={prev10} style={[styles.roundButton, { backgroundColor: colors.card }]}><Text style={[styles.controlText, { color: colors.text }]}>−10</Text></TouchableOpacity><TouchableOpacity onPress={playPause} style={[styles.playButton, { backgroundColor: colors.primary }]}><Text style={styles.playText}>{playing ? 'Ⅱ' : '▶'}</Text></TouchableOpacity><TouchableOpacity onPress={next10} style={[styles.roundButton, { backgroundColor: colors.card }]}><Text style={[styles.controlText, { color: colors.text }]}>+10</Text></TouchableOpacity></View>
                <View style={styles.settings}><TouchableOpacity onPress={() => changeFontSize(-4)} style={[styles.settingButton, { borderColor: colors.border }]}><Text style={{ color: colors.text }}>A−</Text></TouchableOpacity><Text style={[styles.fontSize, { color: colors.textSecondary }]}>{fontSize}px</Text><TouchableOpacity onPress={() => changeFontSize(4)} style={[styles.settingButton, { borderColor: colors.border }]}><Text style={{ color: colors.text }}>A+</Text></TouchableOpacity></View>
            </View>
            <Modal visible={chaptersVisible} transparent animationType="slide" onRequestClose={() => setChaptersVisible(false)}><Pressable style={styles.modalOverlay} onPress={() => setChaptersVisible(false)}><Pressable style={[styles.chapterSheet, { backgroundColor: colors.background }]} onPress={(event) => event.stopPropagation()}><Text style={[styles.sheetTitle, { color: colors.text }]}>Chapters</Text><FlatList data={chapters} keyExtractor={(_, itemIndex) => String(itemIndex)} renderItem={({ item, index: itemIndex }) => <TouchableOpacity onPress={() => { goToChapter(itemIndex); setChaptersVisible(false); }} style={[styles.chapterRow, itemIndex === chapterIndex && { backgroundColor: colors.backgroundElement }]}><Text numberOfLines={1} style={[styles.chapterRowText, { color: colors.text }]}>{itemIndex + 1}. {item.title}</Text></TouchableOpacity>} /></Pressable></Pressable></Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, paddingHorizontal: 20 }, status: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FAFAF9' }, statusText: { color: '#111827' },
    header: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 }, headerButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }, headerIcon: { fontSize: 38, lineHeight: 40 }, menuIcon: { fontSize: 22 }, headerTitle: { flex: 1, alignItems: 'center', paddingHorizontal: 8 }, bookTitle: { fontSize: 16, fontWeight: '700' }, chapterLabel: { fontSize: 12, marginTop: 2 },
    readerArea: { flex: 1, justifyContent: 'center' }, wordPanel: { height: 210, borderRadius: 24, borderWidth: 1, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }, focusLine: { position: 'absolute', height: '100%', width: 1, left: '50%', opacity: .4 }, gestureHint: { textAlign: 'center', marginTop: 16, fontSize: 12 },
    bottom: { paddingBottom: 16 }, metrics: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }, metric: { fontSize: 12 }, playbackControls: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 26, marginVertical: 20 }, roundButton: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' }, controlText: { fontWeight: '700' }, playButton: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' }, playText: { color: '#fff', fontSize: 26 },
    settings: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 }, settingButton: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 }, fontSize: { width: 42, fontSize: 12, textAlign: 'center' },
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.35)' }, chapterSheet: { maxHeight: '70%', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 }, sheetTitle: { fontSize: 20, fontWeight: '700', marginBottom: 10 }, chapterRow: { paddingVertical: 14, paddingHorizontal: 10, borderRadius: 10 }, chapterRowText: { fontSize: 15 },
});
