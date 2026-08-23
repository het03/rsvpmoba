import { StyleSheet, View, ViewStyle } from "react-native";


interface ProgressBarProps {
    progress: number;
}
export default function ProgressBar({ progress }: ProgressBarProps) {
    const fillStyle: ViewStyle = {
        width: `${Math.min(100, Math.max(0, progress * 100))}%`,
    };

    return (
        <View style={styles.track}>
            <View style={[styles.fill, fillStyle]} />
        </View>
    );
}

const styles = StyleSheet.create({
    track: {
        height: 5,
        width: "100%",
        backgroundColor: "#E5E7EB",
        borderRadius: 5,
        overflow: "hidden",
        marginTop: 24,
    },

    fill: {
        height: "100%",
        backgroundColor: '#4F46E5',
        borderRadius: 5,
    },
});
