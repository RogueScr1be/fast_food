/**
 * DRM (Dinner Rescue Mode) Fallback Tests
 * 
 * Verifies contract compliance:
 * - DRM has ABSOLUTE AUTHORITY
 * - DRM NEVER asks permission
 * - DRM selects first valid fallback in hierarchy
 * - DRM ignores taste, inventory, cost optimization
 */

import {
  shouldTriggerOnRejections,
  shouldTriggerOnTime,
  shouldTriggerDrm,
  selectFallback,
  executeDrmOverride,
  getFallbackConfig,
  DEFAULT_FALLBACK_CONFIG,
  getRotationIndex,
  wasRecentlyUsed,
  FALLBACK_ROTATION_WINDOW_HOURS,
  type LastRescueInfo,
} from '../drm/fallback';
import type { FallbackConfig, ArbiterOutput } from '../../../types/decision-os';

// =============================================================================
// TRIGGER TESTS
// =============================================================================

describe('DRM Triggers', () => {
  describe('shouldTriggerOnRejections', () => {
    it('triggers when rejections >= threshold (default 2)', () => {
      expect(shouldTriggerOnRejections(2)).toBe(true);
      expect(shouldTriggerOnRejections(3)).toBe(true);
    });
    
    it('does not trigger when rejections < threshold', () => {
      expect(shouldTriggerOnRejections(0)).toBe(false);
      expect(shouldTriggerOnRejections(1)).toBe(false);
    });
    
    it('respects custom threshold', () => {
      expect(shouldTriggerOnRejections(2, 3)).toBe(false);
      expect(shouldTriggerOnRejections(3, 3)).toBe(true);
    });
  });
  
  describe('shouldTriggerOnTime', () => {
    it('triggers when time >= threshold (default 18:15)', () => {
      expect(shouldTriggerOnTime('18:15')).toBe(true);
      expect(shouldTriggerOnTime('18:30')).toBe(true);
      expect(shouldTriggerOnTime('19:00')).toBe(true);
      expect(shouldTriggerOnTime('21:00')).toBe(true);
    });
    
    it('does not trigger when time < threshold', () => {
      expect(shouldTriggerOnTime('18:00')).toBe(false);
      expect(shouldTriggerOnTime('17:30')).toBe(false);
      expect(shouldTriggerOnTime('12:00')).toBe(false);
    });
    
    it('respects custom threshold', () => {
      expect(shouldTriggerOnTime('19:00', '19:30')).toBe(false);
      expect(shouldTriggerOnTime('19:30', '19:30')).toBe(true);
      expect(shouldTriggerOnTime('20:00', '19:30')).toBe(true);
    });
  });
  
  describe('shouldTriggerDrm (combined)', () => {
    const mockArbiterOutput: ArbiterOutput = {
      decision_id: 'test',
      mode: 'cook',
      meal: 'Test Meal',
      meal_id: 1,
      confidence: 0.8,
      estimated_time: '25 min',
      estimated_cost: '$12',
      execution_payload: { steps: [], ingredients_needed: [], substitutions: [] },
    };
    
    it('triggers on explicit "I\'m done" (highest priority)', () => {
      const result = shouldTriggerDrm(0, '12:00', mockArbiterOutput, true);
      
      expect(result.trigger).toBe(true);
      expect(result.reason).toBe('explicit_done');
    });
    
    it('triggers when no valid Arbiter output', () => {
      const result = shouldTriggerDrm(0, '12:00', null, false);
      
      expect(result.trigger).toBe(true);
      expect(result.reason).toBe('no_valid_meal');
    });
    
    it('triggers on rejection threshold', () => {
      const result = shouldTriggerDrm(2, '12:00', mockArbiterOutput, false);
      
      expect(result.trigger).toBe(true);
      expect(result.reason).toBe('rejection_threshold');
    });
    
    it('triggers on time threshold', () => {
      const result = shouldTriggerDrm(0, '19:00', mockArbiterOutput, false);
      
      expect(result.trigger).toBe(true);
      expect(result.reason).toBe('time_threshold');
    });
    
    it('does not trigger when no conditions met', () => {
      const result = shouldTriggerDrm(1, '12:00', mockArbiterOutput, false);
      
      expect(result.trigger).toBe(false);
      expect(result.reason).toBe('none');
    });
  });
});

