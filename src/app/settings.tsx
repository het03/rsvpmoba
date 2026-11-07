import { useAppTheme } from '@/lib/appTheme';
import { View, Text, StyleSheet } from 'react-native';

export default function SettingsScreen() {
    const theme = useAppTheme();
    return (
        <View style={[styles.container, { backgroundColor: theme.bg }]}>
            <Text style={[styles.text, { color: theme.text }]}>Settings</Text>
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
        fontFamily: 'Fraunces-Regular',
        fontSize: 26,
    },
});
