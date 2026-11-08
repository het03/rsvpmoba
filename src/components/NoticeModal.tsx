import { useAppTheme } from '@/lib/appTheme';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import CloseIcon from '../../assets/images/uploadIcons/close.svg';

export type Notice = { title: string; message: string };

type Props = {
  notice: Notice | null;
  onClose: () => void;
};

// A simple information popup that matches the app's other modals (see DeleteConfirmModal).
export default function NoticeModal({ notice, onClose }: Props) {
  const theme = useAppTheme();
  return (
    <Modal visible={!!notice} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.modal, { backgroundColor: theme.surface }]} onPress={() => undefined}>
          <View style={styles.modalHeader}>
            <Text style={[styles.title, { color: theme.text }]}>{notice?.title}</Text>
            <TouchableOpacity style={[styles.close, { borderColor: theme.borderSubtle }]} onPress={onClose} hitSlop={10}>
              <CloseIcon width={8} height={8} color={theme.text} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.message, { color: theme.textSub }]}>{notice?.message}</Text>

          <View style={styles.footer}>
            <TouchableOpacity style={[styles.button, { backgroundColor: theme.text }]} onPress={onClose}>
              <Text style={[styles.buttonText, { color: theme.bg }]}>Got it</Text>
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
    flex: 1,
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    paddingRight: 12,
  },
  close: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderRadius: 4,
  },
  message: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 16,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  button: {
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  buttonText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 10,
  },
});
