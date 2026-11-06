import { useAppTheme } from '@/lib/appTheme';
import { StyleSheet, Pressable, View } from 'react-native';
import AddIcon from '../../assets/images/tabIcons/Add.svg';

interface BookPlaceholderProps {
    onPress: () => void;
    cardWidth: number;
    cardHeight: number;
}

export default function BookPlaceholder({ onPress, cardWidth, cardHeight }: BookPlaceholderProps) {
    const theme = useAppTheme();
    return (
        <Pressable onPress={onPress}>
            {({ pressed }) => (
                <View style={[styles.addBook, { width: cardWidth, height: cardHeight, borderColor: theme.border }, pressed && styles.pressedState]}>
                    <AddIcon width={16} height={16} color={theme.border} />
                </View>
            )}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    addBook: {
        borderRadius: 0,
        borderWidth: 1,
        borderStyle: 'dashed',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'transparent',
        opacity: 1,
    },
    pressedState: {
        opacity: 0.7,
    },
});
