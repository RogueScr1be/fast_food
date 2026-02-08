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

import React, { useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
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
  cancelAnimation,
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
import { vellum } from '../lib/ui/motion';

// ---------------------------------------------------------------------------
// Constants (non-dimension-dependent)
// ---------------------------------------------------------------------------

const HANDLE_ZONE_HEIGHT = 40;
export const DEFAULT_COLLAPSED_HEIGHT = 72;

/** Snap spring uses Vellum motion profile */
const SPRING_CONFIG = vellum;

/** Hysteresis dead zone around snap points (px). Prevents oscillation. */
const HYSTERESIS_PX = 20;

/** Velocity threshold for direction-gated snap (px/s) */
const VELOCITY_SNAP_THRESHOLD = 500;

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
    // ALL snap caps use containerHeight as basis (not windowHeight)
    const containerHeight = Math.round(windowHeight * 0.92);

    // Shared values for snap points (worklet-safe)
    const snap0 = useSharedValue(containerHeight - effectiveCollapsed);
    const snap1 = useSharedValue(containerHeight - Math.round(containerHeight * 0.5));
    const snap2 = useSharedValue(0);
    const containerH = useSharedValue(containerHeight);

    const translateY = useSharedValue(containerHeight - effectiveCollapsed);
    const gestureStartY = useSharedValue(0);
    const isFirstRender = useRef(true);

    // Content height measurement for Level 1 clamp
    const measuredContentH = useRef(0);
    /** Padding below content when clamped */
    const CONTENT_PADDING = 24;

    /**
     * Compute snap1 (Level 1 stop).
     * capPx = 50% of containerHeight (NOT windowHeight)
     * contentNeeded = collapsedHeight + measured children + padding
     * level1Height = min(capPx, contentNeeded)
     * snap1 = containerHeight - level1Height
     */
    const computeSnap1 = useCallback((cH: number) => {
      const capPx = Math.round(cH * 0.5);
      if (measuredContentH.current > 0) {
        const contentNeeded = effectiveCollapsed + measuredContentH.current + CONTENT_PADDING;
        const level1Height = Math.min(capPx, contentNeeded);
        return cH - level1Height;
      }
      return cH - capPx;
    }, [effectiveCollapsed]);

    // Recompute snap points when dimensions or collapsedHeight change
    useEffect(() => {
      const newContainerH = Math.round(windowHeight * 0.92);

      containerH.value = newContainerH;
      snap0.value = newContainerH - effectiveCollapsed;
      snap1.value = computeSnap1(newContainerH);
      snap2.value = 0;

      const target =
        level === 0 ? snap0.value : level === 1 ? snap1.value : snap2.value;
      translateY.value = target;
    }, [windowHeight, effectiveCollapsed]);

    /** Called when Level 1 content (children) measures its height */
    const handleContentLayout = useCallback((e: { nativeEvent: { layout: { height: number } } }) => {
      const h = e.nativeEvent.layout.height;
      if (Math.abs(h - measuredContentH.current) < 2) return;
      measuredContentH.current = h;

      const cH = Math.round(windowHeight * 0.92);
      const newSnap1 = computeSnap1(cH);

      if (Math.abs(snap1.value - newSnap1) > 4) {
        snap1.value = newSnap1;
        if (level === 1) {
          translateY.value = withSpring(newSnap1, SPRING_CONFIG);
        }
      }
    }, [windowHeight, level, computeSnap1]);

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

    // Current level snap point (for hysteresis comparison)
    const currentLevelSnap = useSharedValue(snap0.value);

    const handleGesture = Gesture.Pan()
      .activeOffsetY([-12, 12])
      .failOffsetX([-15, 15])
      .onStart(() => {
        cancelAnimation(translateY);
        gestureStartY.value = translateY.value;
        // Record which snap we started at
        currentLevelSnap.value =
          level === 0 ? snap0.value : level === 1 ? snap1.value : snap2.value;
      })
      .onUpdate((e) => {
        const next = gestureStartY.value + e.translationY;
        translateY.value = Math.max(snap2.value, Math.min(snap0.value, next));
      })
      .onEnd((e) => {
        const cur = translateY.value;
        const vy = e.velocityY;

        // Level 2 deep-pull gate: must drag past snap1 by 80+ px
        // AND velocity > 900px/s upward. Otherwise snap to Level 0 or 1.
        const DEEP_PULL_EXTRA = 80;
        const DEEP_PULL_VELOCITY = 900;
        const pastSnap1 = snap1.value - cur; // positive = past snap1 toward L2

        let targetLevel: 0 | 1 | 2;

        // Deep pull to Level 2: very deliberate gesture required
        if (pastSnap1 > DEEP_PULL_EXTRA && vy < -DEEP_PULL_VELOCITY) {
          targetLevel = 2;
        }
        // Velocity gate: flick up → Level 1, flick down → Level 0
        else if (Math.abs(vy) > VELOCITY_SNAP_THRESHOLD) {
          if (vy < 0) {
            // Flick up → Level 1 (NOT Level 2)
            targetLevel = cur < snap0.value ? 1 : 0;
          } else {
            // Flick down → Level 0
            targetLevel = 0;
          }
        }
        // Hysteresis: if close to starting snap, stay
        else if (Math.abs(cur - currentLevelSnap.value) < HYSTERESIS_PX) {
          // Find which level the starting snap corresponds to
          if (Math.abs(currentLevelSnap.value - snap0.value) < 5) targetLevel = 0;
          else if (Math.abs(currentLevelSnap.value - snap1.value) < 5) targetLevel = 1;
          else targetLevel = 2;
        }
        // Default: nearest of Level 0 or Level 1 only
        else {
          const dist0 = Math.abs(cur - snap0.value);
          const dist1 = Math.abs(cur - snap1.value);
          targetLevel = dist1 < dist0 ? 1 : 0;
        }

        const targetY =
          targetLevel === 0 ? snap0.value :
          targetLevel === 1 ? snap1.value :
          snap2.value;

        translateY.value = withSpring(targetY, SPRING_CONFIG);

        if (onLevelChange) {
          runOnJS(onLevelChange)(targetLevel);
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

        {/* Level 1 content (measured for height clamp) */}
        <Animated.View style={[styles.contentSection, childrenStyle]}>
          <View onLayout={handleContentLayout}>
            {children}
          </View>
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
