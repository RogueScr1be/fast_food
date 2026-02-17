import React from 'react';
import { Platform, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radii, spacing, typography } from '../lib/ui/theme';

type GlassButtonSize = 'tile' | 'cta' | 'icon';
type GlassButtonShape = 'cta' | 'icon';
type GlassButtonTone = 'default' | 'selected';

interface GlassButtonProps {
  label: string;
  onPress: () => void;
  size: GlassButtonSize;
  selected?: boolean;
  shape?: GlassButtonShape;
  tone?: GlassButtonTone;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export const GlassButton = React.forwardRef<View, GlassButtonProps>(function GlassButton({
  label,
  onPress,
  size,
  selected = false,
  shape = 'cta',
  tone,
  accessibilityLabel,
  style,
}, ref) {
  const resolvedTone: GlassButtonTone = tone ?? (selected ? 'selected' : 'default');
  const shapeStyle = shape === 'icon' || size === 'icon' ? styles.shapeIcon : styles.shapeCta;
  const shellStyle = [styles.shell, SIZE_STYLES[size], shapeStyle, style].filter(Boolean);

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
            <View style={[styles.iosSurface, resolvedTone === 'selected' && styles.iosSurfaceSelected]} />
          </>
        ) : (
          <View style={[styles.fallbackSurface, resolvedTone === 'selected' && styles.fallbackSurfaceSelected]} />
        )}
      </View>

      <LinearGradient
        pointerEvents="none"
        colors={[
          'rgba(255, 255, 255, 0.48)',
          'rgba(255, 255, 255, 0.14)',
          'rgba(255, 255, 255, 0.04)',
        ]}
        locations={[0, 0.3, 1]}
        style={styles.highlight}
      />

      <View pointerEvents="none" style={[styles.innerStroke, shape === 'icon' || size === 'icon' ? styles.strokeIcon : styles.strokeCta]} />
      <View
        pointerEvents="none"
        style={[
          styles.outerStroke,
          shape === 'icon' || size === 'icon' ? styles.strokeIcon : styles.strokeCta,
          resolvedTone === 'selected' ? styles.outerStrokeSelected : styles.outerStrokeDefault,
        ]}
      />

      <Text style={[styles.label, size === 'cta' ? styles.labelCta : styles.labelTile, resolvedTone === 'selected' ? styles.labelSelected : styles.labelDefault]}>
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
    borderRadius: radii.xl,
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
    backgroundColor: colors.glassButtonSurfaceTintIOS,
    shadowColor: colors.glassButtonShadowSoftDark,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.8,
    shadowRadius: 18,
    elevation: 5,
  },
  shapeCta: {
    borderRadius: radii.xl,
  },
  shapeIcon: {
    borderRadius: 20,
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
    backgroundColor: colors.glassButtonSurfaceTintFallback,
    opacity: 0.8,
  },
  fallbackSurfaceSelected: {
    opacity: 0.9,
  },
  iosSurface: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.glassButtonSurfaceTintIOS,
    opacity: 0.78,
  },
  iosSurfaceSelected: {
    opacity: 0.9,
  },
  highlight: {
    ...StyleSheet.absoluteFillObject,
  },
  innerStroke: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: colors.glassButtonInnerHighlight,
    opacity: 0.75,
  },
  outerStroke: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
  },
  strokeCta: {
    borderRadius: radii.xl,
  },
  strokeIcon: {
    borderRadius: 20,
  },
  outerStrokeDefault: {
    borderColor: colors.glassButtonStrokeBlue,
  },
  outerStrokeSelected: {
    borderColor: colors.glassButtonStrokeBlueSelected,
  },
  label: {
    textAlign: 'center',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontWeight: typography.bold,
  },
  labelDefault: {
    color: colors.glassButtonTextBlue,
  },
  labelSelected: {
    color: colors.glassButtonTextBlueSelected,
  },
  labelTile: {
    fontSize: typography['4xl'],
  },
  labelCta: {
    fontSize: typography['2xl'],
  },
});

export default GlassButton;
