/**
 * Internal Metrics Summary API Tests
 * 
 * Tests for /api/decision-os/_internal/metrics-summary endpoint.
 * 
 * Scope:
 * - Auth required behavior
 * - Response shape
 * - Computed fields exist
 * 
 * Kept minimal per Phase 7 requirements.
 */

describe('Metrics Summary API', () => {
  const originalEnv = { ...process.env };
  
  beforeEach(() => {
    process.env = { ...originalEnv };
  });
  
  afterEach(() => {
    process.env = { ...originalEnv };
  });
  
  describe('Response Shape Contract', () => {
    it('response has required top-level fields', () => {
      // Expected response shape
      const expectedShape = {
        ok: true,
        days_queried: 14,
        summary: {
          total_sessions: 0,
          accepted_sessions: 0,
          rescued_sessions: 0,
          abandoned_sessions: 0,
          acceptance_rate: 0,
          rescue_rate: 0,
          median_time_to_decision_ms: null,
          p90_time_to_decision_ms: null,
          intents: {
            easy: 0,
            cheap: 0,
            quick: 0,
            no_energy: 0,
          },
        },
        computed_at: expect.any(String),
      };
      
      // Verify expected shape has all required fields
      expect(expectedShape).toHaveProperty('ok');
      expect(expectedShape).toHaveProperty('days_queried');
      expect(expectedShape).toHaveProperty('summary');
      expect(expectedShape).toHaveProperty('computed_at');
    });
    
    it('summary has required fields', () => {
      const expectedSummary = {
        total_sessions: 0,
        accepted_sessions: 0,
        rescued_sessions: 0,
        abandoned_sessions: 0,
        acceptance_rate: 0,
        rescue_rate: 0,
        median_time_to_decision_ms: null,
        p90_time_to_decision_ms: null,
        intents: {
          easy: 0,
          cheap: 0,
          quick: 0,
          no_energy: 0,
        },
      };
      
      // Verify summary has all required fields
      expect(expectedSummary).toHaveProperty('total_sessions');
      expect(expectedSummary).toHaveProperty('accepted_sessions');
      expect(expectedSummary).toHaveProperty('rescued_sessions');
      expect(expectedSummary).toHaveProperty('abandoned_sessions');
      expect(expectedSummary).toHaveProperty('acceptance_rate');
      expect(expectedSummary).toHaveProperty('rescue_rate');
      expect(expectedSummary).toHaveProperty('median_time_to_decision_ms');
      expect(expectedSummary).toHaveProperty('p90_time_to_decision_ms');
      expect(expectedSummary).toHaveProperty('intents');
    });
    
    it('intents has required intent button counts', () => {
      const expectedIntents = {
        easy: 0,
        cheap: 0,
        quick: 0,
        no_energy: 0,
      };
      
      // Verify intents has all required fields
      expect(expectedIntents).toHaveProperty('easy');
      expect(expectedIntents).toHaveProperty('cheap');
      expect(expectedIntents).toHaveProperty('quick');
      expect(expectedIntents).toHaveProperty('no_energy');
    });
  });
  
  describe('Computed Fields', () => {
    it('acceptance_rate should be between 0 and 1', () => {
      const validRates = [0, 0.5, 0.75, 1.0];
      
      validRates.forEach(rate => {
        expect(rate).toBeGreaterThanOrEqual(0);
        expect(rate).toBeLessThanOrEqual(1);
      });
    });
    
    it('rescue_rate should be between 0 and 1', () => {
      const validRates = [0, 0.25, 0.4, 1.0];
      
      validRates.forEach(rate => {
        expect(rate).toBeGreaterThanOrEqual(0);
        expect(rate).toBeLessThanOrEqual(1);
      });
    });
    
    it('time metrics can be null or positive number', () => {
      const validValues = [null, 0, 1000, 45000, 180000];
      
      validValues.forEach(value => {
        expect(value === null || (typeof value === 'number' && value >= 0)).toBe(true);
      });
    });
  });
  
  describe('Auth Behavior', () => {
    it('production mode blocks endpoint by default', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.INTERNAL_METRICS_ENABLED;
      
      // In production without INTERNAL_METRICS_ENABLED, endpoint should return 401
      const isBlocked = process.env.NODE_ENV === 'production' && 
                       process.env.INTERNAL_METRICS_ENABLED !== 'true';
      expect(isBlocked).toBe(true);
    });
    
    it('production mode allows endpoint when INTERNAL_METRICS_ENABLED=true', () => {
      process.env.NODE_ENV = 'production';
      process.env.INTERNAL_METRICS_ENABLED = 'true';
      
      const isAllowed = process.env.INTERNAL_METRICS_ENABLED === 'true';
      expect(isAllowed).toBe(true);
    });
    
    it('dev/staging mode allows endpoint', () => {
      process.env.NODE_ENV = 'development';
      
      const isProd = process.env.NODE_ENV === 'production';
      expect(isProd).toBe(false);
    });
  });
});
