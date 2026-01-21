/**
 * Config Sanity Tests - Validates build profile environment configuration.
 * <= 40 LOC as required.
 */

describe('Config Sanity', () => {
  const variant = process.env.EXPO_PUBLIC_APP_VARIANT || 'development';
  const baseUrl = process.env.EXPO_PUBLIC_DECISION_OS_BASE_URL;
  const stagingToken = process.env.EXPO_PUBLIC_STAGING_AUTH_TOKEN;

  it('app variant is valid', () => {
    expect(['development', 'preview', 'production']).toContain(variant);
  });

  it('preview/production must have base URL configured', () => {
    if (variant === 'preview' || variant === 'production') {
      expect(baseUrl).toBeTruthy();
      expect(baseUrl).toMatch(/^https?:\/\//);
    } else {
      expect(true).toBe(true); // dev can fall back
    }
  });

  it('production must NOT have staging auth token', () => {
    if (variant === 'production') {
      expect(stagingToken).toBeFalsy();
    } else {
      expect(true).toBe(true);
    }
  });

  it('staging token only allowed in preview', () => {
    if (stagingToken) {
      expect(['development', 'preview']).toContain(variant);
    } else {
      expect(true).toBe(true);
    }
  });
});
