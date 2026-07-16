import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { LibraryProvider } from '../hooks/useLibrary';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <LibraryProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </LibraryProvider>
    </GestureHandlerRootView>
  );
}
