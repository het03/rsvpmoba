import { getDb } from '@/db';
import { useAppTheme } from '@/lib/appTheme';
import { listVault, removeWord, type VaultWord } from '@/lib/vault';
import { useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import CloseIcon from '../../../assets/images/uploadIcons/close.svg';
import WiktionaryCredit from './WiktionaryCredit';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Called after a word is removed, so the count shown elsewhere can refresh. */
  onChanged: () => void;
};

// Every saved word, newest first, with the sentence it came from and the book.
export default function VaultModal({ visible, onClose, onChanged }: Props) {
  const theme = useAppTheme();
  const [words, setWords] = useState<VaultWord[]>([]);

  useEffect(() => {
    if (!visible) return;
    let live = true;
    getDb().then(listVault).then(w => { if (live) setWords(w); }).catch(() => {});
    return () => { live = false; };
  }, [visible]);

  const remove = async (id: number) => {
    setWords(prev => prev.filter(w => w.id !== id));
    const db = await getDb();
    await removeWord(db, id).catch(() => {});
    onChanged();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.modal, { backgroundColor: theme.surface }]} onPress={() => undefined}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>Word vault</Text>
            <TouchableOpacity style={[styles.close, { borderColor: theme.borderSubtle }]} onPress={onClose} hitSlop={10}>
              <CloseIcon width={8} height={8} color={theme.text} />
            </TouchableOpacity>
          </View>

          {words.length === 0 ? (
            <Text style={[styles.empty, { color: theme.textSub }]}>
              Select a word while reading and choose Define, then save it. It will be kept here with the sentence it came from.
            </Text>
          ) : (
            <FlatList
              data={words}
              keyExtractor={w => String(w.id)}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={[styles.rule, { backgroundColor: theme.borderSubtle }]} />}
              renderItem={({ item }) => (
                <View style={styles.row}>
                  <View style={styles.rowTop}>
                    <Text style={[styles.word, { color: theme.text }]}>{item.word}</Text>
                    <TouchableOpacity onPress={() => remove(item.id)} hitSlop={10}>
                      <Text style={[styles.remove, { color: theme.textSub }]}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.definition, { color: theme.text }]}>{item.definition}</Text>
                  {item.context !== '' && <Text style={[styles.context, { color: theme.textSub }]}>{item.context}</Text>}
                  {item.bookTitle !== '' && <Text style={[styles.book, { color: theme.textSub }]} numberOfLines={1}>{item.bookTitle}</Text>}
                </View>
              )}
            />
          )}

          {words.length > 0 && <WiktionaryCredit />}
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
    maxWidth: 420,
    maxHeight: '80%',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 6,
    boxShadow: '0px 0px 30px rgba(30, 30, 30, 0.25)',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { flex: 1, fontFamily: 'Inter-SemiBold', fontSize: 14, paddingRight: 12 },
  close: { width: 20, height: 20, justifyContent: 'center', alignItems: 'center', borderWidth: 0.5, borderRadius: 4 },
  empty: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 18, marginBottom: 16 },
  rule: { height: 1 },
  row: { paddingVertical: 12, gap: 3 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  word: { fontFamily: 'Fraunces-Regular', fontSize: 18 },
  remove: { fontFamily: 'Inter-SemiBold', fontSize: 10 },
  definition: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 18 },
  context: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 18, fontStyle: 'italic' },
  book: { fontFamily: 'Inter-Medium', fontSize: 10 },
});