// =============================================================================
// FALLBACK SELECTION
// =============================================================================

describe('Fallback Selection', () => {
  describe('selectFallback', () => {
    it('returns first fallback in hierarchy (no optimization)', () => {
      const config: FallbackConfig = {
        hierarchy: [
          { type: 'no_cook', meal_name: 'Cereal', instructions: 'Pour cereal' },
          { type: 'no_cook', meal_name: 'Sandwich', instructions: 'Make sandwich' },
        ],
        drm_time_threshold: '18:15',
        rejection_threshold: 2,
      };
      
      const fallback = selectFallback(config);
      
      expect(fallback).not.toBeNull();
      expect(fallback!.meal_name).toBe('Cereal');
    });
    
    it('returns null if hierarchy is empty', () => {
      const config: FallbackConfig = {
        hierarchy: [],
        drm_time_threshold: '18:15',
        rejection_threshold: 2,
      };
      
      const fallback = selectFallback(config);
      
      expect(fallback).toBeNull();
    });
    
    it('ignores taste preferences (first is always selected)', () => {
      // Even if "Sandwich" might be preferred by taste, DRM ignores this
      const config: FallbackConfig = {
        hierarchy: [
          { type: 'no_cook', meal_name: 'Plain Crackers', instructions: 'Open box' },
          { type: 'no_cook', meal_name: 'Delicious Sandwich', instructions: 'Make sandwich' },
        ],
        drm_time_threshold: '18:15',
        rejection_threshold: 2,
      };
      
      const fallback = selectFallback(config);
      
      // DRM doesn't optimize - first is selected regardless
      expect(fallback!.meal_name).toBe('Plain Crackers');
    });
  });
  
  describe('getFallbackConfig', () => {
    it('returns default config when household config is null', () => {
      const config = getFallbackConfig(null);
      
      expect(config).toEqual(DEFAULT_FALLBACK_CONFIG);
    });
    
    it('returns default config when hierarchy is empty', () => {
      const config = getFallbackConfig({
        hierarchy: [],
        drm_time_threshold: '19:00',
        rejection_threshold: 3,
      });
      
      expect(config.hierarchy).toEqual(DEFAULT_FALLBACK_CONFIG.hierarchy);
    });
    
    it('uses household config when valid', () => {
      const customConfig: FallbackConfig = {
        hierarchy: [
          { type: 'pickup', meal_name: 'Pizza', instructions: 'Call pizzeria' },
        ],
        drm_time_threshold: '17:00',
        rejection_threshold: 1,
      };
      
      const config = getFallbackConfig(customConfig);
      
      expect(config.hierarchy[0].meal_name).toBe('Pizza');
      expect(config.drm_time_threshold).toBe('17:00');
      expect(config.rejection_threshold).toBe(1);
    });
  });
});

// =============================================================================
// DRM EXECUTION
// =============================================================================

