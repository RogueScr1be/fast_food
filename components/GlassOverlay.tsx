/**
 * GlassOverlay — Three-Level Expansion Overlay
 *
 * Level 0 — Collapsed: handle + mode label + stickyContent (light tint)
 * Level 1 — Half:      + children (~50 %) (deeper tint for legibility)
 * Level 2 — Full:      + expandedContent (~92 %) (deep tint)
 *
 * Drag feel:
 *   During drag → direct-follow (clamp, no spring).
 *   On end      → snap to nearest level with withSpring.
 *   React state (onLevelChange) only fires on end, never during drag.
 *
 * Platform:
 *   iOS    — BlurView (expo-blur), fixed intensity
 *   Android — interpolated opaque tint (light → deep by level)
 *
 * Gesture:
 *   The handle pan gesture is exported via `getHandleGesture()` so the
 *   parent (DecisionCard) can compose it with the swipe gesture using
 *   Gesture.Exclusive().
 */

import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
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
  interpolateColor,
  Extrapolation,
  runOnJS,
  SharedValue,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { PanGesture } from 'react-native-gesture-handler';
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

const HANDLE_ZONE_HEIGHT = 40;

export const DEFAULT_COLLAPSED_HEIGHT = 72;

export const LEVEL_HEIGHTS = {
  0: DEFAULT_COLLAPSED_HEIGHT,
  1: Math.round(SCREEN_HEIGHT * 0.5),
  2: Math.round(SCREEN_HEIGHT * 0.92),
} as const;

const CONTAINER_HEIGHT = LEVEL_HEIGHTS[2];

export const SNAP_POINTS: Record<0 | 1 | 2, number> = {
  0: CONTAINER_HEIGHT - LEVEL_HEIGHTS[0],
  1: CONTAINER_HEIGHT - LEVEL_HEIGHTS[1],
  2: 0,
};

