import GreetingHeader from '@/components/greetings';
import LicensesModal from '@/components/LicensesModal';
import { useAppTheme } from '@/lib/appTheme';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const SPACING = 16;
const NAV_CLEARANCE = 110;

export default function SettingsScreen() {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const [licencesOpen, setLicencesOpen] = useState(false);

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
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setLicencesOpen(true)}
          style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }]}
        >
          <Text style={[styles.label, { color: theme.textSub }]}>About</Text>
          <Text style={[styles.rowTitle, { color: theme.text }]}>Open-source licences</Text>
          <Text style={[styles.rowHint, { color: theme.textSub }]}>The software, fonts and word data this app is built with</Text>
        </TouchableOpacity>

        {/* Portrait: clear the floating nav bar. Landscape: the nav is a side rail, so no clearance needed. */}
        <View style={{ height: landscape ? 0 : NAV_CLEARANCE - SPACING }} />
      </ScrollView>

      <LicensesModal visible={licencesOpen} onClose={() => setLicencesOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 20 },
  content: { padding: SPACING, gap: SPACING },
  card: { borderRadius: 20, borderWidth: 1, padding: SPACING, gap: 4 },
  label: { fontFamily: 'Inter-SemiBold', fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6 },
  rowTitle: { fontFamily: 'Fraunces-Regular', fontSize: 20 },
  rowHint: { fontFamily: 'Inter-Regular', fontSize: 12 },
});
