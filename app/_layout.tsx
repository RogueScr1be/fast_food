import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { AppProvider } from '@/contexts/AppContext';
import { hydrateFromStorage, isHydrated } from '@/lib/state/ffSession';

// Never crash on reload / double-call
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const isFrameworkReady = useFrameworkReady();
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const [fontsLoaded, fontError] = useFonts({
    'Inter-Regular': Inter_400Regular,
    'Inter-SemiBold': Inter_600SemiBold,
    'Inter-Bold': Inter_700Bold,
  });

  // Hydrate preferences from storage on mount (never hang splash)
  useEffect(() => {
    let alive = true;

    if (isHydrated()) {
      setPrefsLoaded(true);
      return;
    }

    hydrateFromStorage()
      .catch(() => {
        // hydration marks hydrated=true internally on error
      })
      .finally(() => {
        if (alive) setPrefsLoaded(true);
      });

    return () => {
      alive = false;
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

        {/* Optional */}
        <Stack.Screen name="onboarding" />

        {/* Tabs */}
        <Stack.Screen name="(tabs)" />

        {/* MVP flow routes (explicit for reliable navigation + export) */}
        <Stack.Screen
          name="deal"
          options={{ gestureEnabled: true, animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="checklist/[recipeId]"
          options={{ gestureEnabled: true, animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="rescue/[mealId]"
          options={{ gestureEnabled: true, animation: 'slide_from_right' }}
        />

        {/* Fallback */}
        <Stack.Screen name="+not-found" />
      </Stack>

      <StatusBar style="auto" />
    </AppProvider>
  );
}
