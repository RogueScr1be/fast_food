/**
 * Hero Transition State — Module-level singleton for passing
 * transition data between Deal → Checklist/Rescue screens.
 *
 * Not React state. Not persisted. Just a plain object that Deal
 * writes before pushing, and Checklist reads on mount.
 *
 * The clone overlay lives in the DESTINATION screen (checklist),
 * not in Deal, because the checklist renders on top of the stack.
 */

import type { ImageSourcePropType } from 'react-native';

export interface TransitionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PendingHeroTransition {
  sourceRect: TransitionRect;
  imageSource: ImageSourcePropType;
  timestamp: number;
}

/** Module-level pending transition. Written by Deal, read by Checklist. */
let pending: PendingHeroTransition | null = null;

/** Set pending transition data. Call from Deal before router.push. */
export function setPendingHeroTransition(data: PendingHeroTransition): void {
  pending = data;
}

/**
 * Consume pending transition data. Returns it once, then clears.
 * Returns null if no pending transition or if data is stale (>2s old).
 */
export function consumePendingHeroTransition(): PendingHeroTransition | null {
  if (!pending) return null;
  // Stale check: if more than 2 seconds old, discard
  if (Date.now() - pending.timestamp > 2000) {
    pending = null;
    return null;
  }
  const data = pending;
  pending = null;
  return data;
}

/** Clear without consuming (e.g. on Deal unmount cleanup). */
export function clearPendingHeroTransition(): void {
  pending = null;
}
