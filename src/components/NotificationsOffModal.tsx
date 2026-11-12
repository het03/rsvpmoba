import { useAppTheme } from '@/lib/appTheme';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import CloseIcon from '../../assets/images/uploadIcons/close.svg';

type Props = {
  visible: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
};

// Shown when a daily goal is set but notifications are blocked; sends the user to the app's system settings.
export default function NotificationsOffModal({ visible, onClose, onOpenSettings }: Props) {
  const theme = useAppTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.modal, { backgroundColor: theme.surface }]} onPress={() => undefined}>
          <View style={styles.modalHeader}>
            <Text style={[styles.title, { color: theme.text }]}>Notifications are off</Text>
            <TouchableOpacity style={[styles.close, { borderColor: theme.borderSubtle }]} onPress={onClose} hitSlop={10}>
              <CloseIcon width={8} height={8} color={theme.text} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.message, { color: theme.textSub }]}>
            Your goal is saved and your progress shows here, but you won&apos;t be told when you reach it. Turn notifications
            on for this app in Settings to get a nudge.
          </Text>

          <View style={styles.footer}>
            <TouchableOpacity style={[styles.cancelButton, { borderColor: theme.borderSubtle }]} onPress={onClose}>
              <Text style={[styles.cancelText, { color: theme.textSub }]}>Not now</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.primaryButton, { backgroundColor: theme.text }]} onPress={onOpenSettings}>
              <Text style={[styles.primaryText, { color: theme.bg }]}>Open settings</Text>
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
  primaryButton: {
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  primaryText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 10,
  },
});
