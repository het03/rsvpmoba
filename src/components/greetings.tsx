import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '@/lib/appTheme';

interface GreetingHeaderProps {
    title: string;
}

export default function GreetingHeader({ title }: GreetingHeaderProps) {
    const theme = useAppTheme();
    const [greeting, setGreeting] = useState(() => getGreeting());

    function getGreeting() {
        const hour = new Date().getHours();
        if (hour < 12) return 'good morning';
        if (hour < 17) return 'good afternoon';
        return 'good evening';
    }

    useEffect(() => {
        const timer = setInterval(() => {
            setGreeting(getGreeting());
        }, 600000);

        return () => clearInterval(timer);
    }, []);

    return (
        <View style={styles.textGroup}>
            <Text style={[styles.greetings, { color: theme.text }]}>{greeting}</Text>
            <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    textGroup: {
        gap: 0,
    },
    greetings: {
        fontFamily: 'Fraunces-Italic',
        fontSize: 16,
    },
    title: {
        fontFamily: 'Fraunces-Regular',
        fontSize: 26,
    },
});
