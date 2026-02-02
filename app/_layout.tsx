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

  // Hydrate preferences from storage on mount
  // Includes timeout fallback to prevent black-screen on corrupted storage
  useEffect(() => {
    let alive = true;

    if (isHydrated()) {
      setPrefsLoaded(true);
      return;
    }

    // Timeout fallback: don't let hydration block app forever
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

  const isReady = isFrameworkReady && (fontsLoaded || fontError) && prefsLoaded;

  useEffect(() => {
    if (isReady) SplashScreen.hideAsync().catch(() => {});
  }, [isReady]);

  if (!isReady) return null;

  return (
    <AppProvider>
      <Stack screenOptions={{ headerShown: false }}>
        {/* Root redirect to Tonight */}
        <Stack.Screen name="index" />
        
        {/* Tab navigator (Tonight, Profile) */}
        <Stack.Screen name="(tabs)" />
        
        {/* MVP Deal flow routes - must be explicitly registered for reliable navigation */}
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
        
        {/* DRM rescue checklist - separate from regular checklist */}
        <Stack.Screen 
          name="rescue/[mealId]" 
          options={{ 
            gestureEnabled: true,
            animation: 'slide_from_right',
          }} 
        />
        
        {/* Fallback */}
        <Stack.Screen name="+not-found" />
      </Stack>

      <StatusBar style="auto" />
    </AppProvider>
  );
}