describe('executeDrmOverride', () => {
  const config: FallbackConfig = {
    hierarchy: [
      { type: 'no_cook', meal_id: 11, meal_name: 'Cereal', instructions: 'Pour cereal into bowl' },
      { type: 'no_cook', meal_id: 12, meal_name: 'Sandwich', instructions: 'Make a sandwich' },
    ],
    drm_time_threshold: '18:15',
    rejection_threshold: 2,
  };
  
  it('returns DrmOutput with is_rescue: true', () => {
    const result = executeDrmOverride('test-session', config, 'rejection_threshold');
    
    expect(result).not.toBeNull();
    expect(result!.is_rescue).toBe(true);
  });
  
  it('selects first fallback (no optimization)', () => {
    const result = executeDrmOverride('test-session', config, 'rejection_threshold');
    
    expect(result!.meal).toBe('Cereal');
    expect(result!.fallback_type).toBe('no_cook');
  });
  
  it('has mandatory execution payload', () => {
    const result = executeDrmOverride('test-session', config, 'rejection_threshold');
    
    expect(result!.execution_payload).toBeDefined();
    expect(result!.execution_payload.steps).toBeDefined();
    expect(result!.execution_payload.steps.length).toBeGreaterThan(0);
    expect(result!.execution_payload.steps[0]).toBe('Pour cereal into bowl');
  });
  
  it('confidence is always 1.0 (DRM is always confident)', () => {
    const result = executeDrmOverride('test-session', config, 'rejection_threshold');
    
    expect(result!.confidence).toBe(1.0);
  });
  
  it('generates unique decision_id with drm- prefix', () => {
    const result = executeDrmOverride('test-session-123', config, 'rejection_threshold');
    
    expect(result!.decision_id).toMatch(/^drm-/);
  });
  
  it('returns null if no fallbacks configured (catastrophic failure)', () => {
    const emptyConfig: FallbackConfig = {
      hierarchy: [],
      drm_time_threshold: '18:15',
      rejection_threshold: 2,
    };
    
    const result = executeDrmOverride('test-session', emptyConfig, 'rejection_threshold');
    
    expect(result).toBeNull();
  });
  
  it('output shape matches DrmOutput contract', () => {
    const result = executeDrmOverride('test-session', config, 'rejection_threshold');
    
    expect(result).not.toBeNull();
    
    // Verify all required fields per contract
    expect(typeof result!.decision_id).toBe('string');
    expect(['cook', 'pickup', 'delivery', 'no_cook']).toContain(result!.mode);
    expect(typeof result!.meal).toBe('string');
    expect(typeof result!.meal_id).toBe('number');
    expect(typeof result!.confidence).toBe('number');
    expect(typeof result!.estimated_time).toBe('string');
    expect(typeof result!.estimated_cost).toBe('string');
    expect(result!.execution_payload).toBeDefined();
    expect(result!.is_rescue).toBe(true);
    expect(['pickup', 'delivery', 'no_cook']).toContain(result!.fallback_type);
  });
});

// =============================================================================
// DEFAULT FALLBACK CONFIG
// =============================================================================

describe('DEFAULT_FALLBACK_CONFIG', () => {
  it('has 3 fallback options', () => {
    expect(DEFAULT_FALLBACK_CONFIG.hierarchy.length).toBe(3);
  });
  
  it('all fallbacks are no_cook (zero-cook options)', () => {
    for (const fallback of DEFAULT_FALLBACK_CONFIG.hierarchy) {
      expect(fallback.type).toBe('no_cook');
    }
  });
  
  it('default time threshold is 18:15', () => {
    expect(DEFAULT_FALLBACK_CONFIG.drm_time_threshold).toBe('18:15');
  });
  
  it('default rejection threshold is 2', () => {
    expect(DEFAULT_FALLBACK_CONFIG.rejection_threshold).toBe(2);
  });
});

// =============================================================================
// FALLBACK ROTATION TESTS (Phase 7 - Anti-loop for "cereal fatigue")
// =============================================================================

