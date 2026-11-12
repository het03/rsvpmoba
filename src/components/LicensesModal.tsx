import { useAppTheme } from '@/lib/appTheme';
import { LICENCES, UNLISTED } from '@/lib/notices.generated';
import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import CloseIcon from '../../assets/images/uploadIcons/close.svg';

type Props = { visible: boolean; onClose: () => void };

type Item =
  | { kind: 'licence'; key: string; index: number }
  | { kind: 'unlisted'; key: string };

const ITEMS: Item[] = [
  ...LICENCES.map((_, index): Item => ({ kind: 'licence', key: `l${index}`, index })),
  ...(UNLISTED.length > 0 ? [{ kind: 'unlisted', key: 'unlisted' } as Item] : []),
];

const packageCount = UNLISTED.reduce((n, u) => n + u.packages.length, 0) + LICENCES.reduce((n, g) => n + g.packages.length, 0);

// The notices the licences of the app's open-source components ask us to include. Each group is collapsed until tapped.
export default function LicensesModal({ visible, onClose }: Props) {
  const theme = useAppTheme();
  const [open, setOpen] = useState<string | null>(null);
  const toggle = (key: string) => setOpen(o => (o === key ? null : key));

  const renderItem = ({ item }: { item: Item }) => {
    const expanded = open === item.key;
    if (item.kind === 'unlisted') {
      return (
        <View style={styles.group}>
          <TouchableOpacity style={styles.groupHeader} onPress={() => toggle(item.key)}>
            <Text style={[styles.groupTitle, { color: theme.text }]}>Licensed under a standard licence</Text>
            <Text style={[styles.groupCount, { color: theme.textSub }]}>{UNLISTED.reduce((n, u) => n + u.packages.length, 0)} packages</Text>
          </TouchableOpacity>
          {expanded && UNLISTED.map(u => (
            <View key={u.id} style={styles.body}>
              <Text style={[styles.label, { color: theme.textSub }]}>{u.id}</Text>
              <Text style={[styles.mono, { color: theme.text }]}>{u.packages.join('\n')}</Text>
            </View>
          ))}
        </View>
      );
    }

    const g = LICENCES[item.index];
    return (
      <View style={styles.group}>
        <TouchableOpacity style={styles.groupHeader} onPress={() => toggle(item.key)}>
          <Text style={[styles.groupTitle, { color: theme.text }]} numberOfLines={1}>{g.title}</Text>
          <Text style={[styles.groupCount, { color: theme.textSub }]}>{g.packages.length} {g.packages.length === 1 ? 'package' : 'packages'}</Text>
        </TouchableOpacity>
        {expanded && (
          <View style={styles.body}>
            <Text style={[styles.mono, { color: theme.text }]}>
              {g.packages.map(p => (p.copyright.length ? `${p.name}\n${p.copyright.map(c => `  ${c}`).join('\n')}` : p.name)).join('\n\n')}
            </Text>
            <Text style={[styles.licenceText, { color: theme.textSub, borderColor: theme.borderSubtle }]}>{g.text}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.modal, { backgroundColor: theme.surface }]} onPress={() => undefined}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>Open-source licences</Text>
            <TouchableOpacity style={[styles.close, { borderColor: theme.borderSubtle }]} onPress={onClose} hitSlop={10}>
              <CloseIcon width={8} height={8} color={theme.text} />
            </TouchableOpacity>
          </View>

          <FlatList
            data={ITEMS}
            keyExtractor={i => i.key}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <Text style={[styles.intro, { color: theme.textSub }]}>
                This app is built with open-source software ({packageCount} packages), and the fonts Fraunces and Inter (SIL Open
                Font License). Word definitions come from Wiktionary and its contributors, under CC BY-SA. The licences are below.
              </Text>
            }
            ItemSeparatorComponent={() => <View style={[styles.rule, { backgroundColor: theme.borderSubtle }]} />}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  modal: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '85%',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 8,
    boxShadow: '0px 0px 30px rgba(30, 30, 30, 0.25)',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { flex: 1, fontFamily: 'Inter-SemiBold', fontSize: 14, paddingRight: 12 },
  close: { width: 20, height: 20, justifyContent: 'center', alignItems: 'center', borderWidth: 0.5, borderRadius: 4 },
  intro: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 18, marginBottom: 12 },
  rule: { height: 1 },
  group: { paddingVertical: 4 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, gap: 12 },
  groupTitle: { flex: 1, fontFamily: 'Inter-SemiBold', fontSize: 12 },
  groupCount: { fontFamily: 'Inter-Medium', fontSize: 11 },
  body: { paddingBottom: 12, gap: 10 },
  label: { fontFamily: 'Inter-SemiBold', fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase' },
  mono: { fontFamily: 'Inter-Regular', fontSize: 10, lineHeight: 15 },
  licenceText: { fontFamily: 'Inter-Regular', fontSize: 10, lineHeight: 15, borderTopWidth: 1, paddingTop: 10 },
});
