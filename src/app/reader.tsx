import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
    Animated,
    AppState,
    AppStateStatus,
    Dimensions,
    FlatList,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SymbolView } from 'expo-symbols';
import ProgressBar from '../components/ProgressBar';
import ReaderGestures from '../components/ReaderGestures';
import WordDisplay from '../components/WordDisplay';

import { Colors } from "@/constants/theme";

import useAppTheme from '@/hooks/useAppTheme';
import useLibrary from '../hooks/useLibrary';
import useReader from '../hooks/useReader';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export default function ReaderScreen() {
    const params = useLocalSearchParams();

    const book = JSON.parse(params.book as string);

    const { updateProgress } = useLibrary();

    const loaded = useRef(false);

    const {
        word,
        words,
        index,
        chapterIndex,
        chapters,
        progress,
        playing,
        wpm,
        eta,
        loadBook,
        playPause,
        next10,
        prev10,
        increaseSpeed,
        decreaseSpeed,
        fontSize,
        theme: readerTheme,
        setFontSize,
        setTheme,
        goToChapter,
    } = useReader();

    const colors = (Colors as any)[readerTheme] ?? Colors.light;
    const { setTheme: setAppTheme } = useAppTheme();
    const prevColorsRef = useRef(colors);
    const [prevColors, setPrevColors] = useState(colors);
    const anim = useRef(new Animated.Value(0)).current;
    type ReaderThemeType = 'light' | 'dark' | 'sepia';
    const themeOrder: ReaderThemeType[] = ['light', 'dark', 'sepia'];
    const indicatorX = useRef(new Animated.Value(0)).current;
    const toggleScale = useRef<Record<ReaderThemeType, Animated.Value>>({
        light: new Animated.Value(1),
        dark: new Animated.Value(1),
        sepia: new Animated.Value(1),
    }).current;

    const animateToggle = (themeName: ReaderThemeType) => {
        Animated.sequence([
            Animated.timing(toggleScale[themeName], {
                toValue: 1.15,
                duration: 120,
                useNativeDriver: true,
            }),
            Animated.timing(toggleScale[themeName], {
                toValue: 1,
                duration: 120,
                useNativeDriver: true,
            }),
        ]).start();
    };

    useEffect(() => {
        const targetX = themeOrder.indexOf(readerTheme) * 52;
        Animated.timing(indicatorX, {
            toValue: targetX,
            duration: 220,
            useNativeDriver: true,
        }).start();
    }, [readerTheme]);

    useEffect(() => {
        loaded.current = false;

        loadBook(book);

        // apply book theme globally when opening
        if (book.theme) setAppTheme(book.theme as any);

        setTimeout(() => {
            loaded.current = true;
        }, 300);
    }, [book.id]);

    // Animate theme background/card when colors change
    useEffect(() => {
        if (prevColorsRef.current.background === colors.background && prevColorsRef.current.card === colors.card) return;

        setPrevColors(prevColorsRef.current);
        anim.setValue(0);
        Animated.timing(anim, { toValue: 1, duration: 320, useNativeDriver: false }).start(() => {
            prevColorsRef.current = colors;
            setPrevColors(colors);
            anim.setValue(0);
        });
    }, [colors.background, colors.card]);

    useEffect(() => {
        if (!loaded.current || words.length === 0) return;

        updateProgress(book.id, {
            currentChapter: chapterIndex,
            position: index,
        });
    }, [index, chapterIndex, words.length]);

    // Auto-save when pausing
    useEffect(() => {
        if (!loaded.current) return;

        if (!playing) {
            updateProgress(book.id, {
                currentChapter: chapterIndex,
                position: index,
                wpm,
                fontSize,
                theme: readerTheme,
                lastOpened: Date.now(),
            });
        }
    }, [playing]);

    // Save on unmount / leaving reader
    useEffect(() => {
        return () => {
            if (!loaded.current) return;
            updateProgress(book.id, {
                currentChapter: chapterIndex,
                position: index,
                wpm,
                fontSize,
                theme: readerTheme,
                lastOpened: Date.now(),
            });
        };
    }, [book.id, index, chapterIndex, wpm, fontSize, readerTheme]);

    // AppState listener to save when app goes to background
    useEffect(() => {
        function handleChange(state: AppStateStatus) {
            if (state !== 'active') {
                updateProgress(book.id, {
                    currentChapter: chapterIndex,
                    position: index,
                    wpm,
                    fontSize,
                    theme: readerTheme,
                    lastOpened: Date.now(),
                });
            }
        }

        const sub = AppState.addEventListener('change', handleChange);

        return () => sub.remove();
    }, [book.id, index, chapterIndex, wpm, fontSize, readerTheme]);

    // Auto-save every 30 seconds
    useEffect(() => {
        const id = setInterval(() => {
            if (!loaded.current) return;
            updateProgress(book.id, {
                currentChapter: chapterIndex,
                position: index,
                wpm,
                fontSize,
                theme: readerTheme,
                lastOpened: Date.now(),
            });
        }, 30000);

        return () => clearInterval(id);
    }, [book.id, index, chapterIndex, wpm, fontSize, readerTheme]);
    ;

    const bgOpacityNext = anim;
    const bgOpacityPrev = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

    const SCREEN_HEIGHT = Dimensions.get('window').height;
    const [tocVisible, setTocVisible] = useState(false);
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

    useEffect(() => {
        if (tocVisible) {
            // Trigger entry animations in parallel when modal opens
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: true,
                }),
                Animated.timing(slideAnim, {
                    toValue: 0, // Slides up to its original position
                    duration: 300,
                    useNativeDriver: true,
                }),
            ]).start();
        }
    }, [tocVisible]);

    const handleClose = () => {
        // Trigger exit animations in parallel, then hide the modal
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 250,
                useNativeDriver: true,
            }),
            Animated.timing(slideAnim, {
                toValue: SCREEN_HEIGHT, // Slides back down off-screen
                duration: 250,
                useNativeDriver: true,
            }),
        ]).start(() => {
            setTocVisible(false); // Turn off visibility after animation finishes
        });
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Background cross-fade layers */}
            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: prevColors.background, opacity: bgOpacityPrev }]} />
            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background, opacity: bgOpacityNext }]} />

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => router.back()}
                >
                    <SymbolView name={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }} size={20} tintColor={colors.primary} />
                </TouchableOpacity>

                <Text style={[styles.chapterTitle, { color: colors.textSecondary ?? colors.text }]}>
                    Chapter {chapterIndex + 1} / {chapters.length}
                </Text>

                <TouchableOpacity onPress={() => setTocVisible(true)} style={{ marginBottom: 8 }}>
                    <SymbolView name={{ ios: 'line.horizontal.3', android: 'menu', web: 'menu' }} size={20} tintColor={colors.primary} />
                </TouchableOpacity>

                <Modal visible={tocVisible} transparent animationType="none" onRequestClose={handleClose}>

                    <Pressable style={{ flex: 1, justifyContent: 'center' }} onPress={handleClose}>
                        <Animated.View
                            style={{
                                ...StyleSheet.absoluteFill,
                                backgroundColor: 'rgba(0,0,0,0.5)',
                                opacity: fadeAnim // Links opacity to fade animation
                            }}
                        />

                        <Animated.View
                            style={{
                                backgroundColor: '#fff',
                                margin: 20,
                                borderRadius: 12,
                                maxHeight: '80%',
                                transform: [{ translateY: slideAnim }] // Links vertical position to slide animation
                            }}
                            onTouchStart={(e) => e.stopPropagation()} // Halts press propagation on layout level
                        >
                            <FlatList
                                data={chapters}
                                keyExtractor={(_, idx) => String(idx)}
                                renderItem={(props: { item: any; index: number }) => (
                                    <TouchableOpacity
                                        onPress={() => { goToChapter(props.index); handleClose(); }}
                                        style={{ padding: 12, borderBottomWidth: 1, borderColor: '#eee' }}
                                    >
                                        <Text>{props.index + 1}. {props.item?.title}</Text>
                                    </TouchableOpacity>
                                )}
                            />
                        </Animated.View>
                    </Pressable>
                </Modal>
            </View>

            <ReaderGestures
                onNext={next10}
                onPrevious={prev10}
                onIncreaseSpeed={increaseSpeed}
                onDecreaseSpeed={decreaseSpeed}
                onTogglePlay={playPause}
            >
                <View style={styles.gestureArea}>
                    <View style={styles.readerCard}>
                        {/* Card cross-fade backgrounds */}
                        <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: styles.readerCard.borderRadius, backgroundColor: prevColors.card, opacity: bgOpacityPrev }]} />
                        <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: styles.readerCard.borderRadius, backgroundColor: colors.card, opacity: bgOpacityNext }]} />
                        <View style={[styles.pivotLine, { backgroundColor: colors.primary }]} />
                        <WordDisplay word={word} fontSize={fontSize} textColor={colors.text} subtextColor={colors.textSecondary} />
                    </View>
                </View>
            </ReaderGestures>

            <View style={styles.progressSection}>
                <ProgressBar progress={progress} />

                <View style={styles.stats}>
                    <Text style={[styles.stat, { color: colors.subtext ?? colors.textSecondary }]}>
                        {index + 1}/{words.length}
                    </Text>

                    <Text style={[styles.stat, { color: colors.subtext ?? colors.textSecondary }]}>{wpm} WPM</Text>

                    <Text style={[styles.stat, { color: colors.subtext ?? colors.textSecondary }]}>ETA: {Math.floor(eta / 60)}m {eta % 60}s</Text>
                </View>
            </View>

            <View style={styles.controlsBlock}>
                <Text style={[styles.hint, { color: colors.subtext ?? colors.textSecondary }]}>Swipe ← → seek</Text>
                <Text style={[styles.hint, { color: colors.subtext ?? colors.textSecondary }]}>Tap play/pause</Text>

                <View style={styles.fontControls}>
                    <TouchableOpacity
                        onPress={() => {
                            const next = Math.max(24, fontSize - 4);
                            setFontSize(next);
                            updateProgress(book.id, { fontSize: next, lastOpened: Date.now() });
                        }}
                        style={[styles.fontBtn, { backgroundColor: colors.card }]}
                    >
                        <Text style={{ color: colors.text ?? colors.textSecondary }}>- A</Text>
                    </TouchableOpacity>

                    <Text style={[styles.fontLabel, { color: colors.text ?? colors.textSecondary }]}>{fontSize}px</Text>

                    <TouchableOpacity
                        onPress={() => {
                            const next = Math.min(120, fontSize + 4);
                            setFontSize(next);
                            updateProgress(book.id, { fontSize: next, lastOpened: Date.now() });
                        }}
                        style={[styles.fontBtn, { backgroundColor: colors.card }]}
                    >
                        <Text style={{ color: colors.text ?? colors.textSecondary }}> A +</Text>
                    </TouchableOpacity>
                </View>

                <View style={[styles.themeControls, { backgroundColor: colors.card }]}>
                    <Animated.View
                        style={[
                            styles.themeToggleIndicator,
                            { backgroundColor: colors.primary, transform: [{ translateX: indicatorX }] },
                        ]}
                    />
                    <AnimatedTouchable
                        onPress={() => {
                            animateToggle('light');
                            setTheme('light');
                            setAppTheme('light');
                            updateProgress(book.id, { theme: 'light', lastOpened: Date.now() });
                        }}
                        style={[
                            styles.themeCircle,
                            readerTheme === 'light' && styles.themeCircleActive,
                            { backgroundColor: readerTheme === 'light' ? colors.primary : colors.card },
                            { transform: [{ scale: toggleScale.light }] },
                        ]}
                    >
                        <SymbolView
                            name={{ ios: 'sun.max', android: 'wb_sunny', web: 'light_mode' }}
                            size={18}
                            tintColor={readerTheme === 'light' ? colors.background : colors.text}
                        />
                    </AnimatedTouchable>
                    <AnimatedTouchable
                        onPress={() => {
                            animateToggle('dark');
                            setTheme('dark');
                            setAppTheme('dark');
                            updateProgress(book.id, { theme: 'dark', lastOpened: Date.now() });
                        }}
                        style={[
                            styles.themeCircle,
                            readerTheme === 'dark' && styles.themeCircleActive,
                            { backgroundColor: readerTheme === 'dark' ? colors.primary : colors.card },
                            { transform: [{ scale: toggleScale.dark }] },
                        ]}
                    >
                        <SymbolView
                            name={{ ios: 'moon', android: 'dark_mode', web: 'dark_mode' }}
                            size={18}
                            tintColor={readerTheme === 'dark' ? colors.background : colors.text}
                        />
                    </AnimatedTouchable>

                    <AnimatedTouchable
                        onPress={() => {
                            animateToggle('sepia');
                            setTheme('sepia');
                            setAppTheme('sepia');
                            updateProgress(book.id, { theme: 'sepia', lastOpened: Date.now() });
                        }}
                        style={[
                            styles.themeCircle,
                            readerTheme === 'sepia' && styles.themeCircleActive,
                            { backgroundColor: readerTheme === 'sepia' ? colors.primary : colors.card },
                            { transform: [{ scale: toggleScale.sepia }] },
                        ]}
                    >
                        <SymbolView
                            name={{ ios: 'book.closed', android: 'book', web: 'menu_book' }}
                            size={18}
                            tintColor={readerTheme === 'sepia' ? colors.background : colors.text}
                        />
                    </AnimatedTouchable>
                </View>
            </View>
        </SafeAreaView >
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
    },
    coverWrap: {
        alignItems: 'center',
        marginBottom: 12,
    },
    coverLarge: {
        width: 120,
        height: 160,
        borderRadius: 8,
    },
    backButton: {
        paddingVertical: 8,
        alignSelf: 'center',
    },
    backText: {
        fontSize: 16,
        fontWeight: '600',
    },
    chapterTitle: {
        textAlign: 'center',
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 10,
    },
    gestureArea: {
        flex: 1,
        justifyContent: 'center',
    },
    readerCard: {
        height: 200,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
    },
    pivotLine: {
        position: 'absolute',
        width: 1,
        top: 0,
        bottom: 0,
        left: '50%',
        backgroundColor: '#60A5FA',
        opacity: 0.45,
        zIndex: 2,
    },
    fontControls: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 12,
    },
    fontBtn: {
        padding: 8,
        borderRadius: 8,
    },
    fontLabel: {
        marginHorizontal: 12,
    },
    themeControls: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 12,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 28,
        overflow: 'hidden',
    },
    themeCircle: {
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'transparent',
    },
    themeToggleIndicator: {
        position: 'absolute',
        width: 42,
        height: 42,
        borderRadius: 21,
        top: 4,
        left: 4,
        opacity: 0.15,
    },
    themeCircleActive: {
        borderColor: '#FFF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 3,
    },
    themeIcon: {
        fontSize: 18,
    },
    progressSection: {
        width: '100%',
        maxWidth: 520,
        alignSelf: 'center',
        alignItems: 'center',
    },
    stats: {
        flexDirection: 'row',
        justifyContent: 'center',
        flexWrap: 'wrap',
        marginVertical: 16,
    },
    stat: {
        marginHorizontal: 12,
    },
    controlsBlock: {
        alignItems: 'center',
        marginBottom: 20,
        width: '100%',
    },
    info: {
        alignItems: 'center',
        marginBottom: 20,
    },
    speed: {
        fontSize: 22,
        fontWeight: '700',
    },
    hint: {
        fontSize: 13,
        marginTop: 4,
    },
});
