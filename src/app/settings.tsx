import ConfirmModal from '@/components/ConfirmModal';
import GreetingHeader from '@/components/greetings';
import LicensesModal from '@/components/LicensesModal';
import NotificationsOffModal from '@/components/NotificationsOffModal';
import { getDb } from '@/db';
import { ACCENT_RED, useAppTheme, useThemeMode } from '@/lib/appTheme';
import { stepGoal } from '@/lib/dailyGoal';
import { clearCache, countCache } from '@/lib/dictionary';
import {
  loadGoal, loadGoalAlert, notificationStatus, requestGoalPermission, saveGoal, saveGoalAlert, type NotificationStatus,
} from '@/lib/goalNotifier';
import { DEFAULT_PREFS, loadPrefs, READER_FONTS, savePrefs, type ReaderPrefs } from '@/lib/readerPrefs';
import { THEME_MODES } from '@/lib/themeMode';
import { loadWpm, MAX_WPM, MIN_WPM, saveWpm, stepWpm } from '@/lib/wpm';
import { setThemeMode } from '@/lib/themeStore';
import { clearVault, countVault } from '@/lib/vault';
import Constants from 'expo-constants';
import AddIcon from '../../assets/images/tabIcons/Add.svg';
import * as Linking from 'expo-linking';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const SPACING = 16;
const NAV_CLEARANCE = 110;

const open = (url: string) => Linking.openURL(url).catch(() => {});

function Card({ label, children }: { label: string; children: ReactNode }) {
  const theme = useAppTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }]}>
      <Text style={[styles.label, { color: theme.textSub }]}>{label}</Text>
      {children}
    </View>
  );
}

function Rule() {
  const theme = useAppTheme();
  return <View style={[styles.rule, { backgroundColor: theme.borderSubtle }]} />;
}

function ActionRow({ title, hint, action, onPress, disabled }: { title: string; hint: string; action: string; onPress: () => void; disabled?: boolean }) {
  const theme = useAppTheme();
  return (
    <View style={styles.actionRow}>
      <View style={styles.actionText}>
        <Text style={[styles.rowTitle, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.rowHint, { color: theme.textSub }]}>{hint}</Text>
      </View>
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        style={[styles.actionButton, { borderColor: theme.borderSubtle, opacity: disabled ? 0.35 : 1 }]}
      >
        <Text style={[styles.actionButtonText, { color: theme.text }]}>{action}</Text>
      </TouchableOpacity>
    </View>
  );
}

function Stepper({ title, hint, value, label, onStep, canDown, canUp }: {
  title: string; hint: string; value: string; label: string; onStep: (direction: 1 | -1) => void; canDown: boolean; canUp: boolean;
}) {
  const theme = useAppTheme();
  const button = (direction: 1 | -1, glyph: string, enabled: boolean) => (
    <TouchableOpacity
      accessibilityLabel={`${direction === 1 ? 'Raise' : 'Lower'} ${label}`}
      onPress={() => onStep(direction)}
      disabled={!enabled}
      style={[styles.stepper, { borderColor: theme.borderSubtle, opacity: enabled ? 1 : 0.35 }]}
    >
      {direction === 1
        ? <AddIcon width={16} height={16} color={ACCENT_RED} />
        : <Text style={[styles.stepperText, { color: theme.text }]}>{glyph}</Text>}
    </TouchableOpacity>
  );
  return (
    <View style={styles.actionRow}>
      <View style={styles.actionText}>
        <Text style={[styles.rowTitle, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.rowHint, { color: theme.textSub }]}>{hint}</Text>
      </View>
      {button(-1, '−', canDown)}
      <Text style={[styles.stepValue, { color: theme.text }]} numberOfLines={1}>{value}</Text>
      {button(1, '+', canUp)}
    </View>
  );
}

