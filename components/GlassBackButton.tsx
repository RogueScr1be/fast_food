import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft } from 'lucide-react-native';
import { colors, spacing } from '../lib/ui/theme';

interface GlassBackButtonProps {
  onPress: () => void;
  topInset: number;
  accessibilityLabel?: string;
}

export function GlassBackButton({
  onPress,
  topInset,
  accessibilityLabel = 'Go back',
}: GlassBackButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.shell, { top: topInset + spacing.sm }, pressed && styles.shellPressed]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <View style={styles.absoluteFill} pointerEvents="none">
        {Platform.OS === 'ios' ? (
          <>
            <BlurView intensity={24} tint="light" style={styles.absoluteFill} />
            <View style={styles.iosSurface} />
          </>
        ) : (
          <View style={styles.fallbackSurface} />
        )}
      </View>
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255, 255, 255, 0.58)', 'rgba(255, 255, 255, 0.12)']}
        style={styles.highlight}
      />
      <View pointerEvents="none" style={styles.innerStroke} />
      <View pointerEvents="none" style={styles.outerStroke} />
      <ChevronLeft size={20} color={colors.glassButtonText} />
    </Pressable>
  );
}

export default GlassBackButton;

const styles = StyleSheet.create({
  shell: {
    position: 'absolute',
    left: spacing.md,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: colors.glassBackSurfaceIOS,
    shadowColor: colors.glassButtonShadowDark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 18,
    elevation: 5,
    zIndex: 50,
  },
  shellPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.95,
  },
  absoluteFill: {
    ...StyleSheet.absoluteFillObject,
  },
  iosSurface: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.glassBackSurfaceIOS,
    opacity: 0.8,
  },
  fallbackSurface: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.glassBackSurfaceFallback,
    opacity: 0.95,
  },
  highlight: {
    ...StyleSheet.absoluteFillObject,
  },
  innerStroke: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderRadius: 20,
    borderColor: colors.glassButtonInnerStroke,
  },
  outerStroke: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderRadius: 20,
    borderColor: colors.glassButtonOuterStroke,
  },
});
