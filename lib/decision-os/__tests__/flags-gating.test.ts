/**
 * Feature Flags Gating Tests
 * 
 * Tests kill switch behavior with fail-closed semantics:
 * - Production defaults when env vars missing
 * - Autopilot disabled prevents autopilot copy insertion
 * - DRM disabled returns { drmActivated: false }
 * - OCR disabled returns canonical failed response
 */

import { 
  getFlags, 
  isDecisionOsEnabled, 
  isAutopilotEnabled, 
  isOcrEnabled, 
  isDrmEnabled,
  type DecisionOsFlags,
} from '../config/flags';

describe('Feature Flags', () => {
  // Store original env vars
  const originalEnv = { ...process.env };
  
  beforeEach(() => {
    // Reset env vars before each test
    delete process.env.DECISION_OS_ENABLED;
    delete process.env.DECISION_AUTOPILOT_ENABLED;
    delete process.env.DECISION_OCR_ENABLED;
    delete process.env.DECISION_DRM_ENABLED;
  });
  
  afterEach(() => {
    // Restore original env vars
    process.env = { ...originalEnv };
  });
  
  describe('Production Defaults (fail-closed)', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });
    
    afterEach(() => {
      process.env.NODE_ENV = originalEnv.NODE_ENV;
    });
    
    it('all flags default to FALSE when env vars missing in production', () => {
      const flags = getFlags();
      
      expect(flags.decisionOsEnabled).toBe(false);
      expect(flags.autopilotEnabled).toBe(false);
      expect(flags.ocrEnabled).toBe(false);
      expect(flags.drmEnabled).toBe(false);
    });
    
    it('isDecisionOsEnabled returns false in production without env var', () => {
      expect(isDecisionOsEnabled()).toBe(false);
    });
    
    it('isAutopilotEnabled returns false in production without env var', () => {
      expect(isAutopilotEnabled()).toBe(false);
    });
    
    it('isDrmEnabled returns false in production without env var', () => {
      expect(isDrmEnabled()).toBe(false);
    });
    
    it('isOcrEnabled returns false in production without env var', () => {
      expect(isOcrEnabled()).toBe(false);
    });
    
    it('explicitly setting flags to "true" enables them in production', () => {
      process.env.DECISION_OS_ENABLED = 'true';
      process.env.DECISION_AUTOPILOT_ENABLED = 'true';
      process.env.DECISION_OCR_ENABLED = 'true';
      process.env.DECISION_DRM_ENABLED = 'true';
      
      const flags = getFlags();
      
      expect(flags.decisionOsEnabled).toBe(true);
      expect(flags.autopilotEnabled).toBe(true);
      expect(flags.ocrEnabled).toBe(true);
      expect(flags.drmEnabled).toBe(true);
    });
    
    it('"false" string explicitly disables flags in production', () => {
      process.env.DECISION_OS_ENABLED = 'false';
      process.env.DECISION_AUTOPILOT_ENABLED = 'false';
      process.env.DECISION_OCR_ENABLED = 'false';
      process.env.DECISION_DRM_ENABLED = 'false';
      
      const flags = getFlags();
      
      expect(flags.decisionOsEnabled).toBe(false);
      expect(flags.autopilotEnabled).toBe(false);
      expect(flags.ocrEnabled).toBe(false);
      expect(flags.drmEnabled).toBe(false);
    });
  });
  
  describe('Development Defaults (dev-friendly)', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });
    
    afterEach(() => {
      process.env.NODE_ENV = originalEnv.NODE_ENV;
    });
    
    it('master and features default TRUE in dev (except OCR)', () => {
      const flags = getFlags();
      
      expect(flags.decisionOsEnabled).toBe(true);
      expect(flags.autopilotEnabled).toBe(true);
      expect(flags.drmEnabled).toBe(true);
      // OCR always defaults false (requires external API)
      expect(flags.ocrEnabled).toBe(false);
    });
    
    it('OCR can be explicitly enabled in dev', () => {
      process.env.DECISION_OCR_ENABLED = 'true';
      
      expect(isOcrEnabled()).toBe(true);
    });
    
    it('flags can be explicitly disabled in dev', () => {
      process.env.DECISION_OS_ENABLED = 'false';
      process.env.DECISION_AUTOPILOT_ENABLED = 'false';
      process.env.DECISION_DRM_ENABLED = 'false';
      
      const flags = getFlags();
      
      expect(flags.decisionOsEnabled).toBe(false);
      expect(flags.autopilotEnabled).toBe(false);
      expect(flags.drmEnabled).toBe(false);
    });
  });
  
  describe('Flag Cascade Behavior', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });
    
    afterEach(() => {
      process.env.NODE_ENV = originalEnv.NODE_ENV;
    });
    
    it('isAutopilotEnabled returns false when master disabled', () => {
      process.env.DECISION_OS_ENABLED = 'false';
      process.env.DECISION_AUTOPILOT_ENABLED = 'true';
      
      // Autopilot is enabled in config but master is off
      expect(getFlags().autopilotEnabled).toBe(true);
      // But isAutopilotEnabled cascades through master
      expect(isAutopilotEnabled()).toBe(false);
    });
    
    it('isOcrEnabled returns false when master disabled', () => {
      process.env.DECISION_OS_ENABLED = 'false';
      process.env.DECISION_OCR_ENABLED = 'true';
      
      expect(getFlags().ocrEnabled).toBe(true);
      expect(isOcrEnabled()).toBe(false);
    });
    
    it('isDrmEnabled returns false when master disabled', () => {
      process.env.DECISION_OS_ENABLED = 'false';
      process.env.DECISION_DRM_ENABLED = 'true';
      
      expect(getFlags().drmEnabled).toBe(true);
      expect(isDrmEnabled()).toBe(false);
    });
    
    it('feature flags are independent when master is enabled', () => {
      process.env.DECISION_OS_ENABLED = 'true';
      process.env.DECISION_AUTOPILOT_ENABLED = 'false';
      process.env.DECISION_OCR_ENABLED = 'true';
      process.env.DECISION_DRM_ENABLED = 'true';
      
      expect(isDecisionOsEnabled()).toBe(true);
      expect(isAutopilotEnabled()).toBe(false);
      expect(isOcrEnabled()).toBe(true);
      expect(isDrmEnabled()).toBe(true);
    });
  });
  
  describe('Edge Cases', () => {
    it('handles empty string as missing (uses default)', () => {
      process.env.NODE_ENV = 'production';
      process.env.DECISION_OS_ENABLED = '';
      
      // Empty string should be treated as missing (default false in prod)
      expect(getFlags().decisionOsEnabled).toBe(false);
    });
    
    it('handles whitespace in flag values', () => {
      process.env.NODE_ENV = 'production';
      process.env.DECISION_OS_ENABLED = ' true ';
      
      expect(getFlags().decisionOsEnabled).toBe(true);
    });
    
    it('handles uppercase TRUE', () => {
      process.env.NODE_ENV = 'production';
      process.env.DECISION_OS_ENABLED = 'TRUE';
      
      expect(getFlags().decisionOsEnabled).toBe(true);
    });
    
    it('handles mixed case True', () => {
      process.env.NODE_ENV = 'production';
      process.env.DECISION_OS_ENABLED = 'True';
      
      expect(getFlags().decisionOsEnabled).toBe(true);
    });
    
    it('invalid value uses default', () => {
      process.env.NODE_ENV = 'production';
      process.env.DECISION_OS_ENABLED = 'yes'; // Invalid, not "true" or "false"
      
      // Should use default (false in production)
      expect(getFlags().decisionOsEnabled).toBe(false);
    });
    
    it('handles "1" as invalid (not true)', () => {
      process.env.NODE_ENV = 'production';
      process.env.DECISION_OS_ENABLED = '1';
      
      // "1" is not "true" or "false", so default applies
      expect(getFlags().decisionOsEnabled).toBe(false);
    });
  });
});

