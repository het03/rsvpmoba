import { Colors } from "@/constants/theme";
import {
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

const theme = {
    text: Colors.light.text,
    subtext: Colors.light.textSecondary,
    primary: Colors.light.primary,
};


interface SpeedControlProps {
    wpm: number;
    onIncrease: () => void;
    onDecrease: () => void;
}

export default function SpeedControl({
    wpm,
    onIncrease,
    onDecrease,
}: SpeedControlProps) {
    return (
        <View style={styles.container}>
            <TouchableOpacity
                style={styles.speedButton}
                onPress={onDecrease}
            >
                <Text style={styles.buttonText}>−</Text>
            </TouchableOpacity>

            <View style={styles.display}>
                <Text style={styles.label}>Speed</Text>
                <Text style={styles.wpm}>{wpm} WPM</Text>
            </View>

            <TouchableOpacity
                style={styles.speedButton}
                onPress={onIncrease}
            >
                <Text style={styles.buttonText}>+</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        marginTop: 20,
    },

    speedButton: {
        width: 45,
        height: 45,
        borderRadius: 22,
        backgroundColor: "#F3F4F6",
        justifyContent: "center",
        alignItems: "center",
    },

    display: {
        width: 120,
        alignItems: "center",
        marginHorizontal: 15,
    },

    label: {
        fontSize: 12,
        color: theme.subtext,
    },

    wpm: {
        fontSize: 18,
        fontWeight: "700",
        color: theme.text,
    },

    buttonText: {
        fontSize: 26,
        color: theme.primary,
        fontWeight: "700",
    },
});