import Nav from '@/components/Shared/Nav';
import React from 'react';
import { initDb } from '@/db';
import { useAppTheme } from '@/lib/appTheme';
import { useFonts } from 'expo-font';
import { SplashScreen, Stack, usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { BackHandler, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

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
  Inter_700Bold_Italic
} from '@expo-google-fonts/inter';

SplashScreen.preventAutoHideAsync();

function RootShell({ children }: { children: React.ReactNode }) {
  const theme = useAppTheme();
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        {children}
      </View>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
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
  });

  useEffect(() => {
    initDb().catch(e => console.error('initDb failed:', e));
  }, []);

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) {
    return null;
  }

  return (
    <RootShell>
      <Stack screenOptions={{ headerShown: false }} />
      <NavBar />
    </RootShell>
  );
}

function NavBar() {
  const theme = useAppTheme();
  const pathname = usePathname();
  const router = useRouter();

  // On any tab page other than home, hardware back → go home.
  useEffect(() => {
    // Skip for home (let Android exit normally) and reader detail (has its own handler).
    if (pathname === '/' || pathname.startsWith('/reader/')) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      router.replace('/');
      return true;
    });
    return () => sub.remove();
  }, [pathname]);

  // Hide nav while reading — the reader has its own header + back button.
  if (pathname.startsWith('/reader/')) return null;
  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 26, backgroundColor: theme.bg, alignItems: 'center' }}>
      <Nav />
    </View>
  );
}
