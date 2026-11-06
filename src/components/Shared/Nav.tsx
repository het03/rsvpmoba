import { usePathname, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAppTheme } from '@/lib/appTheme';

import HomeIcon from '../../../assets/images/tabIcons/Home.svg';
import ReaderIcon from '../../../assets/images/tabIcons/Reader.svg';
import StatsIcon from '../../../assets/images/tabIcons/Stats.svg';
import ProfileIcon from '../../../assets/images/tabIcons/Profile.svg';

const navItems = [
    { key: 'home',    href: '/',        Icon: HomeIcon },
    { key: 'reader',  href: '/reader',  Icon: ReaderIcon },
    { key: 'stats',   href: '/stats',   Icon: StatsIcon },
    { key: 'settings', href: '/settings', Icon: ProfileIcon },
];

export default function Nav() {
    const theme = useAppTheme();
    const router = useRouter();
    const pathname = usePathname();

    return (
        <View style={[styles.container, { backgroundColor: theme.navBg, borderColor: theme.navBorder }]}>
            {navItems.map(({ key, href, Icon }) => {
                const isActive = pathname === href || (href !== '/' && pathname.startsWith(href + '/'));
                return (
                    <Pressable
                        key={key}
                        onPress={() => { if (pathname !== href) router.push(href as any); }}
                        style={[styles.navItem, isActive && [styles.activeNavItem, { backgroundColor: theme.navIconActiveBg }]]}
                    >
                        <Icon width={26} height={26} color={isActive ? theme.navIconActiveColor : theme.navIconInactive} />
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
        borderWidth: 1,
    },
    navItem: {
        alignItems: 'center',
        justifyContent: 'center',
        width: 48,
        height: 48,
        borderRadius: 14,
        paddingVertical: 8,
        paddingHorizontal: 12,
    },
    activeNavItem: {
        borderRadius: 24,
    },
});
