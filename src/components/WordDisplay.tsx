import { Colors } from "@/constants/theme";
import { StyleSheet, Text, View } from "react-native";
import { getORPIndex } from "../utils/orp";

const theme = {
    text: Colors.light.text,
    subtext: Colors.light.textSecondary,
};

interface WordDisplayProps {
    word: string;
    fontSize?: number;
    textColor?: string;
    subtextColor?: string;
}

export default function WordDisplay({ word, fontSize = 52, textColor, subtextColor }: WordDisplayProps) {
    if (!word) {
        return (
            <Text style={styles.placeholder}>
                Import or paste some text to begin.
            </Text>
        );
    }

    const pivot = getORPIndex(word);

    const before = word.slice(0, pivot);
    const letter = word[pivot] || "";
    const after = word.slice(pivot + 1);

    // Scale down gracefully for long words instead of truncating them.
    const effectiveFont = word.length > 14 ? Math.max(24, Math.floor(fontSize * (14 / word.length))) : fontSize;

    return (
        <View style={styles.container}>
            <View style={styles.innerRow}>
                <Text numberOfLines={1} style={[styles.word, { fontSize: effectiveFont, color: textColor ?? theme.text }]}>{before}</Text>
                <Text numberOfLines={1} style={[styles.word, styles.highlight, { fontSize: effectiveFont, color: '#EF4444' }]}>{letter}</Text>
                <Text numberOfLines={1} style={[styles.word, { fontSize: effectiveFont, color: textColor ?? theme.text }]}>{after}</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
        flexDirection: "row",
        alignItems: "baseline",
        justifyContent: "center",
        paddingHorizontal: 8,
    },

    innerRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'center',
        flexWrap: 'nowrap',
        minWidth: 0,
        overflow: 'hidden',
    },
    word: {
        fontSize: 52,
        fontWeight: "700",
        letterSpacing: -0.5,
        minWidth: 0,
        flexShrink: 1,
    },



    highlight: {
        color: "#EF4444",
        paddingHorizontal: 2,
        fontWeight: '800',
    },

    placeholder: {
        fontSize: 20,
        textAlign: "center",
    },
});