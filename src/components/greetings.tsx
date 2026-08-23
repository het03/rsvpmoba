import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface GreetingHeaderProps {
    title: string;
}

export default function GreetingHeader({ title }: GreetingHeaderProps) {
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
            <Text style={styles.greetings}>{greeting}</Text>
            <Text style={styles.title}>{title}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    textGroup: {
        gap: 0,
    },
    greetings: {
        color: '#1E1E1E',
        fontFamily: 'Fraunces-Italic',
        fontSize: 16,
    },
    title: {
        color: '#1E1E1E',
        fontFamily: 'Fraunces-Regular',
        fontSize: 26,
    },
});
