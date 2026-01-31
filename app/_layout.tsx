import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, Text, StyleSheet } from 'react-native';
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { AppProvider } from '@/contexts/AppContext';
import { hydrateFromStorage, isHydrated } from '@/lib/state/ffSession';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const isFrameworkReady = useFrameworkReady();
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  
  const [fontsLoaded, fontError] = useFonts({
    'Inter-Regular': Inter_400Regular,
    'Inter-SemiBold': Inter_600SemiBold,
    'Inter-Bold': Inter_700Bold,
  });

  // Hydrate preferences from storage on mount
  useEffect(() => {
    if (isHydrated()) {
      setPrefsLoaded(true);
      return;
    }
    
    hydrateFromStorage().then(() => {
      setPrefsLoaded(true);
    });
  }, []);

  const isReady = isFrameworkReady && (fontsLoaded || fontError) && prefsLoaded;

  useEffect(() => {
    if (isReady) {
      // Hide splash screen
      SplashScreen.hideAsync();
    }
  }, [isReady]);

  if (!isReady) {
    // Show minimal loading state (splash screen still visible)
    return null;
  }

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