import { View, Text, StyleSheet } from 'react-native';

export default function StatsScreen() {
    return (
        <View style={styles.container}>
            <Text style={styles.text}>Stats</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
    },
    text: {
        fontSize: 24,
        fontWeight: '600',
        color: '#111827',
    },
});
