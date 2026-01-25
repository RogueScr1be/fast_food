/**
 * DRM (Dinner Rescue Mode) — OVERRIDE CONTRACT
 * 
 * DRM has ABSOLUTE AUTHORITY.
 * 
 * DRM TRIGGERS:
 * - 2 consecutive rejections
 * - Time > 6:15pm (configurable)
 * - Explicit "I'm done"
 * - No valid Arbiter output
 * 
 * DRM BEHAVIOR:
 * - Ignore taste, inventory, cost optimization
 * - Select first valid fallback in hierarchy
 * - Emit execution immediately
 * - Log session outcome = 'rescued'
 * 
 * DRM NEVER asks permission.
 */

import type {
  FallbackConfig,
  FallbackOption,
  ArbiterOutput,
  DrmOutput,
  ExecutionPayload,
} from '../../../types/decision-os';

// =============================================================================
// CENTRALIZED CONSTANTS (single source of truth)
// =============================================================================

/**
 * Default time threshold for DRM activation (24h format HH:MM)
 * After this time, DRM triggers automatically.
 */
export const DEFAULT_DRM_TIME_THRESHOLD = '18:15';

/**
 * Default rejection count threshold for DRM activation
 * After this many rejections, DRM triggers automatically.
 */
export const DEFAULT_DRM_REJECTION_THRESHOLD = 2;

/**
 * Fallback rotation window in hours.
 * If the same fallback type was used within this window, rotate to next.
 */
export const FALLBACK_ROTATION_WINDOW_HOURS = 72;

// =============================================================================
// TIME UTILITIES
// =============================================================================

/**
 * Get current server time in HH:MM format.
 * Server-side evaluation only - never trust client time.
 */
