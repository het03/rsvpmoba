import ProgressBar from '@/components/Shared/ProgressBar';
import { getDb } from '@/db';
import { type ReaderPrefs, THEMES } from '@/lib/readerPrefs';
import { getOrpRange } from '@/rsvp/orp';
import { CURSIVE_RE, RTL_RE } from '@/rsvp/script';
import { getPauseMultiplier, getRampMultiplier, getWordWeight, prevSentenceStart } from '@/rsvp/pause';
import type { Tokens } from '@/rsvp/tokenize';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Easing, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props = {
  bookId: number;
  tokens: Tokens;
  startFraction: number; // 0–1 position in the book
  prefs: ReaderPrefs;
  onExit: (fraction: number, wordIndex: number) => void;
};

const WPM_KEY = 'rsvpWpm';
const MIN_WPM = 100;
const MAX_WPM = 1000;
const WPM_STEP = 25;
const SKIP = 10;
const RESUME_REWIND = 3;
const PX_PER_WPM_STEP = 24;
const LABEL_MS = 3000;
const BREAK_AFTER_MS = 12 * 60 * 1000;
const COMFORT_WPM = 500;
const DROP_WPM = 600;
const ORP_COLOR = '#C94040';
const WARN_COLOR = '#B45309';

export default function RsvpReader({ bookId, tokens, startFraction, prefs, onExit }: Props) {
  const { words, paraEnds } = tokens;
  const { width } = useWindowDimensions();
  const theme = THEMES[prefs.theme];
  const last = Math.max(0, words.length - 1);

  const [index, setIndex] = useState(() => Math.min(last, Math.round(startFraction * words.length)));
  const [playing, setPlaying] = useState(true);
  const [wpm, setWpm] = useState(300);
  const [breakDue, setBreakDue] = useState(false);

  const indexRef = useRef(index);
  indexRef.current = index;
  const rampCount = useRef(0);
  const breakMark = useRef(0);

  // Session tracking. The insert is kept as a promise so a quick exit can still finalize the row.
  const sessionP = useRef<Promise<number | null> | null>(null);
  const sessionDone = useRef(false);
  const wordsRead = useRef(0);
  const playMs = useRef(0);
  const playStart = useRef<number | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(WPM_KEY).then(v => {
      const n = Number(v);
      if (n >= MIN_WPM && n <= MAX_WPM) setWpm(n);
    }).catch(() => {});

    sessionP.current = getDb().then(db =>
      db.runAsync(
        'INSERT INTO sessions (book_id, start_time, mode) VALUES (?, ?, ?)',
        [bookId, Date.now(), 'rsvp']
      )
    ).then(r => r.lastInsertRowId).catch(() => null);
  }, [bookId]);

  useEffect(() => {
    if (playing) {
      playStart.current = Date.now();
      rampCount.current = 0;
    } else if (playStart.current !== null) {
      playMs.current += Date.now() - playStart.current;
      playStart.current = null;
    }
  }, [playing]);

  // Advance one word per tick; delay scales with WPM and punctuation.
  useEffect(() => {
    if (!playing) return;
    if (index >= last) { setPlaying(false); return; }
    const delay = (60000 / wpm)
      * getPauseMultiplier(words[index], paraEnds.has(index))
      * getWordWeight(words[index])
      * getRampMultiplier(rampCount.current);
    const t = setTimeout(() => {
      wordsRead.current += 1;
      rampCount.current += 1;
      setIndex(i => Math.min(last, i + 1));
    }, delay);
    return () => clearTimeout(t);
  }, [playing, wpm, index, last, words, paraEnds]);

  // Suggest a rest after a long stretch of RSVP; RSVP is more visually fatiguing than page reading.
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      const live = playStart.current !== null ? Date.now() - playStart.current : 0;
      if (playMs.current + live - breakMark.current >= BREAK_AFTER_MS) {
        setPlaying(false);
        setBreakDue(true);
      }
    }, 5000);
    return () => clearInterval(t);
  }, [playing]);

  const continueAfterBreak = () => {
    breakMark.current = playMs.current;
    setBreakDue(false);
    setPlaying(true);
  };

  // The "Previous sentence" label shows while paused and for a few seconds after
  // play starts or the button is used, then shrinks to just the icon.
  const [btnTick, setBtnTick] = useState(0);
  const [labelWidth, setLabelWidth] = useState(0);
  const btnAnim = useRef(new Animated.Value(1)).current; // 1 = label shown, 0 = icon only

  useEffect(() => {
    const grow = (to: 0 | 1) =>
      Animated.timing(btnAnim, {
        toValue: to,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false, // animates layout (width/padding)
      }).start();

    grow(1);
    if (!playing) return;
    const t = setTimeout(() => grow(0), LABEL_MS);
    return () => clearTimeout(t);
  }, [playing, btnTick, btnAnim]);

  // Chrome (hint, progress, WPM, buttons) fades while words flow so nothing competes with the text.
  const [wake, setWake] = useState(0);
  const fade = useRef(new Animated.Value(1)).current; // 1 = fully shown
  useEffect(() => {
    const to = (v: number, ms: number) =>
      Animated.timing(fade, { toValue: v, duration: ms, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    to(1, 200);
    if (!playing) return;
    const t = setTimeout(() => to(0, 600), LABEL_MS);
    return () => clearTimeout(t);
  }, [playing, wake, fade]);

  const backSentence = () => {
    rampCount.current = 0;
    setIndex(i => prevSentenceStart(words, paraEnds, i));
    setBtnTick(n => n + 1);
    setWake(n => n + 1);
  };

  const wpmRef = useRef(wpm);
  wpmRef.current = wpm;
  const vSteps = useRef(0);

  const adjustWpm = useCallback((delta: number) => {
    setWpm(w => Math.min(MAX_WPM, Math.max(MIN_WPM, w + delta)));
    setWake(n => n + 1);
  }, []);

  const finalizeSession = useCallback(() => {
    if (sessionDone.current) return;
    sessionDone.current = true;
    const total = playMs.current + (playStart.current !== null ? Date.now() - playStart.current : 0);
    const read = wordsRead.current;
    const avg = total > 0 ? read / (total / 60000) : 0;
    sessionP.current?.then(id => {
      if (id === null) return;
      return getDb().then(db => read > 0
        ? db.runAsync('UPDATE sessions SET end_time = ?, words_read = ?, avg_wpm = ? WHERE id = ?', [Date.now(), read, avg, id])
        : db.runAsync('DELETE FROM sessions WHERE id = ?', [id])
      );
    }).catch(() => {});
  }, []);

  // If the screen goes away without an explicit exit, still close out the session row.
  useEffect(() => finalizeSession, [finalizeSession]);

  const exit = useCallback(() => {
    finalizeSession();
    onExit(words.length > 0 ? indexRef.current / words.length : 0, indexRef.current);
  }, [onExit, words.length, finalizeSession]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { exit(); return true; });
    return () => sub.remove();
  }, [exit]);

  const tap = Gesture.Tap().onEnd(() => {
    if (breakDue || indexRef.current >= last) return;
    if (playing) {
      setPlaying(false);
    } else {
      // Back up a few words so you reconnect with context, standing in for the eye regressions RSVP removes.
      setIndex(i => Math.max(0, i - RESUME_REWIND));
      setPlaying(true);
    }
  }).runOnJS(true);

  // Vertical drag changes speed live (up = faster); horizontal swipe skips words.
  const pan = Gesture.Pan()
    .onStart(() => { vSteps.current = 0; })
    .onUpdate(e => {
      if (Math.abs(e.translationY) <= Math.abs(e.translationX)) return;
      const steps = Math.trunc(-e.translationY / PX_PER_WPM_STEP);
      if (steps !== vSteps.current) {
        adjustWpm((steps - vSteps.current) * WPM_STEP);
        vSteps.current = steps;
      }
    })
    .onEnd(e => {
      if (Math.abs(e.translationY) > Math.abs(e.translationX)) {
        AsyncStorage.setItem(WPM_KEY, String(wpmRef.current)).catch(() => {});
        return;
      }
      if (Math.abs(e.translationX) < 40) return;
      rampCount.current = 0;
      const delta = e.translationX < 0 ? -SKIP : SKIP;
      setIndex(i => Math.max(0, Math.min(last, i + delta)));
    })
    .runOnJS(true);

  const gesture = Gesture.Exclusive(pan, tap);

  const word = words[index] ?? '';
  const [orpStart, orpEnd] = getOrpRange(word);
  const rtl = RTL_RE.test(word);
  // Arabic-style scripts join letters, so the word is drawn as one centred piece instead of three.
  const cursive = CURSIVE_RE.test(word);
  const side = Math.max(orpStart, word.length - orpEnd, 1);
  // Size the word so it still fits: the longer half beside a centred focus letter, or the whole word if centred.
  const fontSize = cursive
    ? Math.max(18, Math.min(44, Math.floor((width - 48) / (Math.max(word.length, 1) * 0.6))))
    : Math.max(18, Math.min(44, Math.floor((width / 2 - 24) / (side * 0.62))));
  const wordStyle = { color: theme.fg, fontSize, fontFamily: 'Fraunces-Regular' };
  const progress = words.length > 0 ? index / words.length : 0;
  const wpmColor = wpm > DROP_WPM ? ORP_COLOR : wpm > COMFORT_WPM ? WARN_COLOR : theme.fg;
  // Above ~500 WPM comprehension starts to slip, and drops noticeably past ~600.
  const wpmNote = wpm > DROP_WPM ? 'too fast' : wpm > COMFORT_WPM ? 'fast' : '';

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <Animated.View style={{ opacity: fade.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }) }}>
          <TouchableOpacity onPress={exit} hitSlop={12} style={styles.closeBtn}>
            <Text style={[styles.closeText, { color: theme.fg }]}>✕</Text>
          </TouchableOpacity>
        </Animated.View>
        <Animated.Text style={[styles.hint, { color: theme.fg, opacity: fade }]}>
          {playing ? 'Tap to pause' : 'Tap to resume'} · ↑↓ speed · ←→ skip
        </Animated.Text>
        <View style={styles.closeBtn} />
      </View>

      <GestureDetector gesture={gesture}>
        <View style={styles.stage} collapsable={false}>
          <View style={[styles.tick, { backgroundColor: theme.fg }]} />
          {cursive ? (
            <View style={styles.cursiveRow}>
              <Text style={wordStyle} numberOfLines={1}>
                {word.slice(0, orpStart)}
                <Text style={{ color: ORP_COLOR }}>{word.slice(orpStart, orpEnd)}</Text>
                {word.slice(orpEnd)}
              </Text>
            </View>
          ) : (
            <View style={[styles.wordRow, rtl && { flexDirection: 'row-reverse' }]}>
              <View style={[styles.left, rtl && { alignItems: 'flex-start' }]}>
                <Text style={wordStyle} numberOfLines={1}>{word.slice(0, orpStart)}</Text>
              </View>
              <Text style={[wordStyle, { color: ORP_COLOR, fontFamily: 'Fraunces-Bold' }]}>{word.slice(orpStart, orpEnd)}</Text>
              <View style={[styles.right, rtl && { alignItems: 'flex-end' }]}>
                <Text style={wordStyle} numberOfLines={1}>{word.slice(orpEnd)}</Text>
              </View>
            </View>
          )}
          <View style={[styles.tick, { backgroundColor: theme.fg }]} />
        </View>
      </GestureDetector>

      <View style={styles.footer}>
        <Animated.View
          style={[styles.wpmPill, { borderColor: wpmNote ? `${wpmColor}88` : `${theme.fg}33`, opacity: fade }]}
        >
          <Text style={[styles.wpmText, { color: wpmColor }]}>
            {wpm} WPM{wpmNote ? ` · ${wpmNote}` : ''}
          </Text>
        </Animated.View>
        <Animated.View style={{ opacity: fade.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }}>
          <ProgressBar value={progress} color={theme.fg} />
        </Animated.View>
        <View style={styles.controlsRow}>
        <Animated.View
          style={{ opacity: fade.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }}
        >
        <TouchableOpacity onPress={backSentence} activeOpacity={0.7}>
          <Animated.View
            style={[
              styles.sentenceBtn,
              {
                borderColor: `${theme.fg}33`,
                paddingHorizontal: btnAnim.interpolate({ inputRange: [0, 1], outputRange: [9, 14] }),
              },
            ]}
          >
            <Text style={[styles.sentenceText, styles.sentenceIcon, { color: theme.fg }]}>↩</Text>
            <Animated.View
              style={{
                width: btnAnim.interpolate({ inputRange: [0, 1], outputRange: [0, labelWidth] }),
                opacity: btnAnim,
                overflow: 'hidden',
              }}
            >
              <Text
                numberOfLines={1}
                style={[styles.sentenceText, styles.sentenceLabel, { color: theme.fg, width: labelWidth || undefined }]}
              >
                Previous sentence
              </Text>
            </Animated.View>
          </Animated.View>
          {/* Off-screen copy used only to measure the label's natural width. */}
          <Text
            onLayout={e => setLabelWidth(Math.ceil(e.nativeEvent.layout.width))}
            style={[styles.sentenceText, styles.sentenceLabel, styles.measure]}
          >
            Previous sentence
          </Text>
        </TouchableOpacity>
        </Animated.View>
        </View>
      </View>

      {breakDue && (
        <View style={[styles.breakOverlay, { backgroundColor: `${theme.bg}F2` }]}>
          <Text style={[styles.breakTitle, { color: theme.fg }]}>Rest your eyes</Text>
          <Text style={[styles.breakSub, { color: theme.fg }]}>
            You've been in RSVP for about 12 minutes. A short break helps you keep what you read.
          </Text>
          <TouchableOpacity onPress={continueAfterBreak} style={[styles.breakBtn, { borderColor: theme.fg }]}>
            <Text style={[styles.breakBtnText, { color: theme.fg }]}>Keep going</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={exit} hitSlop={8}>
            <Text style={[styles.breakDone, { color: theme.fg }]}>Done for now</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 20 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  closeBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  closeText: { fontFamily: 'Inter-SemiBold', fontSize: 18 },
  hint: { fontFamily: 'Inter-Regular', fontSize: 12, opacity: 0.5 },
  stage: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14 },
  tick: { width: 1.5, height: 14, opacity: 0.3 },
  wordRow: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  cursiveRow: { width: '100%', alignItems: 'center' },
  left: { flex: 1, alignItems: 'flex-end' },
  right: { flex: 1, alignItems: 'flex-start' },
  footer: { paddingBottom: 14, gap: 12 },
  controlsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  wpmPill: {
    alignSelf: 'center', height: 36, borderWidth: 1, borderRadius: 20, paddingHorizontal: 14,
    justifyContent: 'center', alignItems: 'center',
  },
  wpmText: { fontFamily: 'Inter-SemiBold', fontSize: 12 },
  sentenceBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderRadius: 20, height: 36,
  },
  sentenceText: { fontFamily: 'Inter-Medium', fontSize: 12 },
  sentenceIcon: { width: 16, textAlign: 'center' },
  sentenceLabel: { paddingLeft: 6 },
  measure: { position: 'absolute', opacity: 0, left: -1000 },
  breakOverlay: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 32,
  },
  breakTitle: { fontFamily: 'Fraunces-Italic', fontSize: 26 },
  breakSub: { fontFamily: 'Inter-Regular', fontSize: 14, lineHeight: 20, textAlign: 'center', opacity: 0.7 },
  breakBtn: { marginTop: 8, borderWidth: 1, borderRadius: 24, paddingHorizontal: 28, paddingVertical: 12 },
  breakBtnText: { fontFamily: 'Inter-SemiBold', fontSize: 14 },
  breakDone: { fontFamily: 'Inter-Regular', fontSize: 13, opacity: 0.6 },
});