const SPRING_CONFIG = {
  damping: glass.springDamping,
  stiffness: glass.springStiffness,
  mass: glass.springMass,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OverlayLevel = 0 | 1 | 2;

export interface GlassOverlayRef {
  /** Get the handle pan gesture for Gesture.Exclusive composition */
  getHandleGesture: () => PanGesture;
}

export interface GlassOverlayProps {
  level: OverlayLevel;
  onLevelChange?: (level: OverlayLevel) => void;
  modeLabel?: string;
  stickyContent?: React.ReactNode;
  children?: React.ReactNode;
  expandedContent?: React.ReactNode;
  externalLiftY?: SharedValue<number>;
  collapsedHeight?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const GlassOverlay = forwardRef<GlassOverlayRef, GlassOverlayProps>(
  function GlassOverlay(
    {
      level,
      onLevelChange,
      modeLabel,
      stickyContent,
      children,
      expandedContent,
      externalLiftY,
      collapsedHeight,
    },
    ref,
  ) {
    const effectiveCollapsed = collapsedHeight ?? DEFAULT_COLLAPSED_HEIGHT;

    // Shared values for snap points (worklet-safe)
    const snap0 = useSharedValue(CONTAINER_HEIGHT - effectiveCollapsed);
    const snap1 = useSharedValue(SNAP_POINTS[1]);
    const snap2 = useSharedValue(0);

    const translateY = useSharedValue(CONTAINER_HEIGHT - effectiveCollapsed);
    const gestureStartY = useSharedValue(0);
    const isFirstRender = useRef(true);

    useEffect(() => {
      snap0.value = CONTAINER_HEIGHT - (collapsedHeight ?? DEFAULT_COLLAPSED_HEIGHT);
    }, [collapsedHeight]);

    // Animate to level on prop change
    useEffect(() => {
      const target =
        level === 0 ? snap0.value : level === 1 ? snap1.value : snap2.value;

      if (isFirstRender.current) {
        isFirstRender.current = false;
        translateY.value = target;
        return;
      }
      translateY.value = withSpring(target, SPRING_CONFIG);
    }, [level]);

    // -------------------------------------------------------------------
    // Handle pan gesture — direct-follow during drag, spring on end
    // -------------------------------------------------------------------

    const handleGesture = Gesture.Pan()
      .activeOffsetY([-8, 8])
      .failOffsetX([-15, 15])
      .onStart(() => {
        gestureStartY.value = translateY.value;
      })
      .onUpdate((e) => {
        // Direct-follow: clamp, no spring
        const next = gestureStartY.value + e.translationY;
        translateY.value = Math.max(snap2.value, Math.min(snap0.value, next));
      })
      .onEnd(() => {
        // Snap to nearest level with spring
        const cur = translateY.value;
        const points = [snap2.value, snap1.value, snap0.value];
        const levels: readonly (0 | 1 | 2)[] = [2, 1, 0];

        let nearestIdx = 0;
        let minDist = Math.abs(cur - points[0]);
        for (let i = 1; i < points.length; i++) {
          const dist = Math.abs(cur - points[i]);
          if (dist < minDist) {
            minDist = dist;
            nearestIdx = i;
          }
        }

        translateY.value = withSpring(points[nearestIdx], SPRING_CONFIG);

        // Fire level change only on end
        if (onLevelChange) {
          runOnJS(onLevelChange)(levels[nearestIdx]);
        }
      });

    // Expose gesture for parent composition
    useImperativeHandle(ref, () => ({
      getHandleGesture: () => handleGesture,
    }));

    // -------------------------------------------------------------------
    // Derived values
    // -------------------------------------------------------------------

    const childrenOpacity = useDerivedValue(() =>
      interpolate(
        translateY.value,
        [snap0.value, snap1.value],
        [0, 1],
        Extrapolation.CLAMP,
      ),
    );

    const expandedOpacity = useDerivedValue(() =>
      interpolate(
        translateY.value,
        [snap1.value, snap2.value],
        [0, 1],
        Extrapolation.CLAMP,
      ),
    );

    // Tint progress: 0 = collapsed (light), 1 = fully expanded (deep)
    const tintProgress = useDerivedValue(() =>
      interpolate(
        translateY.value,
        [snap0.value, snap1.value],
        [0, 1],
        Extrapolation.CLAMP,
      ),
    );

    // -------------------------------------------------------------------
    // Animated styles
    // -------------------------------------------------------------------

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

    // Android tint interpolation: light at L0 → deep at L1+
    const androidBackdropStyle = useAnimatedStyle(() => {
      const bg = interpolateColor(
        tintProgress.value,
        [0, 1],
        [colors.glassFallback, colors.glassFallbackDeep],
      );
      return { backgroundColor: bg };
    });

    // iOS overlay tint (behind blur)
    const iosOverlayStyle = useAnimatedStyle(() => {
      const bg = interpolateColor(
        tintProgress.value,
        [0, 1],
        [colors.glass, colors.glassDeep],
      );
      return { backgroundColor: bg };
    });

    // -------------------------------------------------------------------
    // Render
    // -------------------------------------------------------------------

    return (
      <Animated.View
        style={[styles.container, containerStyle]}
        pointerEvents="box-none"
      >
        {/* Backdrop */}
        {Platform.OS === 'ios' ? (
          <>
            <BlurView
              intensity={glass.blurIntensity}
              tint={glass.blurTint}
              style={StyleSheet.absoluteFill}
            />
            {/* Tint layer on top of blur — deepens with expansion */}
            <Animated.View
              style={[StyleSheet.absoluteFill, iosOverlayStyle]}
              pointerEvents="none"
            />
          </>
        ) : (
          <Animated.View
            style={[StyleSheet.absoluteFill, androidBackdropStyle]}
          />
        )}

        {/* Top border */}
        <View style={styles.topBorder} />

        {/* Handle — drag target */}
        <GestureDetector gesture={handleGesture}>
          <Animated.View style={styles.handleZone}>
            <View style={styles.handleBar} />
          </Animated.View>
        </GestureDetector>

        {/* Mode label pill */}
        {modeLabel ? (
          <View style={styles.modeLabelRow}>
            <View style={styles.modeLabelPill}>
              <Text style={styles.modeLabelText}>{modeLabel}</Text>
            </View>
          </View>
        ) : null}

        {/* Sticky content (always visible) */}
        {stickyContent}

        {/* Level 1 content — fades in L0→L1 */}
        <Animated.View style={[styles.contentSection, childrenStyle]}>
          {children}
        </Animated.View>

        {/* Level 2 content — fades in L1→L2 */}
        <Animated.View style={[styles.expandedSection, expandedStyle]}>
          {expandedContent}
        </Animated.View>
      </Animated.View>
    );
  },
);

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
