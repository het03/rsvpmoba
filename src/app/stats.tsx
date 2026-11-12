import GreetingHeader from '@/components/greetings';
import WpmChart from '@/components/Stats/WpmChart';
import { getDb } from '@/db';
import { useAppTheme } from '@/lib/appTheme';
import { EMPTY_STATS, formatHour, loadStats, type Stats } from '@/lib/stats';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const SPACING = 16;
const NAV_CLEARANCE = 110;

function Card({ children, style }: { children: ReactNode; style?: object }) {
  const theme = useAppTheme();
  return <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }, style]}>{children}</View>;
}

function CardLabel({ children }: { children: string }) {
  const theme = useAppTheme();
  return <Text style={[styles.label, { color: theme.textSub }]}>{children}</Text>;
}

function Figure({ value, label, big }: { value: string; label: string; big?: boolean }) {
  const theme = useAppTheme();
  return (
    <View style={styles.figure}>
      <Text style={[big ? styles.bigNumber : styles.number, { color: theme.text }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={[styles.figureLabel, { color: theme.textSub }]}>{label}</Text>
    </View>
  );
}

export default function StatsScreen() {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);

  // Stats are a snapshot, not a stream: reload each time the tab is shown so a session you just finished is in it.
  useFocusEffect(useCallback(() => {
    let live = true;
    getDb()
      .then(db => loadStats(db))
      .then(s => { if (live) setStats(s); })
      .catch(e => console.error('loadStats failed:', e));
    return () => { live = false; };
  }, []));

  const { words, trend, streak, dna } = stats;
  const hasData = dna.sessions > 0;

  const streakCard = (
    <Card>
      <CardLabel>Reading streak</CardLabel>
      <View style={styles.row}>
        <Figure big value={String(streak.current)} label={streak.current === 1 ? 'day' : 'days'} />
        <Figure value={String(streak.longest)} label="longest" />
      </View>
    </Card>
  );

  const trendCard = (
    <Card style={landscape ? styles.half : undefined}>
      <CardLabel>Speed trend · avg WPM per session</CardLabel>
      {trend.length > 0 ? (
        <WpmChart values={trend} />
      ) : (
        <Text style={[styles.empty, { color: theme.textSub }]}>Your speed over time appears here.</Text>
      )}
    </Card>
  );

  const dnaCard = (
    <Card style={landscape ? styles.half : undefined}>
      <CardLabel>Reading DNA</CardLabel>
      <View style={styles.row}>
        <Figure value={dna.peakHour === null ? '–' : formatHour(dna.peakHour)} label="peak hour" />
        <Figure value={dna.avgWpm > 0 ? String(dna.avgWpm) : '–'} label="avg WPM" />
      </View>
      <View style={styles.row}>
        <Figure value={String(dna.booksFinished)} label={dna.booksFinished === 1 ? 'book finished' : 'books finished'} />
        <Figure value={words.total.toLocaleString()} label="words read" />
      </View>
    </Card>
  );

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.bg }]}
      // In landscape the nav rail already handles the left edge's inset.
      edges={landscape ? ['top', 'right', 'bottom'] : ['top', 'right', 'bottom', 'left']}
    >
      <View style={styles.header}>
        <GreetingHeader title="Your stats" />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <Card>
          <CardLabel>Words read</CardLabel>
          <View style={styles.row}>
            <Figure big value={words.today.toLocaleString()} label="today" />
            <Figure big value={words.week.toLocaleString()} label="this week" />
            <Figure big value={words.month.toLocaleString()} label="this month" />
          </View>
        </Card>

        {streakCard}

        <View style={landscape ? styles.landscapeRow : styles.stack}>
          {trendCard}
          {dnaCard}
        </View>

        {!hasData && (
          <Text style={[styles.empty, { color: theme.textSub }]}>
            Read in RSVP mode and your stats will build up here.
          </Text>
        )}

        {/* Portrait: clear the floating nav bar. Landscape: the nav is a side rail, so no clearance needed. */}
        <View style={{ height: landscape ? 0 : NAV_CLEARANCE - SPACING }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    paddingHorizontal: 20,
  },
  content: {
    padding: SPACING,
    gap: SPACING,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: SPACING,
    gap: 12,
  },
  half: { flex: 1 },
  stack: { gap: SPACING },
  landscapeRow: { flexDirection: 'row', gap: SPACING, alignItems: 'flex-start' },
  row: { flexDirection: 'row', gap: 12 },
  figure: { flex: 1, gap: 2 },
  label: { fontFamily: 'Inter-SemiBold', fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase' },
  number: { fontFamily: 'Fraunces-Regular', fontSize: 24 },
  bigNumber: { fontFamily: 'Fraunces-Regular', fontSize: 30 },
  figureLabel: { fontFamily: 'Inter-Medium', fontSize: 12 },
  empty: { fontFamily: 'Inter-Regular', fontSize: 13, textAlign: 'center' },
});
