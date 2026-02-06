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
 * Dimension reactivity:
 *   All snap points and container height derive from useWindowDimensions()
 *   so portrait ↔ landscape rotation recalculates correctly.
 *
 * Gesture:
 *   The handle pan gesture is exported via `getHandleGesture()` so the
 *   parent (DecisionCard) can compose it with Gesture.Exclusive().
 */

import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  useWindowDimensions,
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
// Constants (non-dimension-dependent)
// ---------------------------------------------------------------------------

const HANDLE_ZONE_HEIGHT = 40;
export const DEFAULT_COLLAPSED_HEIGHT = 72;

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
    const { height: windowHeight } = useWindowDimensions();
    const effectiveCollapsed = collapsedHeight ?? DEFAULT_COLLAPSED_HEIGHT;

    // Compute dimension-dependent values
    const containerHeight = Math.round(windowHeight * 0.92);
    const halfHeight = Math.round(windowHeight * 0.5);

    // Shared values for snap points (worklet-safe, updated on dimension change)
    const snap0 = useSharedValue(containerHeight - effectiveCollapsed);
    const snap1 = useSharedValue(containerHeight - halfHeight);
    const snap2 = useSharedValue(0);
    const containerH = useSharedValue(containerHeight);

    const translateY = useSharedValue(containerHeight - effectiveCollapsed);
    const gestureStartY = useSharedValue(0);
    const isFirstRender = useRef(true);

    // Recompute snap points when dimensions or collapsedHeight change
    useEffect(() => {
      const newContainerH = Math.round(windowHeight * 0.92);
      const newHalfH = Math.round(windowHeight * 0.5);

      containerH.value = newContainerH;
      snap0.value = newContainerH - effectiveCollapsed;
      snap1.value = newContainerH - newHalfH;
      snap2.value = 0;

      // Re-snap to current level immediately (no spring on dimension change)
      const target =
        level === 0 ? snap0.value : level === 1 ? snap1.value : snap2.value;
      translateY.value = target;
    }, [windowHeight, effectiveCollapsed]);

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
    // Handle pan gesture
    // -------------------------------------------------------------------

    const handleGesture = Gesture.Pan()
      .activeOffsetY([-8, 8])
      .failOffsetX([-15, 15])
      .onStart(() => {
        gestureStartY.value = translateY.value;
      })
      .onUpdate((e) => {
        const next = gestureStartY.value + e.translationY;
        translateY.value = Math.max(snap2.value, Math.min(snap0.value, next));
      })
      .onEnd(() => {
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

        if (onLevelChange) {
          runOnJS(onLevelChange)(levels[nearestIdx]);
        }
      });

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
        height: containerH.value,
        transform: [{ translateY: translateY.value - liftOffset }],
      };
    });

    const childrenStyle = useAnimatedStyle(() => ({
      opacity: childrenOpacity.value,
    }));

    const expandedStyle = useAnimatedStyle(() => ({
      opacity: expandedOpacity.value,
    }));

    const androidBackdropStyle = useAnimatedStyle(() => {
      const bg = interpolateColor(
        tintProgress.value,
        [0, 1],
        [colors.glassFallback, colors.glassFallbackDeep],
      );
      return { backgroundColor: bg };
    });

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

        {/* Handle */}
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

        {/* Sticky content */}
        {stickyContent}

        {/* Level 1 content */}
        <Animated.View style={[styles.contentSection, childrenStyle]}>
          {children}
        </Animated.View>

        {/* Level 2 content */}
        <Animated.View style={[styles.expandedSection, expandedStyle]}>
          {expandedContent}
        </Animated.View>
      </Animated.View>
    );
  },
);

// ---------------------------------------------------------------------------
// Styles (height is now dynamic via containerStyle, not static)
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    // height is set dynamically via containerStyle
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

// Re-export stale constants for backward compat (tests, docs). Not used at runtime.
export const LEVEL_HEIGHTS = {
  0: DEFAULT_COLLAPSED_HEIGHT,
  1: 0, // dynamic now
  2: 0, // dynamic now
} as const;

export const SNAP_POINTS: Record<0 | 1 | 2, number> = { 0: 0, 1: 0, 2: 0 };

export default GlassOverlay;