function SwitchRow({ title, hint, value, onChange, disabled }: { title: string; hint: string; value: boolean; onChange: (on: boolean) => void; disabled?: boolean }) {
  const theme = useAppTheme();
  return (
    <View style={[styles.actionRow, { opacity: disabled ? 0.5 : 1 }]}>
      <View style={styles.actionText}>
        <Text style={[styles.rowTitle, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.rowHint, { color: theme.textSub }]}>{hint}</Text>
      </View>
      <Switch
        accessibilityLabel={title}
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ false: theme.borderSubtle, true: ACCENT_RED }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

const STATUS_TEXT: Record<NotificationStatus, string> = {
  granted: 'Allowed',
  undetermined: 'Not asked yet',
  blocked: 'Blocked in your phone’s settings',
  unsupported: 'Not available on this device',
};

export default function SettingsScreen() {
  const theme = useAppTheme();
  const mode = useThemeMode();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;

  const [licencesOpen, setLicencesOpen] = useState(false);
  const [cached, setCached] = useState(0);
  const [saved, setSaved] = useState(0);
  const [confirm, setConfirm] = useState<'cache' | 'vault' | null>(null);

  const [prefs, setPrefs] = useState<ReaderPrefs>(DEFAULT_PREFS);
  const [wpm, setWpm] = useState(0);
  const [goal, setGoal] = useState(0);
  const [alertOn, setAlertOn] = useState(true);
  const [status, setStatus] = useState<NotificationStatus>('undetermined');
  const [notifOff, setNotifOff] = useState(false);

  const refresh = useCallback(() => {
    getDb()
      .then(async db => {
        setCached(await countCache(db));
        setSaved(await countVault(db));
      })
      .catch(() => {});
    loadPrefs().then(setPrefs);
    loadWpm().then(setWpm);
    loadGoal().then(setGoal);
    loadGoalAlert().then(setAlertOn);
    notificationStatus().then(setStatus);
  }, []);

  // Everything here is a snapshot: reload whenever the tab is shown, so a goal set on Stats, words saved while reading,
  // or a permission changed in the phone's settings are all current.
  useFocusEffect(refresh);

  const changePrefs = (change: Partial<ReaderPrefs>) => {
    const next = { ...prefs, ...change };
    setPrefs(next);
    savePrefs(next);
  };

  const changeWpm = (direction: 1 | -1) => {
    const next = stepWpm(wpm, direction);
    setWpm(next);
    saveWpm(next);
  };

  // Turning a goal on is when notifications matter, so ask for permission then, as the Stats screen does.
  const changeGoal = async (direction: 1 | -1) => {
    const next = stepGoal(goal, direction);
    if (next === goal) return;
    setGoal(next);
    await saveGoal(next);
    if (goal === 0 && next > 0 && alertOn && !(await requestGoalPermission())) setNotifOff(true);
    setStatus(await notificationStatus());
  };

  const changeAlert = async (on: boolean) => {
    if (on && !(await requestGoalPermission())) {
      // Without permission the switch would promise alerts that can't arrive, so it stays off.
      setNotifOff(true);
      setStatus(await notificationStatus());
      return;
    }
    setAlertOn(on);
    await saveGoalAlert(on);
    setStatus(await notificationStatus());
  };

  const allowNotifications = async () => {
    if (!(await requestGoalPermission())) setNotifOff(true);
    setStatus(await notificationStatus());
  };

  const openSystemSettings = () => {
    setNotifOff(false);
    Linking.openSettings().catch(() => {});
  };

  const confirmed = async () => {
    const which = confirm;
    setConfirm(null);
    const db = await getDb();
    if (which === 'cache') await clearCache(db);
    if (which === 'vault') await clearVault(db);
    refresh();
  };

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.bg }]}
      // In landscape the nav rail already handles the left edge's inset.
      edges={landscape ? ['top', 'right', 'bottom'] : ['top', 'right', 'bottom', 'left']}
    >
      <View style={styles.header}>
        <GreetingHeader title="Settings" greeting={false} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <Card label="Appearance">
          <View style={[styles.segments, { borderColor: theme.borderSubtle }]}>
            {THEME_MODES.map(m => {
              const active = m.mode === mode;
              return (
                <TouchableOpacity
                  key={m.mode}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setThemeMode(m.mode)}
                  style={[styles.segment, active && { backgroundColor: theme.navIconActiveBg }]}
                >
                  <Text style={[styles.segmentText, { color: active ? theme.navIconActiveColor : theme.textSub }]}>{m.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={[styles.rowHint, { color: theme.textSub }]}>
            System default follows your phone&apos;s light or dark setting. Books have their own theme in the reader.
          </Text>
        </Card>

        <Card label="Reading">
          <Stepper
            title="Starting speed"
            hint="Where RSVP starts. It also remembers the last speed you used."
            value={wpm > 0 ? `${wpm}` : '–'}
            label="starting speed"
            onStep={changeWpm}
            canDown={wpm > MIN_WPM}
            canUp={wpm > 0 && wpm < MAX_WPM}
          />
          <Rule />
          <SwitchRow
            title="Highlight the focus letter"
            hint="Colours the letter your eye rests on in RSVP. Off shows each word in one colour."
            value={prefs.orpHighlight}
            onChange={on => changePrefs({ orpHighlight: on })}
          />
          <Rule />
          <View style={styles.fontBlock}>
            <Text style={[styles.rowTitle, { color: theme.text }]}>Reading font</Text>
            <View style={[styles.segments, { borderColor: theme.borderSubtle }]}>
              {READER_FONTS.map(f => {
                const active = f.font === prefs.font;
                return (
                  <TouchableOpacity
                    key={f.font}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => changePrefs({ font: f.font })}
                    style={[styles.segment, active && { backgroundColor: theme.navIconActiveBg }]}
                  >
                    <Text style={[styles.segmentText, { color: active ? theme.navIconActiveColor : theme.textSub }]}>{f.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={[styles.rowHint, { color: theme.textSub }]}>
              The text of your books, in TXT and EPUB. Default is your phone’s font for TXT and a serif for EPUB.
            </Text>
          </View>
        </Card>

        <Card label="Daily goal">
          <Stepper
            title="Words a day"
            hint={goal === 0 ? 'Off. Tap + to set a goal; your progress shows on Stats.' : 'Your progress shows on Stats.'}
            value={goal === 0 ? 'Off' : goal.toLocaleString()}
            label="daily goal"
            onStep={changeGoal}
            canDown={goal > 0}
            canUp
          />
          <Rule />
          <SwitchRow
            title="Tell me when I reach it"
            hint={goal === 0 ? 'Set a daily goal first.' : 'A notification the first time you reach your goal each day.'}
            value={alertOn}
            disabled={goal === 0}
            onChange={changeAlert}
          />
          <Rule />
          <View style={styles.actionRow}>
            <View style={styles.actionText}>
              <Text style={[styles.rowTitle, { color: theme.text }]}>Notifications</Text>
              <Text style={[styles.rowHint, { color: theme.textSub }]}>{STATUS_TEXT[status]}</Text>
            </View>
            {(status === 'undetermined' || status === 'blocked') && (
              <TouchableOpacity
                onPress={status === 'blocked' ? openSystemSettings : allowNotifications}
                style={[styles.actionButton, { borderColor: theme.borderSubtle }]}
              >
                <Text style={[styles.actionButtonText, { color: theme.text }]}>{status === 'blocked' ? 'Open settings' : 'Allow'}</Text>
              </TouchableOpacity>
            )}
          </View>
        </Card>

        <Card label="Data">
          <ActionRow
            title="Dictionary cache"
            hint={`${cached.toLocaleString()} ${cached === 1 ? 'definition' : 'definitions'} stored for offline use`}
            action="Clear"
            disabled={cached === 0}
            onPress={() => setConfirm('cache')}
          />
          <Rule />
          <ActionRow
            title="Saved words"
            hint={`${saved.toLocaleString()} ${saved === 1 ? 'word' : 'words'} in your vault`}
            action="Delete all"
            disabled={saved === 0}
            onPress={() => setConfirm('vault')}
          />
        </Card>

        <Card label="About">
          <TouchableOpacity activeOpacity={0.7} onPress={() => setLicencesOpen(true)}>
            <Text style={[styles.rowTitle, { color: theme.text }]}>Open-source licences</Text>
            <Text style={[styles.rowHint, { color: theme.textSub }]}>The software, fonts and word data this app is built with</Text>
          </TouchableOpacity>
          <Rule />
          <View style={styles.valueRow}>
            <Text style={[styles.rowTitle, { color: theme.text }]}>Version</Text>
            <Text style={[styles.rowHint, { color: theme.textSub }]}>{Constants.expoConfig?.version ?? '—'}</Text>
          </View>
          <Rule />
          <View>
            <Text style={[styles.rowTitle, { color: theme.text }]}>Dictionary sources</Text>
            <Text style={[styles.rowHint, { color: theme.textSub }]}>
              Definitions for every language come from{' '}
              <Text style={styles.link} onPress={() => open('https://en.wiktionary.org/')}>Wiktionary</Text>
              {'.'}
            </Text>
          </View>
          <Rule />
          <View>
            <Text style={[styles.rowTitle, { color: theme.text }]}>Privacy</Text>
            <Text style={[styles.rowHint, { color: theme.textSub }]}>
              Your books, reading stats, goals and saved words stay on this device, and goal reminders are local notifications.
              Looking up a word sends that word, and your phone&apos;s IP address, to Wikimedia (Wiktionary). Nothing is sent to us.
            </Text>
          </View>
        </Card>

        {/* Portrait: clear the floating nav bar. Landscape: the nav is a side rail, so no clearance needed. */}
        <View style={{ height: landscape ? 0 : NAV_CLEARANCE - SPACING }} />
      </ScrollView>

      <LicensesModal visible={licencesOpen} onClose={() => setLicencesOpen(false)} />
      <NotificationsOffModal visible={notifOff} onClose={() => setNotifOff(false)} onOpenSettings={openSystemSettings} />
      <ConfirmModal
        visible={confirm === 'cache'}
        title="Clear dictionary cache?"
        message="Stored definitions are removed and fetched again the next time you define a word, which needs a connection. Your saved words are not affected."
        confirmLabel="Clear"
        onCancel={() => setConfirm(null)}
        onConfirm={confirmed}
      />
      <ConfirmModal
        visible={confirm === 'vault'}
        title="Delete all saved words?"
        message="Every word in your vault, with its definition and sentence, is removed. This can't be undone."
        confirmLabel="Delete all"
        onCancel={() => setConfirm(null)}
        onConfirm={confirmed}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 20 },
  content: { padding: SPACING, gap: SPACING },
  card: { borderRadius: 20, borderWidth: 1, padding: SPACING, gap: 12 },
  label: { fontFamily: 'Inter-SemiBold', fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase' },
  rule: { height: 1 },
  rowTitle: { fontFamily: 'Inter-SemiBold', fontSize: 14 },
  rowHint: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 18, marginTop: 2 },
  link: { textDecorationLine: 'underline' },
  valueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  actionText: { flex: 1 },
  actionButton: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  actionButtonText: { fontFamily: 'Inter-SemiBold', fontSize: 11 },
  stepper: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepperText: { fontFamily: 'Inter-Medium', fontSize: 20, lineHeight: 24 },
  stepValue: { fontFamily: 'Fraunces-Regular', fontSize: 18, minWidth: 54, textAlign: 'center' },
  fontBlock: { gap: 10 },
  segments: { flexDirection: 'row', borderWidth: 1, borderRadius: 12, padding: 3, gap: 3 },
  segment: { flex: 1, borderRadius: 9, paddingVertical: 9, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontFamily: 'Inter-SemiBold', fontSize: 12 },
});
