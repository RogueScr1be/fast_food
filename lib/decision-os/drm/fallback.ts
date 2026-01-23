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
  | 'none';

// =============================================================================
// FALLBACK SELECTION
// =============================================================================

/**
 * Select first valid fallback from hierarchy.
 * DRM ignores taste, inventory, cost optimization.
 * First valid = first in array that exists.
 */
export function selectFallback(config: FallbackConfig): FallbackOption | null {
  if (!config.hierarchy || config.hierarchy.length === 0) {
    return null;
  }
  
  // Return first fallback (DRM doesn't optimize, just selects)
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
 * 2. Selects first valid fallback
 * 3. Returns DRM output immediately
 * 
 * DRM NEVER asks permission.
 */
export function executeDrmOverride(
  sessionId: string,
  config: FallbackConfig,
  reason: DrmTriggerReason
): DrmOutput | null {
  // Select first fallback (no optimization)
  const fallback = selectFallback(config);
  
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
  drm_time_threshold: '18:15',
  rejection_threshold: 2,
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
    drm_time_threshold: householdConfig.drm_time_threshold ?? '18:15',
    rejection_threshold: householdConfig.rejection_threshold ?? 2,
  };
}
