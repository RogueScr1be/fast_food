import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as Font from 'expo-font';
import { AudioProvider } from '../lib/context/AudioContext';
import { SessionProvider } from '../lib/context/SessionContext';

export default function RootLayout() {
  const [fontsLoaded, setFontsLoaded] = React.useState(false);

  useEffect(() => {
    async function loadFonts() {
      try {
        await Font.loadAsync({
          'manrope-400': require('../assets/fonts/Manrope-Regular.otf'),
          'manrope-600': require('../assets/fonts/Manrope-SemiBold.otf'),
          'manrope-700': require('../assets/fonts/Manrope-Bold.otf'),
        });
      } catch (error) {
        console.warn('Error loading fonts:', error);
      } finally {
        setFontsLoaded(true);
      }
    }

    loadFonts();
  }, []);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <AudioProvider>
      <SessionProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            animationEnabled: true,
          }}
        >
          <Stack.Screen name="index" options={{ title: 'Tonight' }} />
          <Stack.Screen name="deal" options={{ title: 'The Deal' }} />
          <Stack.Screen name="cook" options={{ title: 'Cook' }} />
          <Stack.Screen name="completion" options={{ title: 'Dinner Served' }} />
          <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        </Stack>
      </SessionProvider>
    </AudioProvider>
  );
}
