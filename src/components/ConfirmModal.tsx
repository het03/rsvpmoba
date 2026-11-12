import { useAppTheme } from '@/lib/appTheme';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import CloseIcon from '../../assets/images/uploadIcons/close.svg';

type Props = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
};

// A confirmation popup for destructive actions, matching DeleteConfirmModal.
export default function ConfirmModal({ visible, title, message, confirmLabel, onCancel, onConfirm }: Props) {
  const theme = useAppTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={[styles.modal, { backgroundColor: theme.surface }]} onPress={() => undefined}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
            <TouchableOpacity style={[styles.close, { borderColor: theme.borderSubtle }]} onPress={onCancel} hitSlop={10}>
              <CloseIcon width={8} height={8} color={theme.text} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.message, { color: theme.textSub }]}>{message}</Text>

          <View style={styles.footer}>
            <TouchableOpacity style={[styles.cancel, { borderColor: theme.borderSubtle }]} onPress={onCancel}>
              <Text style={[styles.cancelText, { color: theme.textSub }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirm} onPress={onConfirm}>
              <Text style={styles.confirmText}>{confirmLabel}</Text>
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { flex: 1, fontFamily: 'Inter-SemiBold', fontSize: 14, paddingRight: 12 },
  close: { width: 20, height: 20, justifyContent: 'center', alignItems: 'center', borderWidth: 0.5, borderRadius: 4 },
  message: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 18, marginBottom: 16 },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10 },
  cancel: { justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 7 },
  cancelText: { fontFamily: 'Inter-SemiBold', fontSize: 10 },
  confirm: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#C94040', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 7 },
  confirmText: { fontFamily: 'Inter-SemiBold', fontSize: 10, color: '#FFFFFF' },
});
