import { StyleSheet, View, ViewStyle } from "react-native";

import { Colors } from "@/constants/theme";
const theme = {
    primary: Colors.light.primary,
};

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
        backgroundColor: theme.primary,
        borderRadius: 5,
    },
});