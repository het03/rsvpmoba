import { useAppTheme } from '@/lib/appTheme';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ReaderPlaceholder() {
  const theme = useAppTheme();
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.bg }]}>
      <View style={styles.center}>
        <Text style={[styles.title, { color: theme.text }]}>Ready to read?</Text>
        <Text style={[styles.sub, { color: theme.textSub }]}>Tap a book on your shelf to open it.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 32,
  },
  title: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 18,
    textAlign: 'center',
  },
  sub: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    textAlign: 'center',
  },
});
