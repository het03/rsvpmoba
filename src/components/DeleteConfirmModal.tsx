import { type Book } from '@/db';
import { useAppTheme } from '@/lib/appTheme';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import CloseIcon from '../../assets/images/uploadIcons/close.svg';

type Props = {
  book: Book | null;
  onCancel: () => void;
  onConfirm: (book: Book) => void;
};

export default function DeleteConfirmModal({ book, onCancel, onConfirm }: Props) {
  const theme = useAppTheme();
  return (
    <Modal visible={!!book} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={[styles.modal, { backgroundColor: theme.surface }]} onPress={() => undefined}>
          <View style={styles.modalHeader}>
            <Text style={[styles.title, { color: theme.text }]}>Remove book?</Text>
            <TouchableOpacity style={[styles.close, { borderColor: theme.borderSubtle }]} onPress={onCancel} hitSlop={10}>
              <CloseIcon width={8} height={8} color={theme.text} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.bookTitle, { color: theme.text }]} numberOfLines={3}>{book?.title}</Text>
          <Text style={[styles.subtitle, { color: theme.textSub }]}>This book will be removed from your shelf.</Text>

          <View style={styles.footer}>
            <TouchableOpacity style={[styles.cancelButton, { borderColor: theme.borderSubtle }]} onPress={onCancel}>
              <Text style={[styles.cancelText, { color: theme.textSub }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.removeButton} onPress={() => book && onConfirm(book)}>
              <Text style={styles.removeText}>Remove</Text>
            </TouchableOpacity>
          </View>
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
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 14,
    boxShadow: '0px 0px 30px rgba(30, 30, 30, 0.25)',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
  },
  close: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderRadius: 4,
  },
  bookTitle: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    marginBottom: 16,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
  },
  cancelButton: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  cancelText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 10,
  },
  removeButton: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#C94040',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  removeText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 10,
    color: '#FFFFFF',
  },
});
