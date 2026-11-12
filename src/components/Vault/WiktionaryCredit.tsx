import { useAppTheme } from '@/lib/appTheme';
import * as Linking from 'expo-linking';
import { StyleSheet, Text, View } from 'react-native';

const LICENSE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/';

const open = (url: string) => Linking.openURL(url).catch(() => {});

// Wiktionary's text is CC BY-SA 4.0, which asks for credit, a link to the source, a link to the licence and a note of
// any changes. With a word, the source link goes to that word's Wiktionary page.
export default function WiktionaryCredit({ word }: { word?: string }) {
  const theme = useAppTheme();
  const url = word ? `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}` : 'https://en.wiktionary.org/';
  return (
    <View style={styles.wrap}>
      <Text style={[styles.text, { color: theme.textSub }]}>
        Definitions adapted from{' '}
        <Text style={styles.link} onPress={() => open(url)}>Wiktionary</Text>
        {' · '}
        <Text style={styles.link} onPress={() => open(LICENSE_URL)}>CC BY-SA 4.0</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginVertical: 8 },
  text: { fontFamily: 'Inter-Regular', fontSize: 10 },
  link: { textDecorationLine: 'underline' },
});
