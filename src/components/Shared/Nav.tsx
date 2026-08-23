import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useRouter, usePathname } from 'expo-router';

import HomeIcon from '../../../assets/images/tabIcons/Home.svg';
import ReaderIcon from '../../../assets/images/tabIcons/Reader.svg';
import StatsIcon from '../../../assets/images/tabIcons/Stats.svg';
import ProfileIcon from '../../../assets/images/tabIcons/Profile.svg';

const navItems = [
    { key: 'home', href: '/', Icon: HomeIcon },
    { key: 'reader', href: '/reader', Icon: ReaderIcon },
    { key: 'stats', href: '/stats', Icon: StatsIcon },
    { key: 'settings', href: '/settings', Icon: ProfileIcon },
];

export default function Nav() {
    const router = useRouter();
    const pathname = usePathname();

    return (
        <View style={styles.container}>
            {navItems.map(({ key, href, Icon }) => {
                const isActive = pathname === href;

                return (
                    <Pressable
                        key={key}
                        onPress={() => router.push(href as any)}
                        style={[styles.navItem, isActive && styles.activeNavItem]}
                    >
                        <Icon
                            width={26}
                            height={26}
                            color={isActive ? '#FFFFFF' : '#9CA3AF'}
                        />
                    </Pressable>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: 300,
        height: 64,
        alignSelf: 'center',
        paddingVertical: 13,
        paddingHorizontal: 13,
        borderRadius: 36,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: 'rgba(156, 163, 175, 0.5)',
    },
    navItem: {
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 14,
    },
    activeNavItem: {
        backgroundColor: '#1E1E1E',
        width: 48,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 24,
    },
});
