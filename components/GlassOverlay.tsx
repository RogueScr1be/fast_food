/**
 * GlassOverlay — Three-Level Expansion Overlay
 *
 * Renders a frosted-glass panel anchored to the bottom of the screen.
 * Driven by a `level` prop (0 / 1 / 2) and optionally by handle-only drag.
 *
 * Level 0 — Collapsed: mode label pill + handle bar (~72 px visible)
 * Level 1 — Half:      ingredients / children (~50 % of screen)
 * Level 2 — Full:      checklist / expanded content (~92 % of screen)
 *
 * Platform behavior:
 *   iOS  — BlurView (expo-blur) with fixed intensity (never animated)
 *   Android — Semi-transparent dark tint (no blur, no perf hit)
 *
 * Gestures (handle-only):
 *   Vertical pan on the handle bar expands / collapses the overlay.
 *   Content below the handle is inert to the pan gesture.
 *   On release the overlay snaps to the nearest level.
 *
 * This is a controlled component: `level` is the source of truth.
 * Gesture completions call `onLevelChange` to request a new level.
 * If `onLevelChange` is omitted, gestures spring back to the current level.
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
  interpolate,
  Extrapolation,
  runOnJS,
  SharedValue,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';
import {
  colors,
  spacing,
  typography,
  glass,
} from '../lib/ui/theme';

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

/** Minimum touch area for the drag handle (accessibility) */
const HANDLE_ZONE_HEIGHT = 40;

/** Height visible at each level */
export const LEVEL_HEIGHTS = {
  0: 72,
  1: Math.round(SCREEN_HEIGHT * 0.5),
  2: Math.round(SCREEN_HEIGHT * 0.92),
} as const;

/** Total container height (equals level-2 height) */
const CONTAINER_HEIGHT = LEVEL_HEIGHTS[2];

/**
 * translateY values that position the overlay for each level.
 * Higher value = more hidden (pushed below screen edge).
 *   Level 0: almost fully hidden
 *   Level 2: fully visible (translateY = 0)
 */
export const SNAP_POINTS: Record<0 | 1 | 2, number> = {
  0: CONTAINER_HEIGHT - LEVEL_HEIGHTS[0],
  1: CONTAINER_HEIGHT - LEVEL_HEIGHTS[1],
  2: 0,
};

/** Ordered snap targets for nearest-snap calculation (ascending translateY) */
const SNAP_VALUES = [SNAP_POINTS[2], SNAP_POINTS[1], SNAP_POINTS[0]];
const SNAP_LEVELS: readonly (0 | 1 | 2)[] = [2, 1, 0];

