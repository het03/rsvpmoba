import ConfirmModal from '@/components/ConfirmModal';
import GreetingHeader from '@/components/greetings';
import LicensesModal from '@/components/LicensesModal';
import { getDb } from '@/db';
import { useAppTheme, useThemeMode } from '@/lib/appTheme';
import { clearCache, countCache } from '@/lib/dictionary';
import { THEME_MODES } from '@/lib/themeMode';
import { setThemeMode } from '@/lib/themeStore';
import { clearVault, countVault } from '@/lib/vault';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
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

export default function SettingsScreen() {
  const theme = useAppTheme();
  const mode = useThemeMode();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;

  const [licencesOpen, setLicencesOpen] = useState(false);
  const [cached, setCached] = useState(0);
  const [saved, setSaved] = useState(0);
  const [confirm, setConfirm] = useState<'cache' | 'vault' | null>(null);

  const refresh = useCallback(() => {
    getDb()
      .then(async db => {
        setCached(await countCache(db));
        setSaved(await countVault(db));
      })
      .catch(() => {});
  }, []);

  // Counts are a snapshot: reload whenever the tab is shown, so words saved while reading are included.
  useFocusEffect(refresh);

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
        <GreetingHeader title="Settings" />
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
  segments: { flexDirection: 'row', borderWidth: 1, borderRadius: 12, padding: 3, gap: 3 },
  segment: { flex: 1, borderRadius: 9, paddingVertical: 9, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontFamily: 'Inter-SemiBold', fontSize: 12 },
});
