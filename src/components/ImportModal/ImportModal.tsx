import { useState } from 'react';
import {
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import CloseIcon from '../../../assets/images/uploadIcons/close.svg';
import DropZone, { FileEntry } from './DropZone';

type ImportModalProps = {
    visible: boolean;
    onClose: () => void;
};

export default function ImportModal({ visible, onClose }: ImportModalProps) {
    const [files, setFiles] = useState<FileEntry[]>([]);

    const hasFiles = files.length > 0;
    const allFilesAreInvalid = hasFiles && files.every((file) => file.state === 'error');
    const isImportDisabled = !hasFiles || allFilesAreInvalid;

    const closeAndClearModal = () => {
        setFiles([]);
        onClose();
    };

    const handleApplyFiles = () => {
        if (isImportDisabled) return;

        if (hasFiles) {
            closeAndClearModal();
        }
    };

    const handleReset = () => {
        setFiles([]);
    };

    const handleClose = () => {
        handleReset();
        onClose();
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
            <Pressable style={styles.backdrop} onPress={handleClose}>
                <Pressable style={styles.modal} onPress={() => undefined}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.title}>Import</Text>
                        <TouchableOpacity style={styles.close} onPress={handleClose} hitSlop={10}>
                            <CloseIcon width={8} height={8} />
                        </TouchableOpacity>
                    </View>

                    <DropZone files={files} onFilesChange={setFiles} />

                    <View style={styles.footer}>
                        <TouchableOpacity style={styles.cancelButton} onPress={handleClose}>
                            <Text style={styles.cancelText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.primaryButton, isImportDisabled && styles.disabledButton]} onPress={handleApplyFiles}>
                            <Text style={[styles.primaryText, isImportDisabled && styles.disabledButtonText]}>{hasFiles ? 'Import Files' : 'Import File'}</Text>
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
    footer: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: 10,
        marginTop: 8,
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
    primaryButton: {
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#1E1E1E',
        borderRadius: 6,
        paddingHorizontal: 12,
        paddingVertical: 7,
    },
    disabledButton: {
        backgroundColor: '#CCCCCC',
    },
    disabledButtonText: {
        color: '#4D4D4D',
    },
    primaryText: {
        fontFamily: 'Inter-SemiBold',
        fontSize: 10,
        color: '#FFFFFF',
    },
});
