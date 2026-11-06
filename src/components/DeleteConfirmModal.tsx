import { type Book } from '@/db';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import CloseIcon from '../../assets/images/uploadIcons/close.svg';

type Props = {
  book: Book | null;
  onCancel: () => void;
  onConfirm: (book: Book) => void;
};

export default function DeleteConfirmModal({ book, onCancel, onConfirm }: Props) {
  return (
    <Modal visible={!!book} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.modal} onPress={() => undefined}>
          <View style={styles.modalHeader}>
            <Text style={styles.title}>Remove book?</Text>
            <TouchableOpacity style={styles.close} onPress={onCancel} hitSlop={10}>
              <CloseIcon width={8} height={8} />
            </TouchableOpacity>
          </View>

          <Text style={styles.bookTitle} numberOfLines={3}>{book?.title}</Text>
          <Text style={styles.subtitle}>This book will be removed from your shelf.</Text>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
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
    backgroundColor: '#FFFFFF',
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
    color: '#1E1E1E',
  },
  close: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderColor: '#CCCCCC',
    borderWidth: 0.5,
    borderRadius: 4,
  },
  bookTitle: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: '#1E1E1E',
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: '#808080',
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
    borderColor: '#CCCCCC',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  cancelText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 10,
    color: '#4D4D4D',
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
