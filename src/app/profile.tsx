import ConfirmModal from '@/components/ConfirmModal';
import GreetingHeader from '@/components/greetings';
import NoticeModal, { type Notice } from '@/components/NoticeModal';
import { getDb } from '@/db';
import { useAppTheme } from '@/lib/appTheme';
import { clearProfile, GUEST_NAME, initials, loadProfile, type Profile } from '@/lib/profile';
import { EMPTY_STATS, loadStats, type Stats } from '@/lib/stats';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const SPACING = 16;
const NAV_CLEARANCE = 110;
const AVATAR = 64;

// Google sign-in is not built yet (it needs a development build and a Google Cloud setup), so the button says so
// instead of pretending to work.
const SIGN_IN_NOTICE: Notice = {
  title: 'Google sign-in is coming',
  message:
    'Signing in will let you keep your library, progress and saved words backed up and in sync across your devices. ' +
    'It is not available yet, and everything stays on this phone until it is.',
};

function Card({ label, children }: { label?: string; children: ReactNode }) {
  const theme = useAppTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }]}>
      {label ? <Text style={[styles.label, { color: theme.textSub }]}>{label}</Text> : null}
      {children}
    </View>
  );
}

function Figure({ value, label }: { value: string; label: string }) {
  const theme = useAppTheme();
  return (
    <View style={styles.figure}>
      <Text style={[styles.number, { color: theme.text }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={[styles.figureLabel, { color: theme.textSub }]}>{label}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [books, setBooks] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirmOut, setConfirmOut] = useState(false);

  // A snapshot, reloaded each time the tab is shown, like Stats.
  useFocusEffect(useCallback(() => {
    let live = true;
    loadProfile().then(p => { if (live) setProfile(p); });
    getDb()
      .then(async db => {
        const [s, row] = await Promise.all([loadStats(db), db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM books')]);
        if (live) { setStats(s); setBooks(row?.n ?? 0); }
      })
      .catch(e => console.error('profile load failed:', e));
    return () => { live = false; };
  }, []));

  const signOut = async () => {
    setConfirmOut(false);
    await clearProfile();
    setProfile(null);
  };

  const name = profile?.name ?? GUEST_NAME;

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.bg }]}
      // In landscape the nav rail already handles the left edge's inset.
      edges={landscape ? ['top', 'right', 'bottom'] : ['top', 'right', 'bottom', 'left']}
    >
      <View style={styles.header}>
        <GreetingHeader title="Profile" greeting={false} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <Card>
          <View style={styles.identity}>
            <View style={[styles.avatar, { backgroundColor: theme.navIconActiveBg }]}>
              {profile?.photoUrl ? (
                <Image source={{ uri: profile.photoUrl }} style={styles.avatarImage} accessibilityLabel={`${name}'s photo`} />
              ) : (
                <Text style={[styles.avatarText, { color: theme.navIconActiveColor }]}>{profile ? initials(name) : '?'}</Text>
              )}
            </View>
            <View style={styles.identityText}>
              <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{name}</Text>
              <Text style={[styles.sub, { color: theme.textSub }]} numberOfLines={1}>
                {profile ? profile.email || 'Signed in' : 'Not signed in. Your library lives on this phone.'}
              </Text>
            </View>
          </View>

          {profile ? (
            <TouchableOpacity style={[styles.button, { borderColor: theme.borderSubtle }]} onPress={() => setConfirmOut(true)}>
              <Text style={[styles.buttonText, { color: theme.text }]}>Sign out</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.button, { borderColor: theme.borderSubtle }]} onPress={() => setNotice(SIGN_IN_NOTICE)}>
              <Text style={[styles.buttonText, { color: theme.text }]}>Sign in with Google</Text>
            </TouchableOpacity>
          )}
        </Card>

        <Card label="Your reading">
          <View style={styles.row}>
            <Figure value={stats.words.total.toLocaleString()} label="words read" />
            <Figure value={String(books)} label={books === 1 ? 'book' : 'books'} />
          </View>
          <View style={styles.row}>
            <Figure value={String(stats.dna.booksFinished)} label={stats.dna.booksFinished === 1 ? 'book finished' : 'books finished'} />
            <Figure value={String(stats.streak.current)} label="day streak" />
          </View>
        </Card>

        <TouchableOpacity activeOpacity={0.7} onPress={() => router.push('/settings')}>
          <Card>
            <View style={styles.settingsRow}>
              <View style={styles.identityText}>
                <Text style={[styles.rowTitle, { color: theme.text }]}>Settings</Text>
                <Text style={[styles.sub, { color: theme.textSub }]}>Appearance, reading, daily goal and data</Text>
              </View>
              <Text style={[styles.chevron, { color: theme.textSub }]}>›</Text>
            </View>
          </Card>
        </TouchableOpacity>

        {/* Portrait: clear the floating nav bar. Landscape: the nav is a side rail, so no clearance needed. */}
        <View style={{ height: landscape ? 0 : NAV_CLEARANCE - SPACING }} />
      </ScrollView>

      <NoticeModal notice={notice} onClose={() => setNotice(null)} />
      <ConfirmModal
        visible={confirmOut}
        title="Sign out?"
        message="You'll be signed out on this phone. Your books, stats and saved words stay here."
        confirmLabel="Sign out"
        onCancel={() => setConfirmOut(false)}
        onConfirm={signOut}
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
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  identityText: { flex: 1 },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: AVATAR, height: AVATAR },
  avatarText: { fontFamily: 'Fraunces-Regular', fontSize: 24 },
  name: { fontFamily: 'Fraunces-Regular', fontSize: 22 },
  sub: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 18, marginTop: 2 },
  button: { borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  buttonText: { fontFamily: 'Inter-SemiBold', fontSize: 13 },
  row: { flexDirection: 'row', gap: 12 },
  figure: { flex: 1, gap: 2 },
  number: { fontFamily: 'Fraunces-Regular', fontSize: 30 },
  figureLabel: { fontFamily: 'Inter-Medium', fontSize: 12 },
  settingsRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowTitle: { fontFamily: 'Inter-SemiBold', fontSize: 14 },
  chevron: { fontFamily: 'Inter-Regular', fontSize: 24, lineHeight: 26 },
});