describe('Fallback Rotation', () => {
  const config = DEFAULT_FALLBACK_CONFIG;
  
  describe('wasRecentlyUsed', () => {
    it('returns false when no last rescue', () => {
      expect(wasRecentlyUsed('no_cook', 11, null)).toBe(false);
    });
    
    it('returns false for different fallback type', () => {
      const lastRescue: LastRescueInfo = {
        fallback_type: 'delivery',
        meal_id: 100,
        timestamp: new Date().toISOString(),
      };
      expect(wasRecentlyUsed('no_cook', 11, lastRescue)).toBe(false);
    });
    
    it('returns true for same type within window', () => {
      const lastRescue: LastRescueInfo = {
        fallback_type: 'no_cook',
        meal_id: 11,
        timestamp: new Date().toISOString(),
      };
      expect(wasRecentlyUsed('no_cook', 11, lastRescue)).toBe(true);
    });
    
    it('returns false when outside rotation window', () => {
      const oldTimestamp = new Date(
        Date.now() - (FALLBACK_ROTATION_WINDOW_HOURS + 1) * 60 * 60 * 1000
      ).toISOString();
      const lastRescue: LastRescueInfo = {
        fallback_type: 'no_cook',
        meal_id: 11,
        timestamp: oldTimestamp,
      };
      expect(wasRecentlyUsed('no_cook', 11, lastRescue)).toBe(false);
    });
  });
  
  describe('getRotationIndex', () => {
    it('returns 0 when no last rescue', () => {
      expect(getRotationIndex(config, null)).toBe(0);
    });
    
    it('returns 0 when last rescue outside window', () => {
      const oldTimestamp = new Date(
        Date.now() - (FALLBACK_ROTATION_WINDOW_HOURS + 1) * 60 * 60 * 1000
      ).toISOString();
      const lastRescue: LastRescueInfo = {
        fallback_type: 'no_cook',
        meal_id: 11, // Cereal (index 0)
        timestamp: oldTimestamp,
      };
      expect(getRotationIndex(config, lastRescue)).toBe(0);
    });
    
    it('rotates to next fallback when same was used recently', () => {
      const recentTimestamp = new Date().toISOString();
      const lastRescue: LastRescueInfo = {
        fallback_type: 'no_cook',
        meal_id: 11, // Cereal (index 0)
        timestamp: recentTimestamp,
      };
      expect(getRotationIndex(config, lastRescue)).toBe(1); // PB&J
    });
    
    it('rotates circularly (last to first)', () => {
      const recentTimestamp = new Date().toISOString();
      const lastRescue: LastRescueInfo = {
        fallback_type: 'no_cook',
        meal_id: 13, // Cheese and Crackers (index 2)
        timestamp: recentTimestamp,
      };
      expect(getRotationIndex(config, lastRescue)).toBe(0); // Back to Cereal
    });
  });
  
  describe('selectFallback with rotation', () => {
    it('selects first fallback without last rescue', () => {
      const fallback = selectFallback(config, null);
      expect(fallback?.meal_id).toBe(11); // Cereal
    });
    
    it('selects rotated fallback when last rescue is recent', () => {
      const lastRescue: LastRescueInfo = {
        fallback_type: 'no_cook',
        meal_id: 11,
        timestamp: new Date().toISOString(),
      };
      const fallback = selectFallback(config, lastRescue);
      expect(fallback?.meal_id).toBe(12); // PB&J
    });
    
    it('cycles through all three fallbacks', () => {
      // First rescue: Cereal
      const firstRescue: LastRescueInfo = {
        fallback_type: 'no_cook',
        meal_id: 11,
        timestamp: new Date().toISOString(),
      };
      
      // Second rescue: PB&J (because Cereal was just used)
      const secondFallback = selectFallback(config, firstRescue);
      expect(secondFallback?.meal_id).toBe(12);
      
      // Third rescue: Cheese and Crackers (because PB&J was just used)
      const secondRescue: LastRescueInfo = {
        fallback_type: 'no_cook',
        meal_id: 12,
        timestamp: new Date().toISOString(),
      };
      const thirdFallback = selectFallback(config, secondRescue);
      expect(thirdFallback?.meal_id).toBe(13);
      
      // Fourth rescue: Back to Cereal (circular)
      const thirdRescue: LastRescueInfo = {
        fallback_type: 'no_cook',
        meal_id: 13,
        timestamp: new Date().toISOString(),
      };
      const fourthFallback = selectFallback(config, thirdRescue);
      expect(fourthFallback?.meal_id).toBe(11);
    });
  });
  
  describe('executeDrmOverride with rotation', () => {
    it('respects rotation when lastRescue provided', () => {
      const lastRescue: LastRescueInfo = {
        fallback_type: 'no_cook',
        meal_id: 11,
        timestamp: new Date().toISOString(),
      };
      
      const decision = executeDrmOverride('test-session', config, 'explicit_done', lastRescue);
      
      expect(decision).not.toBeNull();
      expect(decision?.meal_id).toBe(12); // PB&J (rotated from Cereal)
      expect(decision?.meal).toBe('PB&J Sandwich');
    });
    
    it('uses first fallback when no lastRescue', () => {
      const decision = executeDrmOverride('test-session', config, 'explicit_done', null);
      
      expect(decision).not.toBeNull();
      expect(decision?.meal_id).toBe(11); // Cereal (first)
      expect(decision?.meal).toBe('Cereal with Milk');
    });
  });
});