const SPRING_CONFIG = {
  damping: glass.springDamping,
  stiffness: glass.springStiffness,
  mass: glass.springMass,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OverlayLevel = 0 | 1 | 2;

export interface GlassOverlayProps {
  /** Current expansion level (controlled) */
  level: OverlayLevel;
  /** Called when a gesture requests a new level */
  onLevelChange?: (level: OverlayLevel) => void;
  /** Mode label text shown at all levels (e.g. "Fancy") */
  modeLabel?: string;
  /** Content rendered at level 1+ (ingredients) */
  children?: React.ReactNode;
  /** Content rendered at level 2 (checklist / confirm) */
  expandedContent?: React.ReactNode;
  /** External translateY offset (e.g. from idle affordance lift) */
  externalLiftY?: SharedValue<number>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GlassOverlay({
  level,
  onLevelChange,
  modeLabel,
  children,
  expandedContent,
  externalLiftY,
}: GlassOverlayProps) {
  const translateY = useSharedValue(SNAP_POINTS[level]);
  const gestureStartY = useSharedValue(0);
  const isFirstRender = useRef(true);

  // React to programmatic level changes
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      translateY.value = SNAP_POINTS[level];
      return;
    }
    translateY.value = withSpring(SNAP_POINTS[level], SPRING_CONFIG);
  }, [level]);

  // -----------------------------------------------------------------------
  // Gesture: handle-only vertical pan
  // -----------------------------------------------------------------------

  const panGesture = Gesture.Pan()
    .onStart(() => {
      gestureStartY.value = translateY.value;
    })
    .onUpdate((e) => {
      const next = gestureStartY.value + e.translationY;
      // Clamp between fully open (0) and fully collapsed
      translateY.value = Math.max(SNAP_POINTS[2], Math.min(SNAP_POINTS[0], next));
    })
    .onEnd(() => {
      // Snap to nearest level
      const cur = translateY.value;
      let nearestIdx = 0;
      let minDist = Math.abs(cur - SNAP_VALUES[0]);
      for (let i = 1; i < SNAP_VALUES.length; i++) {
        const dist = Math.abs(cur - SNAP_VALUES[i]);
        if (dist < minDist) {
          minDist = dist;
          nearestIdx = i;
        }
      }

      const targetLevel = SNAP_LEVELS[nearestIdx];
      translateY.value = withSpring(SNAP_POINTS[targetLevel], SPRING_CONFIG);

      if (onLevelChange) {
        runOnJS(onLevelChange)(targetLevel);
      }
    });

  // -----------------------------------------------------------------------
  // Derived animated values for content opacity
  // -----------------------------------------------------------------------

  const childrenOpacity = useDerivedValue(() =>
    interpolate(
      translateY.value,
      [SNAP_POINTS[0], SNAP_POINTS[1]],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  );

  const expandedOpacity = useDerivedValue(() =>
    interpolate(
      translateY.value,
      [SNAP_POINTS[1], SNAP_POINTS[2]],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  );

  // -----------------------------------------------------------------------
  // Animated styles
  // -----------------------------------------------------------------------

  const containerStyle = useAnimatedStyle(() => {
    const liftOffset = externalLiftY ? externalLiftY.value : 0;
    return {
      transform: [{ translateY: translateY.value - liftOffset }],
    };
  });

  const childrenStyle = useAnimatedStyle(() => ({
    opacity: childrenOpacity.value,
  }));

  const expandedStyle = useAnimatedStyle(() => ({
    opacity: expandedOpacity.value,
  }));

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <Animated.View
      style={[styles.container, containerStyle]}
      pointerEvents="box-none"
    >
      {/* Backdrop: blur on iOS, opaque tint on Android */}
      {Platform.OS === 'ios' ? (
        <BlurView
          intensity={glass.blurIntensity}
          tint={glass.blurTint}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.androidBackdrop]} />
      )}

      {/* Top border accent */}
      <View style={styles.topBorder} />

      {/* Handle — only this area responds to drag */}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={styles.handleZone}>
          <View style={styles.handleBar} />
        </Animated.View>
      </GestureDetector>

      {/* Mode label pill (visible at all levels) */}
      {modeLabel ? (
        <View style={styles.modeLabelRow}>
          <View style={styles.modeLabelPill}>
            <Text style={styles.modeLabelText}>{modeLabel}</Text>
          </View>
        </View>
      ) : null}

      {/* Level 1 content (ingredients) — fades in between level 0→1 */}
      <Animated.View style={[styles.contentSection, childrenStyle]}>
        {children}
      </Animated.View>

      {/* Level 2 content (expanded/checklist) — fades in between level 1→2 */}
      <Animated.View style={[styles.expandedSection, expandedStyle]}>
        {expandedContent}
      </Animated.View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: CONTAINER_HEIGHT,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  androidBackdrop: {
    backgroundColor: colors.glassFallback,
  },
  topBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: colors.glassBorder,
  },
  handleZone: {
    width: '100%',
    height: HANDLE_ZONE_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  handleBar: {
    width: glass.handleWidth,
    height: glass.handleHeight,
    borderRadius: glass.handleRadius,
    backgroundColor: colors.glassHandle,
  },
  modeLabelRow: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    alignItems: 'flex-start',
  },
  modeLabelPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 9999,
  },
  modeLabelText: {
    fontSize: typography.sm,
    fontWeight: typography.semibold,
    color: colors.glassText,
    textTransform: 'capitalize',
  },
  contentSection: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  expandedSection: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
});

export default GlassOverlay;
