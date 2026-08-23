import React from 'react';
import { StyleSheet, Pressable, View } from 'react-native';
import AddIcon from '../../assets/images/tabIcons/Add.svg';

interface BookPlaceholderProps {
    onPress: () => void;
}

export default function BookPlaceholder({ onPress }: BookPlaceholderProps) {
    return (
        <Pressable onPress={onPress}>
            {({ pressed }) => (
                <View style={[styles.addBook, pressed && styles.pressedState]}>
                    <AddIcon width={16} height={16} />
                </View>
            )}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    addBook: {
        width: 100,
        height: 150,
        borderRadius: 0,
        borderWidth: 1,
        borderColor: '#1E1E1E',
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
