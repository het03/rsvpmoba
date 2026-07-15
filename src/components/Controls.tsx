import { Colors } from "@/constants/theme";
import {
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

const theme = {
    text: Colors.light.text,
    primary: Colors.light.primary,
};

interface ControlsProps {
    playing: boolean;
    onPlayPause: () => void;
    onRestart: () => void;
    onNext: () => void;
    onPrev: () => void;
}

export default function Controls({
    playing,
    onPlayPause,
    onRestart,
    onNext,
    onPrev,
}: ControlsProps) {
    return (
        <View style={styles.container}>
            <TouchableOpacity
                style={styles.button}
                onPress={onPrev}
            >
                <Text style={styles.icon}>⏪</Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={[styles.button, styles.playButton]}
                onPress={onPlayPause}
            >
                <Text style={styles.playIcon}>
                    {playing ? "⏸" : "▶"}
                </Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={styles.button}
                onPress={onNext}
            >
                <Text style={styles.icon}>⏩</Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={styles.button}
                onPress={onRestart}
            >
                <Text style={styles.icon}>↺</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        marginTop: 28,
    },
    button: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: "#F3F4F6",
        justifyContent: "center",
        alignItems: "center",
        marginHorizontal: 6,
    },
    playButton: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: theme.primary,
    },
    icon: {
        fontSize: 18,
        color: theme.text,
    },
    playIcon: {
        fontSize: 24,
        color: "white",
    },
});