export function getServerTimeHHMM(): string {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

// =============================================================================
// DRM TRIGGER CHECKS
// =============================================================================

/**
 * Check if DRM should trigger based on rejection count
 */
export function shouldTriggerOnRejections(
  rejectionCount: number,
  threshold: number = 2
): boolean {
  return rejectionCount >= threshold;
}

/**
 * Check if DRM should trigger based on time
 * @param currentTime - Current time in HH:MM format
 * @param threshold - Threshold time in HH:MM format (default "18:15")
 */
export function shouldTriggerOnTime(
  currentTime: string,
  threshold: string = '18:15'
): boolean {
  const [currentHour, currentMin] = currentTime.split(':').map(Number);
  const [thresholdHour, thresholdMin] = threshold.split(':').map(Number);
  
  const currentMinutes = currentHour * 60 + currentMin;
  const thresholdMinutes = thresholdHour * 60 + thresholdMin;
  
  return currentMinutes >= thresholdMinutes;
}

/**
 * Check if DRM should trigger for any reason
 */
export function shouldTriggerDrm(
  rejectionCount: number,
  currentTime: string,
  arbiterOutput: ArbiterOutput | null,
  explicitDone: boolean = false,
  config?: FallbackConfig
): { trigger: boolean; reason: DrmTriggerReason } {
  const rejectionThreshold = config?.rejection_threshold ?? 2;
  const timeThreshold = config?.drm_time_threshold ?? '18:15';
  
  // Priority 1: Explicit "I'm done"
  if (explicitDone) {
    return { trigger: true, reason: 'explicit_done' };
  }
  
  // Priority 2: No valid Arbiter output
  if (arbiterOutput === null) {
    return { trigger: true, reason: 'no_valid_meal' };
  }
  
  // Priority 3: Rejection threshold
  if (shouldTriggerOnRejections(rejectionCount, rejectionThreshold)) {
    return { trigger: true, reason: 'rejection_threshold' };
  }
  
  // Priority 4: Time threshold
  if (shouldTriggerOnTime(currentTime, timeThreshold)) {
    return { trigger: true, reason: 'time_threshold' };
  }
  
  return { trigger: false, reason: 'none' };
}

export type DrmTriggerReason = 
  | 'rejection_threshold' 
  | 'time_threshold' 
  | 'explicit_done' 
  | 'no_valid_meal'
  | 'not_time_yet'
  | 'none';

// =============================================================================
// FALLBACK ROTATION (anti-loop for "cereal fatigue")
// =============================================================================

/**
 * Last rescue information for rotation logic
 */
export interface LastRescueInfo {
  fallback_type: string;
  meal_id?: number;
  timestamp: string; // ISO timestamp
}

/**
 * Check if a fallback type was recently used (within rotation window)
 */
export function wasRecentlyUsed(
  fallbackType: string,
  mealId: number | undefined,
  lastRescue: LastRescueInfo | null,
  rotationWindowHours: number = FALLBACK_ROTATION_WINDOW_HOURS
): boolean {
  if (!lastRescue) {
    return false;
  }
  
  // Check if same type/meal
  const sameType = lastRescue.fallback_type === fallbackType;
  const sameMeal = mealId !== undefined && lastRescue.meal_id === mealId;
  
  if (!sameType && !sameMeal) {
    return false;
  }
  
  // Check if within rotation window
  const lastTime = new Date(lastRescue.timestamp).getTime();
  const now = Date.now();
  const windowMs = rotationWindowHours * 60 * 60 * 1000;
  
  return (now - lastTime) < windowMs;
}

/**
 * Get rotation index based on last rescue.
 * Returns 0 if no rotation needed, 1 for next fallback, etc.
 */
export function getRotationIndex(
  config: FallbackConfig,
  lastRescue: LastRescueInfo | null
): number {
  if (!lastRescue || !config.hierarchy || config.hierarchy.length <= 1) {
    return 0;
  }
  
  // Find the index of the last used fallback
  const lastIndex = config.hierarchy.findIndex(
    fb => fb.type === lastRescue.fallback_type && 
         (lastRescue.meal_id === undefined || fb.meal_id === lastRescue.meal_id)
  );
  
  if (lastIndex === -1) {
    return 0;
  }
  
  // Check if within rotation window
  const lastTime = new Date(lastRescue.timestamp).getTime();
  const now = Date.now();
  const windowMs = FALLBACK_ROTATION_WINDOW_HOURS * 60 * 60 * 1000;
  
  if ((now - lastTime) >= windowMs) {
    return 0; // Window expired, start from first
  }
  
  // Rotate to next (circular)
  return (lastIndex + 1) % config.hierarchy.length;
}

// =============================================================================
// FALLBACK SELECTION
// =============================================================================

/**
 * Select fallback from hierarchy with rotation logic.
 * 
 * If same fallback type was used within 72 hours, rotate to next.
 * DRM ignores taste, inventory, cost optimization.
 * 
 * @param config - Fallback configuration
 * @param lastRescue - Info about last rescue (for rotation)
 * @returns Selected fallback or null if none configured
 */
export function selectFallback(
  config: FallbackConfig,
  lastRescue?: LastRescueInfo | null
): FallbackOption | null {
  if (!config.hierarchy || config.hierarchy.length === 0) {
    return null;
  }
  
  // Get rotation index based on last rescue
  const rotationIndex = getRotationIndex(config, lastRescue ?? null);
  
  // Return fallback at rotation index
  return config.hierarchy[rotationIndex];
}

/**
 * Select fallback without rotation (legacy behavior)
 */
export function selectFallbackFirst(config: FallbackConfig): FallbackOption | null {
  if (!config.hierarchy || config.hierarchy.length === 0) {
    return null;
  }
  return config.hierarchy[0];
}

/**
 * Generate deterministic DRM decision ID
 */
function generateDrmDecisionId(sessionId: string): string {
  const timestamp = Date.now().toString(36);
  return `drm-${sessionId.slice(0, 8)}-${timestamp}`;
}

/**
 * Build execution payload for fallback
 */
function buildFallbackExecutionPayload(fallback: FallbackOption): ExecutionPayload {
  return {
    steps: [fallback.instructions],
    ingredients_needed: [],
    substitutions: [],
  };
}

// =============================================================================
// DRM EXECUTION
// =============================================================================

/**
 * Execute DRM override.
 * 
 * This function:
 * 1. Ignores all optimization
 * 2. Selects fallback with rotation (to avoid "cereal fatigue")
 * 3. Returns DRM output immediately
 * 
 * DRM NEVER asks permission.
 * 
 * @param sessionId - Current session ID
 * @param config - Fallback configuration
 * @param reason - Why DRM was triggered
 * @param lastRescue - Info about last rescue (for rotation, optional)
 * @returns DRM output or null if no fallbacks configured
 */
export function executeDrmOverride(
  sessionId: string,
  config: FallbackConfig,
  reason: DrmTriggerReason,
  lastRescue?: LastRescueInfo | null
): DrmOutput | null {
  // Select fallback with rotation (prevents "cereal fatigue")
  const fallback = selectFallback(config, lastRescue);
  
  if (!fallback) {
    // If no fallback configured, return null (catastrophic failure)
    // This should never happen in production - fallbacks are required
    return null;
  }
  
  // Build execution payload
  const executionPayload = buildFallbackExecutionPayload(fallback);
  
  // Build DRM output
  const output: DrmOutput = {
    decision_id: generateDrmDecisionId(sessionId),
    mode: fallback.type === 'no_cook' ? 'no_cook' : fallback.type,
    meal: fallback.meal_name,
    meal_id: fallback.meal_id ?? 0,
    confidence: 1.0, // DRM is always confident (it's a rescue)
    estimated_time: '5 min', // Fallbacks are always fast
    estimated_cost: '$0', // Fallbacks use what's available
    execution_payload: executionPayload,
    is_rescue: true,
    fallback_type: fallback.type,
  };
  
  return output;
}

// =============================================================================
// DEFAULT FALLBACK CONFIG
// =============================================================================

/**
 * Default fallback configuration for households without custom config.
 * Uses hardcoded zero-cook options.
 */
export const DEFAULT_FALLBACK_CONFIG: FallbackConfig = {
  hierarchy: [
    {
      type: 'no_cook',
      meal_id: 11,
      meal_name: 'Cereal with Milk',
      instructions: 'Pour cereal into bowl, add milk',
    },
    {
      type: 'no_cook',
      meal_id: 12,
      meal_name: 'PB&J Sandwich',
      instructions: 'Make a peanut butter and jelly sandwich',
    },
    {
      type: 'no_cook',
      meal_id: 13,
      meal_name: 'Cheese and Crackers',
      instructions: 'Slice cheese, arrange with crackers',
    },
  ],
  drm_time_threshold: DEFAULT_DRM_TIME_THRESHOLD,
  rejection_threshold: DEFAULT_DRM_REJECTION_THRESHOLD,
};

/**
 * Get fallback config for a household, with defaults
 */
export function getFallbackConfig(
  householdConfig?: FallbackConfig | null
): FallbackConfig {
  if (!householdConfig || !householdConfig.hierarchy || householdConfig.hierarchy.length === 0) {
    return DEFAULT_FALLBACK_CONFIG;
  }
  
  return {
    hierarchy: householdConfig.hierarchy,
    drm_time_threshold: householdConfig.drm_time_threshold ?? DEFAULT_DRM_TIME_THRESHOLD,
    rejection_threshold: householdConfig.rejection_threshold ?? DEFAULT_DRM_REJECTION_THRESHOLD,
  };
}
