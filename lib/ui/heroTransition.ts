/**
 * Hero Transition State — Module-level singleton for passing
 * transition data between Deal → Checklist/Rescue screens.
 *
 * Hardened with:
 *   - nonce: unique per set call (prevents stale consumption)
 *   - destKey: route+id match guard (prevents wrong screen consuming)
 *   - expiry: 2000ms (auto-clears if unclaimed)
 *   - single-consume: first successful consume clears pending
 */

import type { ImageSourcePropType } from 'react-native';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  nonce: number;
  destKey: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXPIRY_MS = 2000;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let pending: PendingHeroTransition | null = null;
let expiryTimer: ReturnType<typeof setTimeout> | null = null;
let nonceCounter = 0;

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/**
 * Set pending transition data. Call from Deal before router.push.
 *
 * Overwrite policy: last write wins. If called while a pending
 * transition exists, the old one is discarded (expiry timer cleared,
 * new nonce assigned). Only the latest set can be consumed.
 *
 * @param destKey — e.g. `checklist:fancy-1` or `rescue:drm-3`
 */
export function setPendingHeroTransition(data: {
  sourceRect: TransitionRect;
  imageSource: ImageSourcePropType;
  destKey: string;
}): void {
  // Clear any existing expiry timer
  if (expiryTimer) clearTimeout(expiryTimer);

  nonceCounter += 1;
  pending = {
    ...data,
    timestamp: Date.now(),
    nonce: nonceCounter,
  };

  // Auto-expire after EXPIRY_MS
  expiryTimer = setTimeout(() => {
    pending = null;
    expiryTimer = null;
  }, EXPIRY_MS);
}

/**
 * Consume pending transition data.
 * Only returns payload if destKey matches AND not expired.
 * Returns null on mismatch (does NOT clear pending on mismatch).
 * Clears pending on successful consume.
 */
export function consumePendingHeroTransition(
  destKey: string,
): PendingHeroTransition | null {
  if (!pending) return null;

  // Expiry check
  if (Date.now() - pending.timestamp > EXPIRY_MS) {
    pending = null;
    if (expiryTimer) { clearTimeout(expiryTimer); expiryTimer = null; }
    return null;
  }

  // destKey mismatch: do NOT consume (another screen may need it)
  if (pending.destKey !== destKey) return null;

  // Match: consume and clear
  const data = pending;
  pending = null;
  if (expiryTimer) { clearTimeout(expiryTimer); expiryTimer = null; }
  return data;
}

/** Clear without consuming (e.g. on Deal unmount cleanup). */
export function clearPendingHeroTransition(): void {
  pending = null;
  if (expiryTimer) { clearTimeout(expiryTimer); expiryTimer = null; }
}

// ---------------------------------------------------------------------------
// Test utilities
// ---------------------------------------------------------------------------

/** Reset all state for testing. DO NOT use in production. */
export function __resetForTest(): void {
  pending = null;
  if (expiryTimer) { clearTimeout(expiryTimer); expiryTimer = null; }
  nonceCounter = 0;
}
