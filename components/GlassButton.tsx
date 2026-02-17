import React from 'react';
import { Platform, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radii, spacing, typography } from '../lib/ui/theme';

type GlassButtonSize = 'tile' | 'cta' | 'icon';

interface GlassButtonProps {
  label: string;
  onPress: () => void;
  size: GlassButtonSize;
  selected?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export const GlassButton = React.forwardRef<View, GlassButtonProps>(function GlassButton({
  label,
  onPress,
  size,
  selected = false,
  accessibilityLabel,
  style,
}, ref) {
  const shellStyle = [styles.shell, SIZE_STYLES[size], style].filter(Boolean);

  return (
    <Pressable
      ref={ref}
      style={({ pressed }) => [shellStyle, pressed && styles.shellPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
    >
      <View style={styles.absoluteFill} pointerEvents="none">
        {Platform.OS === 'ios' ? (
          <>
            <BlurView intensity={28} tint="light" style={styles.absoluteFill} />
            <View style={styles.iosSurface} />
          </>
        ) : (
          <View style={styles.fallbackSurface} />
        )}
      </View>

      <LinearGradient
        pointerEvents="none"
        colors={[
          'rgba(255, 255, 255, 0.72)',
          'rgba(255, 255, 255, 0.2)',
          'rgba(255, 255, 255, 0.06)',
        ]}
        locations={[0, 0.3, 1]}
        style={styles.highlight}
      />

      <View pointerEvents="none" style={styles.innerStroke} />
      <View pointerEvents="none" style={[styles.outerStroke, selected && styles.outerStrokeSelected]} />

      <Text style={[styles.label, size === 'cta' ? styles.labelCta : styles.labelTile, selected && styles.labelSelected]}>
        {label}
      </Text>
    </Pressable>
  );
});

const SIZE_STYLES: Record<GlassButtonSize, ViewStyle> = {
  tile: {
    minHeight: 92,
    borderRadius: radii.xl,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  cta: {
    minHeight: 56,
    borderRadius: radii.full,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
};

const styles = StyleSheet.create({
  shell: {
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.glassButtonSurfaceIOS,
    shadowColor: colors.glassButtonShadowDark,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 5,
  },
  shellPressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.96,
  },
  absoluteFill: {
    ...StyleSheet.absoluteFillObject,
  },
  fallbackSurface: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.glassButtonSurfaceFallback,
    opacity: 0.95,
  },
  iosSurface: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.glassButtonSurfaceIOS,
    opacity: 0.8,
  },
  highlight: {
    ...StyleSheet.absoluteFillObject,
  },
  innerStroke: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: colors.glassButtonInnerStroke,
    borderRadius: 999,
    opacity: 0.9,
  },
  outerStroke: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: colors.glassButtonOuterStroke,
    borderRadius: 999,
  },
  outerStrokeSelected: {
    borderColor: 'rgba(59, 130, 246, 0.45)',
  },
  label: {
    color: colors.glassButtonText,
    textAlign: 'center',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontWeight: typography.semibold,
  },
  labelTile: {
    fontSize: typography['3xl'],
  },
  labelCta: {
    fontSize: typography.xl,
  },
  labelSelected: {
    color: '#DBEAFE',
  },
});

export default GlassButton;
