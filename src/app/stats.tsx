import { useAppTheme } from '@/lib/appTheme';
import { View, Text, StyleSheet } from 'react-native';

export default function StatsScreen() {
    const theme = useAppTheme();
    return (
        <View style={[styles.container, { backgroundColor: theme.bg }]}>
            <Text style={[styles.text, { color: theme.text }]}>Stats</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    text: {
        fontSize: 24,
        fontWeight: '600',
    },
});
