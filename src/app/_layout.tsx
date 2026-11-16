import Nav from '@/components/Shared/Nav';
import React from 'react';
import { initDb } from '@/db';
import { enableThemeFades, useAppTheme, useTargetTheme } from '@/lib/appTheme';
import { backTarget } from '@/lib/navigation';
import { useSyncTriggers } from '@/lib/useSyncTriggers';
import { loadThemeMode } from '@/lib/themeStore';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { SplashScreen, Stack, usePathname, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { BackHandler, View, useWindowDimensions } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// 1. Import regular and italic Fraunces variants
import {
  Fraunces_400Regular,
  Fraunces_400Regular_Italic,
  Fraunces_700Bold,
  Fraunces_700Bold_Italic
} from '@expo-google-fonts/fraunces';

// 2. Import regular and italic Inter variants
import {
  Inter_400Regular,
  Inter_400Regular_Italic,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_700Bold_Italic,
  Inter_800ExtraBold
} from '@expo-google-fonts/inter';

SplashScreen.preventAutoHideAsync();

function RootShell({ children }: { children: React.ReactNode }) {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  // Landscape puts the nav in a column on the left and the pages beside it. Only the direction changes,
  // so the children keep their place in the tree and rotating never rebuilds an open screen.
  const landscape = width > height;
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.bg }}>
      {/* Explicit, so a forced Light/Dark theme gets matching status-bar icons even when the phone is set the other way. */}
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <View style={{ flex: 1, backgroundColor: theme.bg, flexDirection: landscape ? 'row' : 'column' }}>
        {children}
      </View>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  // The wanted theme, not the one mid-fade: the window background and the navigator's screen container change in one
  // step (they sit behind every screen, which fade their own colours), instead of being updated on every frame.
  const theme = useTargetTheme();

  const [loaded, error] = useFonts({
    // Fraunces
    'Fraunces-Regular': Fraunces_400Regular,
    'Fraunces-Italic': Fraunces_400Regular_Italic,
    'Fraunces-Bold': Fraunces_700Bold,
    'Fraunces-BoldItalic': Fraunces_700Bold_Italic,

    // Inter
    'Inter-Regular': Inter_400Regular,
    'Inter-Italic': Inter_400Regular_Italic,
    'Inter-Medium': Inter_500Medium,
    'Inter-SemiBold': Inter_600SemiBold,
    'Inter-Bold': Inter_700Bold,
    'Inter-BoldItalic': Inter_700Bold_Italic,
    'Inter-ExtraBold': Inter_800ExtraBold,
  });

  // The tables must exist before any screen queries them (a fresh install creates them here). A failure is logged and
  // the app still opens, as before.
  const [dbReady, setDbReady] = useState(false);
  useEffect(() => {
    initDb().catch(e => console.error('initDb failed:', e)).finally(() => setDbReady(true));
  }, []);

  // The saved theme is read before the first screen draws, so a forced Dark never flashes Light first.
  const [themeReady, setThemeReady] = useState(false);
  useEffect(() => {
    loadThemeMode().finally(() => setThemeReady(true));
  }, []);

  // From the first screen on, changing the theme fades; the saved theme loading at start-up must not.
  useEffect(() => {
    if (themeReady) enableThemeFades();
  }, [themeReady]);

  // Backup and sync starts at the moments the app can act on (open, background, a timer). It does nothing unless sync is
  // switched on and a Google account is connected, so it is safe to start for everyone.
  useSyncTriggers(dbReady);

  // The window's own background shows for a moment while the phone rotates; match it to the theme so
  // rotation doesn't flash white (or black in light mode).
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.bg).catch(() => {});
  }, [theme.bg]);

  useEffect(() => {
    if ((loaded || error) && themeReady && dbReady) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error, themeReady, dbReady]);

  if ((!loaded && !error) || !themeReady || !dbReady) {
    return null;
  }

  return (
    <RootShell>
      <NavBar />
      <View style={{ flex: 1 }}>
        {/* Opening a book keeps the platform's default slide. Switching between the four tabs cross-fades
            instead: a sideways slide drags the old screen across the fixed nav and looks clipped, in both
            orientations. The screen container takes the theme colour so nothing flashes through. */}
        <Stack
          screenOptions={({ route }) => ({
            headerShown: false,
            contentStyle: { backgroundColor: theme.bg },
            animation: route.name.startsWith('reader/') ? 'default' : 'fade',
          })}
        />
      </View>
    </RootShell>
  );
}

function NavBar() {
  const theme = useAppTheme();
  const pathname = usePathname();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const landscape = width > height;

  // Hardware back goes to the page's parent (Settings → Profile), or home for a tab page. Home (let Android exit
  // normally) and a book (has its own handler) are left alone.
  useEffect(() => {
    const target = backTarget(pathname);
    if (target === null) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      router.replace(target as any);
      return true;
    });
    return () => sub.remove();
  }, [pathname]);

  // Hide nav while reading — the reader has its own header + back button.
  if (pathname.startsWith('/reader/')) return null;

  // Landscape: a vertical rail down the left edge, centred vertically; the pages take the rest of the width.
  if (landscape) {
    return (
      <View style={{ justifyContent: 'center', paddingLeft: insets.left + 12, paddingRight: 8 }}>
        <Nav vertical />
      </View>
    );
  }

  return (
    <View
      pointerEvents="box-none"
      // zIndex: the nav comes before the pages in the layout (so landscape can put it beside them), which
      // would otherwise paint it underneath the pages in portrait.
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingBottom: 26, alignItems: 'center', zIndex: 10 }}
    >
      <Nav />
    </View>
  );
}
