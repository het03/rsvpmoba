import { ReactNode } from "react";
import { GestureResponderEvent, PanResponder, PanResponderGestureState, StyleSheet, View } from "react-native";

interface ReaderGesturesProps {
    children: ReactNode;
    onNext: () => void;
    onPrevious: () => void;
    onIncreaseSpeed: () => void;
    onDecreaseSpeed: () => void;
    onTogglePlay: () => void;
}

export default function ReaderGestures({
    children,
    onNext,
    onPrevious,
    onIncreaseSpeed,
    onDecreaseSpeed,
    onTogglePlay,
}: ReaderGesturesProps) {
    const responder = PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,

        onPanResponderRelease: (
            _event: GestureResponderEvent,
            gesture: PanResponderGestureState
        ) => {
            const { dx, dy } = gesture;

            const absX = Math.abs(dx);
            const absY = Math.abs(dy);

            // Horizontal swipe
            if (absX > absY) {
                if (dx > 50) {
                    onNext();
                } else if (dx < -50) {
                    onPrevious();
                }
                return;
            }

            // Vertical swipe
            if (absY > 50) {
                if (dy < 0) {
                    onIncreaseSpeed();
                } else {
                    onDecreaseSpeed();
                }
                return;
            }

            // Tap
            onTogglePlay();
        },
    });

    return (
        <View style={styles.container} {...responder.panHandlers}>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
});