describe('Autopilot Disabled Behavior', () => {
  const originalEnv = { ...process.env };
  
  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    process.env.DECISION_OS_ENABLED = 'true';
    process.env.DECISION_AUTOPILOT_ENABLED = 'false';
  });
  
  afterEach(() => {
    process.env = { ...originalEnv };
  });
  
  it('autopilot flag is disabled', () => {
    expect(isAutopilotEnabled()).toBe(false);
  });
  
  it('other features remain enabled', () => {
    expect(isDecisionOsEnabled()).toBe(true);
    expect(isDrmEnabled()).toBe(true);
  });
});

describe('DRM Disabled Behavior', () => {
  const originalEnv = { ...process.env };
  
  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    process.env.DECISION_OS_ENABLED = 'true';
    process.env.DECISION_DRM_ENABLED = 'false';
  });
  
  afterEach(() => {
    process.env = { ...originalEnv };
  });
  
  it('DRM flag is disabled', () => {
    expect(isDrmEnabled()).toBe(false);
  });
  
  it('other features remain enabled', () => {
    expect(isDecisionOsEnabled()).toBe(true);
    expect(isAutopilotEnabled()).toBe(true);
  });
});

describe('OCR Disabled Behavior', () => {
  const originalEnv = { ...process.env };
  
  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    process.env.DECISION_OS_ENABLED = 'true';
    // OCR defaults to false, so don't set it
  });
  
  afterEach(() => {
    process.env = { ...originalEnv };
  });
  
  it('OCR flag defaults to disabled', () => {
    expect(isOcrEnabled()).toBe(false);
  });
  
  it('OCR can be explicitly enabled', () => {
    process.env.DECISION_OCR_ENABLED = 'true';
    expect(isOcrEnabled()).toBe(true);
  });
  
  it('other features remain enabled', () => {
    expect(isDecisionOsEnabled()).toBe(true);
    expect(isAutopilotEnabled()).toBe(true);
    expect(isDrmEnabled()).toBe(true);
  });
});

describe('All Flags Disabled (complete shutdown)', () => {
  const originalEnv = { ...process.env };
  
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    // Don't set any flags - they should all default to false
  });
  
  afterEach(() => {
    process.env = { ...originalEnv };
  });
  
  it('all isX helper functions return false', () => {
    expect(isDecisionOsEnabled()).toBe(false);
    expect(isAutopilotEnabled()).toBe(false);
    expect(isOcrEnabled()).toBe(false);
    expect(isDrmEnabled()).toBe(false);
  });
  
  it('getFlags returns all false', () => {
    const flags = getFlags();
    
    expect(flags.decisionOsEnabled).toBe(false);
    expect(flags.autopilotEnabled).toBe(false);
    expect(flags.ocrEnabled).toBe(false);
    expect(flags.drmEnabled).toBe(false);
  });
});
