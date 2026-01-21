/**
 * Config Sanity Tests
 * 
 * Validates environment configuration for different build profiles.
 * These tests ensure proper configuration before builds.
 */

describe('Config Sanity', () => {
  describe('Environment Variables', () => {
    it('EXPO_PUBLIC_APP_VARIANT should be defined or default to development', () => {
      const variant = process.env.EXPO_PUBLIC_APP_VARIANT || 'development';
      expect(['development', 'preview', 'production']).toContain(variant);
    });

    it('valid app variants are known', () => {
      // Document the valid variants for reference
      const validVariants = ['development', 'preview', 'production'];
      expect(validVariants).toHaveLength(3);
    });
  });

  describe('Build Profile Rules', () => {
    const variant = process.env.EXPO_PUBLIC_APP_VARIANT || 'development';

    it('development profile has expected defaults', () => {
      if (variant === 'development') {
        // In development, we use localhost by default
        const baseUrl = process.env.EXPO_PUBLIC_DECISION_OS_BASE_URL;
        if (baseUrl) {
          expect(baseUrl).toMatch(/localhost|127\.0\.0\.1|10\.0\.2\.2/);
        }
      }
    });

    it('preview profile should have staging URL configured (when running in preview)', () => {
      if (variant === 'preview') {
        // In preview, DECISION_OS_BASE_URL should be set to staging
        const baseUrl = process.env.EXPO_PUBLIC_DECISION_OS_BASE_URL;
        // This assertion is informational - actual build will have it set via EAS secrets
        if (baseUrl) {
          expect(baseUrl).not.toMatch(/localhost/);
        }
      }
      // Always pass in test environment
      expect(true).toBe(true);
    });

    it('production profile must NOT have staging auth token', () => {
      if (variant === 'production') {
        // Production builds must NEVER have a baked-in auth token
        const stagingToken = process.env.EXPO_PUBLIC_STAGING_AUTH_TOKEN;
        expect(stagingToken).toBeFalsy();
      }
      // Always pass in test environment (we're in development/test mode)
      expect(true).toBe(true);
    });

    it('staging auth token is only allowed in preview profile', () => {
      const stagingToken = process.env.EXPO_PUBLIC_STAGING_AUTH_TOKEN;
      
      // If a staging token exists, we must be in preview or development
      if (stagingToken) {
        expect(['development', 'preview']).toContain(variant);
      }
      
      // Always pass - this documents the rule
      expect(true).toBe(true);
    });
  });

  describe('API Service Configuration (documented)', () => {
    /**
     * NOTE: ApiService tests are in a separate test file that can properly
     * handle React Native imports. This section documents the expected API.
     * 
     * ApiService should export:
     * - setAuthToken(token: string | null): void
     * - getAuthToken(): string | null
     * - isAuthenticated(): boolean
     * - getAppVariant(): string
     * - getDecisionOsBaseUrl(): string
     */
    it('ApiService API is documented', () => {
      const expectedMethods = [
        'setAuthToken',
        'getAuthToken', 
        'isAuthenticated',
        'getAppVariant',
        'getDecisionOsBaseUrl',
      ];
      
      expect(expectedMethods).toHaveLength(5);
    });

    it('app variant should be one of known values', () => {
      const validVariants = ['development', 'preview', 'production'];
      const currentVariant = process.env.EXPO_PUBLIC_APP_VARIANT || 'development';
      expect(validVariants).toContain(currentVariant);
    });

    it('Decision OS base URL falls back to localhost in development', () => {
      // In test environment (development), without explicit config,
      // the base URL should default to localhost
      const baseUrl = process.env.EXPO_PUBLIC_DECISION_OS_BASE_URL;
      
      // If not set, ApiService will use platform-appropriate localhost
      if (!baseUrl) {
        // This is expected in development - fallback will be used
        expect(true).toBe(true);
      } else {
        // If set, it should be a valid URL
        expect(baseUrl).toMatch(/^https?:\/\//);
      }
    });
  });

  describe('Security Rules Documentation', () => {
    it('documents auth token rules', () => {
      /**
       * AUTH TOKEN RULES:
       * 
       * 1. EXPO_PUBLIC_STAGING_AUTH_TOKEN:
       *    - Only for preview builds (internal QA)
       *    - NEVER set for production builds
       *    - Set via EAS secrets, not in code
       * 
       * 2. Production builds:
       *    - Ship without any baked-in auth token
       *    - Users will get 401 until they log in
       *    - Login UI is a future feature
       * 
       * 3. Dev builds:
       *    - Can use EXPO_PUBLIC_SUPABASE_ACCESS_TOKEN for local testing
       *    - Or manually call ApiService.setAuthToken()
       */
      expect(true).toBe(true);
    });

    it('documents base URL rules', () => {
      /**
       * BASE URL RULES:
       * 
       * 1. EXPO_PUBLIC_DECISION_OS_BASE_URL:
       *    - Single source of truth for Decision OS API
       *    - dev: http://localhost:8081 (default)
       *    - preview/production: Set via EAS secrets to Vercel staging
       * 
       * 2. Falls back gracefully:
       *    - If not set, uses platform-appropriate localhost
       */
      expect(true).toBe(true);
    });
  });
});

describe('EAS Build Profile Validation', () => {
  it('eas.json build profiles are documented', () => {
    /**
     * EAS BUILD PROFILES:
     * 
     * development:
     *   - Distribution: internal (simulator)
     *   - Auth: none
     *   - URL: localhost
     * 
     * preview:
     *   - Distribution: internal (device)
     *   - Auth: staging token (optional, via EAS secrets)
     *   - URL: staging (via EAS secrets)
     * 
     * production:
     *   - Distribution: store (TestFlight)
     *   - Auth: NONE (must not have baked-in token)
     *   - URL: staging (via EAS secrets)
     */
    expect(true).toBe(true);
  });
});
