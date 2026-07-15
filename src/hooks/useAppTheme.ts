import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

const KEY = 'APP_THEME';

export type AppTheme = 'light' | 'dark' | 'sepia' | undefined;

export default function useAppTheme() {
    const [theme, setTheme] = useState<AppTheme>(undefined);

    useEffect(() => {
        let mounted = true;
        AsyncStorage.getItem(KEY).then((v) => {
            if (!mounted) return;
            if (v === 'light' || v === 'dark' || v === 'sepia') setTheme(v as AppTheme);
        });

        return () => {
            mounted = false;
        };
    }, []);

    function saveTheme(next: AppTheme) {
        setTheme(next);
        if (!next) return AsyncStorage.removeItem(KEY);
        return AsyncStorage.setItem(KEY, next);
    }

    return { theme, setTheme: saveTheme };
}
