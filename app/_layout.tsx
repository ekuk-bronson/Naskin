import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Constants from 'expo-constants';
import { getSetting } from '../services/storage';
import { useTextScale } from '../services/textScale';
import {
  initNotificationHandler,
  requestPermissions,
  scheduleReminder,
} from '../services/notifications';
import { AuthProvider } from '../contexts/AuthContext';

/** true in dev-build / standalone — notifications work; false in Expo Go */
const NOTIF_SUPPORTED: boolean = Constants.appOwnership !== 'expo';

export default function RootLayout() {
  const router = useRouter();
  const textScale = useTextScale();

  // Globally enable system font scaling and apply our app-level multiplier
  // for any Text without an explicit fontSize. Keys with explicit sizes
  // are scaled where they call useScaledFont() directly.
  useEffect(() => {
    const TextAny = Text as any;
    TextAny.defaultProps = TextAny.defaultProps || {};
    TextAny.defaultProps.allowFontScaling = true;
    TextAny.defaultProps.maxFontSizeMultiplier = textScale > 1 ? 1.5 : 1.2;
    // Apply default style scale for components without explicit fontSize.
    TextAny.defaultProps.style = textScale > 1
      ? { fontSize: Math.round(14 * textScale) }
      : undefined;
  }, [textScale]);

  // Note: onboarding redirect is handled declaratively in `app/(tabs)/_layout.tsx`
  // via <Redirect href="/onboarding" />. We deliberately do NOT navigate
  // programmatically from this root layout — doing so during the first
  // commit raises "Attempted to navigate before mounting the Root Layout".

  useEffect(() => {
    // initDb() already called at module import level — just init notifications here
    initNotificationHandler(); // no-op in Expo Go (guarded inside)

    // Restore saved notification preference
    const enabled  = getSetting('notif_enabled');
    const interval = getSetting('notif_interval');
    if (enabled !== 'false') {
      requestPermissions().then((granted) => {
        if (granted) scheduleReminder(interval ? parseInt(interval, 10) : 30);
      });
    }

    // Navigate to mole when user taps a notification
    // Guard: never require expo-notifications in Expo Go
    let cleanup: (() => void) | undefined;
    if (NOTIF_SUPPORTED) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Notifications = require('expo-notifications');
        const sub = Notifications.addNotificationResponseReceivedListener(
          (response: any) => {
            const moleId = response?.notification?.request?.content?.data?.moleId;
            if (moleId != null) {
              router.push({ pathname: '/result', params: { id: String(moleId) } });
            }
          },
        );
        cleanup = () => sub.remove();
      } catch {
        // Ignore unexpected errors
      }
    }
    return () => cleanup?.();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="auto" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: '#F8F6F3' },
              animation: 'slide_from_right',
            }}
          >
            {/* Onboarding */}
            <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false, animation: 'fade' }} />
            {/* Auth screens */}
            <Stack.Screen name="login" options={{ animation: 'fade', gestureEnabled: false }} />
            {/* Main app */}
            <Stack.Screen name="(tabs)" options={{ animation: 'none' }} />
            <Stack.Screen name="result" />
            <Stack.Screen name="add" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
          </Stack>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
