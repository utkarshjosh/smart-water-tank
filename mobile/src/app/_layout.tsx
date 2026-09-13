import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { persister, queryClient } from '@/api/queryClient';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { usePushMessages } from '@/push/foreground';
import { registerForPush, watchTokenRefresh } from '@/push/registration';
import { useNotificationRouting } from '@/push/routing';
import { ThemeProvider, useTheme } from '@/ui/theme';

// Held until auth resolves, so the first frame the user sees is the right
// screen. v1 rendered null here and flashed white on every launch.
void SplashScreen.preventAutoHideAsync();

/**
 * Push is registered once a user exists, never before: the token is stored
 * against an account, and asking for the notification permission on the
 * sign-in screen asks for something the app cannot yet use.
 */
function usePushLifecycle(signedIn: boolean) {
  useEffect(() => {
    if (!signedIn) return;

    // A denied permission is a legitimate answer; the app works without push.
    void registerForPush().catch(() => {});
    return watchTokenRefresh();
  }, [signedIn]);

  usePushMessages(signedIn);
  useNotificationRouting(signedIn);
}

function AuthGate() {
  const { user, initialising } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  const inAuthGroup = segments[0] === '(auth)';

  useEffect(() => {
    if (initialising) return;

    if (!user && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
    } else if (user && inAuthGroup) {
      router.replace('/');
    }
  }, [user, initialising, inAuthGroup, router]);

  useEffect(() => {
    if (!initialising) void SplashScreen.hideAsync();
  }, [initialising]);

  usePushLifecycle(!initialising && !!user);

  return null;
}

function Shell() {
  const { colors, scheme } = useTheme();

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <AuthGate />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'fade',
          animationDuration: 160,
        }}
      >
        <Stack.Screen name="(app)" />
        <Stack.Screen name="(auth)" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
          <ThemeProvider>
            <AuthProvider>
              <Shell />
            </AuthProvider>
          </ThemeProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
