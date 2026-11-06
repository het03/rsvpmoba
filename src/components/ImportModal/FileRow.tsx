import {
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useAppTheme } from '@/lib/appTheme';
import FileIcon from '../../../assets/images/uploadIcons/File.svg';
import WrongFileIcon from '../../../assets/images/uploadIcons/Wrong_File.svg';
import CloseIcon from '../../../assets/images/uploadIcons/close.svg';
import { FileEntry, getFileType } from './DropZone';

type FileRowProps = {
    file: FileEntry;
    index: number;
    onRemove: (index: number) => void;
};

export default function FileRow({ file, index, onRemove }: FileRowProps) {
    const theme = useAppTheme();
    const detedctedType = getFileType(file.type, file.name);
    const isTextOrEpub = detedctedType === 'TXT' || detedctedType === 'EPUB';

    return (
        <View
            style={[
                styles.fileRow,
                {
                    backgroundColor: theme.surface,
                    boxShadow: theme.bg === '#111111'
                        ? '0px 1px 4px rgba(255,255,255,0.08)'
                        : '-2px 2px 4px rgba(30,30,30,0.1)',
                } as any,
                file.state === 'error' && styles.fileRowError,
            ]}
        >
            <View style={styles.fileMeta}>
                <View style={[styles.fileIconWrap, { borderColor: theme.borderSubtle }]}>
                    {isTextOrEpub ? (
                        <FileIcon width={18} height={18} />
                    ) : (
                        <WrongFileIcon width={18} height={18} />
                    )}
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.fileName, { color: theme.text }]} numberOfLines={1}
                        ellipsizeMode="middle">{file.name}</Text>
                    <Text style={[styles.fileDetails, { color: theme.textSub }]}>
                        {file.size} • {file.type}
                    </Text>
                </View>
            </View>

            <View style={styles.fileStatusWrap}>
                {file.state === 'error' ? (
                    <TouchableOpacity onPress={() => onRemove(index)}>
                        <Text style={styles.badgeError}>Skip</Text>
                    </TouchableOpacity>
                ) : (
                    <>
                        <Text style={styles.badgeReady}>Ready</Text>
                        <TouchableOpacity style={[styles.close, { borderColor: theme.borderSubtle }]} onPress={() => onRemove(index)}>
                            <CloseIcon width={8} height={8} color={theme.text} />
                        </TouchableOpacity>
                    </>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    fileRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'transparent',
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    fileRowError: {},
    fileMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        flex: 1,
    },
    fileIconWrap: {
        width: 36,
        height: 36,
        borderRadius: 6,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'transparent',
        borderWidth: 0.5,
    },
    fileName: {
        fontSize: 12,
        fontFamily: 'Inter-Medium',
    },
    fileDetails: {
        fontSize: 10,
        fontFamily: 'Inter-Regular',
        marginTop: 2,
    },

    fileStatusWrap: {
        marginLeft: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    badgeReady: {
        fontSize: 10,
        fontFamily: 'Inter-Medium',
        color: '#059669',
        backgroundColor: '#D1FAE5',
        borderRadius: 6,
        paddingHorizontal: 10,
        paddingVertical: 2,
        overflow: 'hidden',
    },
    badgeError: {
        fontSize: 10,
        fontFamily: 'Inter-Medium',
        color: '#EF4444',
        backgroundColor: '#FF000025',
        borderRadius: 6,
        paddingHorizontal: 10,
        paddingVertical: 2,
        overflow: 'hidden',
    },
    close: {
        width: 20,
        height: 20,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 0.5,
        borderRadius: 4,
    },
});
