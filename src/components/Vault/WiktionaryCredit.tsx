import { useAppTheme } from '@/lib/appTheme';
import * as Linking from 'expo-linking';
import { StyleSheet, Text, View } from 'react-native';

type Version = '3.0' | '4.0';

const open = (url: string) => Linking.openURL(url).catch(() => {});
const licenseUrl = (v: Version) => `https://creativecommons.org/licenses/by-sa/${v}/`;

// Wiktionary's text is CC BY-SA, which asks for credit, a link to the source, a link to the licence and a note of any
// changes. With a word, the source link goes to that word's Wiktionary page. `versions` is the licence version(s) the
// text came under: the free dictionary API labels its data 3.0, Wiktionary itself says 4.0.
export default function WiktionaryCredit({ word, versions }: { word?: string; versions: Version[] }) {
  const theme = useAppTheme();
  const url = word ? `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}` : 'https://en.wiktionary.org/';
  return (
    <View style={styles.wrap}>
      <Text style={[styles.text, { color: theme.textSub }]}>
        Definitions adapted from{' '}
        <Text style={styles.link} onPress={() => open(url)}>Wiktionary</Text>
        {' · CC BY-SA '}
        {versions.map((v, i) => (
          <Text key={v}>
            {i > 0 ? ' / ' : ''}
            <Text style={styles.link} onPress={() => open(licenseUrl(v))}>{v}</Text>
          </Text>
        ))}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginVertical: 8 },
  text: { fontFamily: 'Inter-Regular', fontSize: 10 },
  link: { textDecorationLine: 'underline' },
});
