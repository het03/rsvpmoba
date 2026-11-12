import GreetingHeader from '@/components/greetings';
import NotificationsOffModal from '@/components/NotificationsOffModal';
import VaultModal from '@/components/Vault/VaultModal';
import WpmChart from '@/components/Stats/WpmChart';
import { getDb } from '@/db';
import { useAppTheme } from '@/lib/appTheme';
import { goalProgress, stepGoal } from '@/lib/dailyGoal';
import { loadGoal, requestGoalPermission, saveGoal } from '@/lib/goalNotifier';
import { EMPTY_STATS, formatHour, loadStats, type Stats } from '@/lib/stats';
import { countVault } from '@/lib/vault';
import * as Linking from 'expo-linking';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
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
  const [goal, setGoal] = useState(0);
  const [notifOff, setNotifOff] = useState(false);
  const [vaultCount, setVaultCount] = useState(0);
  const [vaultOpen, setVaultOpen] = useState(false);

  const refreshVaultCount = useCallback(() => {
    getDb().then(countVault).then(setVaultCount).catch(() => {});
  }, []);

  // Stats are a snapshot, not a stream: reload each time the tab is shown so a session you just finished is in it.
  useFocusEffect(useCallback(() => {
    let live = true;
    getDb()
      .then(db => loadStats(db))
      .then(s => { if (live) setStats(s); })
      .catch(e => console.error('loadStats failed:', e));
    loadGoal().then(g => { if (live) setGoal(g); });
    refreshVaultCount();
    return () => { live = false; };
  }, [refreshVaultCount]));

  const changeGoal = async (direction: 1 | -1) => {
    const next = stepGoal(goal, direction);
    if (next === goal) return;
    setGoal(next);
    await saveGoal(next);
    // Ask when a goal is first turned on, so the prompt appears in context rather than mid-session.
    if (goal === 0 && next > 0 && !(await requestGoalPermission())) setNotifOff(true);
  };

  const openSettings = () => {
    setNotifOff(false);
    Linking.openSettings().catch(() => {});
  };

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
        <WpmChart values={trend} times={stats.trendTimes} />
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

        <Card>
          <CardLabel>Daily goal</CardLabel>
          <View style={styles.goalRow}>
            <TouchableOpacity
              accessibilityLabel="Lower daily goal"
              onPress={() => changeGoal(-1)}
              disabled={goal === 0}
              style={[styles.stepper, { borderColor: theme.borderSubtle, opacity: goal === 0 ? 0.35 : 1 }]}
            >
              <Text style={[styles.stepperText, { color: theme.text }]}>−</Text>
            </TouchableOpacity>
            <Figure
              big
              value={goal === 0 ? 'Off' : goal.toLocaleString()}
              label={goal === 0 ? 'tap + to set a daily word goal' : `words a day · ${words.today.toLocaleString()} today`}
            />
            <TouchableOpacity
              accessibilityLabel="Raise daily goal"
              onPress={() => changeGoal(1)}
              style={[styles.stepper, { borderColor: theme.borderSubtle }]}
            >
              <Text style={[styles.stepperText, { color: theme.text }]}>+</Text>
            </TouchableOpacity>
          </View>
          {goal > 0 && (
            <View style={[styles.track, { backgroundColor: theme.borderSubtle }]}>
              <View style={[styles.fill, { backgroundColor: theme.text, width: `${goalProgress(words.today, goal) * 100}%` }]} />
            </View>
          )}
        </Card>

        {streakCard}

        <View style={landscape ? styles.landscapeRow : styles.stack}>
          {trendCard}
          {dnaCard}
        </View>

        <TouchableOpacity activeOpacity={0.7} onPress={() => setVaultOpen(true)}>
          <Card>
            <CardLabel>Word vault</CardLabel>
            <View style={styles.row}>
              <Figure big value={vaultCount.toLocaleString()} label={vaultCount === 1 ? 'word saved' : 'words saved'} />
            </View>
            <Text style={[styles.vaultHint, { color: theme.textSub }]}>
              {vaultCount === 0 ? 'Select a word while reading and choose Define.' : 'Tap to browse your words'}
            </Text>
          </Card>
        </TouchableOpacity>

        {!hasData && (
          <Text style={[styles.empty, { color: theme.textSub }]}>
            Finish a reading session and your stats will build up here.
          </Text>
        )}

        {/* Portrait: clear the floating nav bar. Landscape: the nav is a side rail, so no clearance needed. */}
        <View style={{ height: landscape ? 0 : NAV_CLEARANCE - SPACING }} />
      </ScrollView>

      <NotificationsOffModal visible={notifOff} onClose={() => setNotifOff(false)} onOpenSettings={openSettings} />
      <VaultModal visible={vaultOpen} onClose={() => setVaultOpen(false)} onChanged={refreshVaultCount} />
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
  vaultHint: { fontFamily: 'Inter-Regular', fontSize: 12 },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepper: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepperText: { fontFamily: 'Inter-Medium', fontSize: 22, lineHeight: 26 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
});
