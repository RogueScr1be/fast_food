/**
 * AnimatedCard Component
 * 
 * Simple animated card wrapper with fade-in effect.
 * Used for consistent card styling across the app.
 */

import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

interface AnimatedCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  delay?: number;
}

export default function AnimatedCard({ 
  children, 
  style, 
  delay = 0 
}: AnimatedCardProps) {
  return (
    <Animated.View
      entering={FadeInUp.delay(delay).springify()}
      style={[styles.card, style]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
});
