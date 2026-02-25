import { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { AppProvider } from '@/contexts/AppContext';
import { hydrateFromStorage, isHydrated } from '@/lib/state/ffSession';
import { bootstrapHiddenContext } from '@/lib/context/cache';
import { bootstrapDecisionWeights } from '@/lib/decision-core/weights';
import { flushLearningQueue } from '@/lib/learning/sync';
import { bootstrapLearningActor } from '@/lib/learning/actor';

// Never crash on reload / double-call
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const isFrameworkReady = useFrameworkReady();
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const [fontsLoaded, fontError] = useFonts({
    'Inter-Regular': Inter_400Regular,
    'Inter-SemiBold': Inter_600SemiBold,
    'Inter-Bold': Inter_700Bold,
  });

  useEffect(() => {
    let alive = true;

    if (isHydrated()) {
      setPrefsLoaded(true);
      return;
    }

    const timeout = setTimeout(() => {
      if (alive) {
        console.warn('[RootLayout] Hydration timeout - proceeding with defaults');
        setPrefsLoaded(true);
      }
    }, 3000);

    hydrateFromStorage()
      .catch((error) => {
        console.warn('[RootLayout] Hydration failed:', error);
      })
      .finally(() => {
        clearTimeout(timeout);
        if (alive) setPrefsLoaded(true);
      });

    return () => {
      alive = false;
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    const apiBase =
      process.env.EXPO_PUBLIC_DECISION_OS_API_BASE_URL?.replace(/\/+$/, '') ?? '';
    let connectivityState: 'unknown' | 'online' | 'offline' = 'unknown';

    void bootstrapHiddenContext();
    void bootstrapDecisionWeights();
    void bootstrapLearningActor();
    void flushLearningQueue();

    const subscription = AppState.addEventListener('change', (nextState) => {
      const prevState = appStateRef.current;
      appStateRef.current = nextState;
      if (
        (prevState === 'inactive' || prevState === 'background') &&
        nextState === 'active'
      ) {
        void flushLearningQueue();
      }
    });

    const maybeWindow = globalThis as typeof globalThis & {
      addEventListener?: (type: string, listener: () => void) => void;
      removeEventListener?: (type: string, listener: () => void) => void;
    };
    const handleOnline = () => {
      void flushLearningQueue();
    };
    if (typeof maybeWindow.addEventListener === 'function') {
      maybeWindow.addEventListener('online', handleOnline);
    }

    const checkConnectivity = async () => {
      if (!apiBase) return;
      try {
        const response = await fetch(`${apiBase}/healthz.json`, { method: 'GET' });
        const nextState = response.ok ? 'online' : 'offline';
        if (connectivityState === 'offline' && nextState === 'online') {
          void flushLearningQueue();
        }
        connectivityState = nextState;
      } catch {
        connectivityState = 'offline';
      }
    };
    void checkConnectivity();

    const connectivityInterval = setInterval(() => {
      void checkConnectivity();
    }, 15_000);

    const interval = setInterval(() => {
      void flushLearningQueue();
    }, 30_000);

    return () => {
      subscription.remove();
      clearInterval(interval);
      clearInterval(connectivityInterval);
      if (typeof maybeWindow.removeEventListener === 'function') {
        maybeWindow.removeEventListener('online', handleOnline);
      }
    };
  }, []);

  const isReady = isFrameworkReady && (fontsLoaded || fontError) && prefsLoaded;

  useEffect(() => {
    if (isReady) SplashScreen.hideAsync().catch(() => {});
  }, [isReady]);

  if (!isReady) return null;

  return (
    <AppProvider>
      <Stack screenOptions={{ headerShown: false }}>
        {/* Root redirect */}
        <Stack.Screen name="index" />

        {/* Hub screen (no tabs) */}
        <Stack.Screen name="tonight" />

        {/* Deal flow */}
        <Stack.Screen
          name="deal"
          options={{
            gestureEnabled: true,
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="checklist/[recipeId]"
          options={{
            gestureEnabled: true,
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="rescue/[mealId]"
          options={{
            gestureEnabled: true,
            animation: 'slide_from_right',
          }}
        />

        {/* Profile / Settings */}
        <Stack.Screen
          name="profile"
          options={{
            gestureEnabled: true,
            animation: 'slide_from_right',
          }}
        />

        <Stack.Screen name="+not-found" />
      </Stack>

      <StatusBar style="auto" />
    </AppProvider>
  );
}
