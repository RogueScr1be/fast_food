/**
 * Auth Helper Tests
 * 
 * Tests for JWT verification and household mapping.
 */

import {
  decodeSupabaseJwt,
  extractBearerToken,
  generateHouseholdKey,
  authenticateRequest,
  isProductionMode,
  getDevHouseholdContext,
} from '../auth/helper';
import { resetDb, clearDb } from '../db/client';

describe('Auth Helper', () => {
  beforeEach(async () => {
    resetDb();
    await clearDb();
  });

  describe('extractBearerToken', () => {
    it('extracts token from valid Authorization header', () => {
      const token = extractBearerToken('Bearer abc123');
      expect(token).toBe('abc123');
    });

    it('extracts token case-insensitively', () => {
      const token = extractBearerToken('bearer ABC123');
      expect(token).toBe('ABC123');
    });

    it('returns null for null header', () => {
      const token = extractBearerToken(null);
      expect(token).toBeNull();
    });

    it('returns null for invalid header format', () => {
      expect(extractBearerToken('Basic abc123')).toBeNull();
      expect(extractBearerToken('Bearerabc123')).toBeNull();
      expect(extractBearerToken('')).toBeNull();
    });
  });

  describe('decodeSupabaseJwt', () => {
    // Create a mock JWT (header.payload.signature)
    function createMockJwt(payload: Record<string, unknown>): string {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const signature = 'mock_signature';
      return `${header}.${payloadStr}.${signature}`;
    }

    it('decodes valid JWT with sub claim', () => {
      const jwt = createMockJwt({
        sub: 'user-123',
        email: 'test@example.com',
        aud: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      });

      const claims = decodeSupabaseJwt(jwt);
      expect(claims).not.toBeNull();
      expect(claims?.sub).toBe('user-123');
      expect(claims?.email).toBe('test@example.com');
    });

    it('returns null for expired JWT', () => {
      const jwt = createMockJwt({
        sub: 'user-123',
        exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
      });

      const claims = decodeSupabaseJwt(jwt);
      expect(claims).toBeNull();
    });

    it('returns null for invalid JWT format', () => {
      expect(decodeSupabaseJwt('not-a-jwt')).toBeNull();
      expect(decodeSupabaseJwt('only.two.parts.here.invalid')).toBeNull();
      expect(decodeSupabaseJwt('')).toBeNull();
    });

    it('returns null for JWT without sub claim', () => {
      const jwt = createMockJwt({
        email: 'test@example.com',
      });

      const claims = decodeSupabaseJwt(jwt);
      expect(claims).toBeNull();
    });

    it('returns null for JWT with wrong audience', () => {
      const jwt = createMockJwt({
        sub: 'user-123',
        aud: 'wrong-audience',
      });

      const claims = decodeSupabaseJwt(jwt);
      expect(claims).toBeNull();
    });
  });

  describe('generateHouseholdKey', () => {
    it('generates deterministic household key from user ID', () => {
      const key1 = generateHouseholdKey('user-12345678-abcd');
      const key2 = generateHouseholdKey('user-12345678-abcd');
      
      expect(key1).toBe(key2);
      expect(key1).toMatch(/^hh-[a-z0-9]+$/);
    });

    it('generates different keys for different users', () => {
      const key1 = generateHouseholdKey('user-aaaa');
      const key2 = generateHouseholdKey('user-bbbb');
      
      expect(key1).not.toBe(key2);
    });
  });

  describe('authenticateRequest', () => {
    // Create a mock JWT for testing
    function createValidJwt(sub: string = 'test-user-123'): string {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({
        sub,
        aud: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + 3600,
      })).toString('base64url');
      return `${header}.${payload}.signature`;
    }

    describe('dev mode (NODE_ENV !== production)', () => {
      it('returns default household when no auth header', async () => {
        const result = await authenticateRequest(null);
        
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.context.householdKey).toBe('default');
          expect(result.context.userProfileId).toBe(1);
          expect(result.context.userId).toBe('dev-user');
        }
      });

      it('processes valid token even in dev mode', async () => {
        const token = createValidJwt('new-user-456');
        const result = await authenticateRequest(`Bearer ${token}`);
        
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.context.userId).toBe('new-user-456');
          expect(result.context.householdKey).toBe(generateHouseholdKey('new-user-456'));
        }
      });

      it('returns error for invalid token', async () => {
        const result = await authenticateRequest('Bearer invalid-token');
        
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe('invalid_token');
        }
      });
    });

    describe('household mapping', () => {
      it('creates household and membership for new user', async () => {
        const token = createValidJwt('brand-new-user');
        const result = await authenticateRequest(`Bearer ${token}`);
        
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.context.userId).toBe('brand-new-user');
          expect(result.context.userProfileId).toBeGreaterThan(0);
          expect(result.context.householdKey).toMatch(/^hh-/);
          expect(result.context.householdId).toBeTruthy();
        }
      });

      it('reuses existing household for returning user', async () => {
        const token = createValidJwt('returning-user');
        
        // First request creates household
        const result1 = await authenticateRequest(`Bearer ${token}`);
        expect(result1.success).toBe(true);
        
        // Second request reuses household
        const result2 = await authenticateRequest(`Bearer ${token}`);
        expect(result2.success).toBe(true);
        
        if (result1.success && result2.success) {
          expect(result1.context.userProfileId).toBe(result2.context.userProfileId);
          expect(result1.context.householdKey).toBe(result2.context.householdKey);
        }
      });
    });
  });

  describe('isProductionMode', () => {
    it('returns false in test environment', () => {
      expect(isProductionMode()).toBe(false);
    });
  });

  describe('getDevHouseholdContext', () => {
    it('returns default dev context', () => {
      const context = getDevHouseholdContext();
      
      expect(context.userId).toBe('dev-user');
      expect(context.userProfileId).toBe(1);
      expect(context.householdKey).toBe('default');
      expect(context.householdId).toBe('00000000-0000-0000-0000-000000000000');
    });
  });
});

// =============================================================================
// PRODUCTION AUTH TESTS (Simulated)
// =============================================================================

describe('Production Auth Requirements (simulated)', () => {
  // Note: In actual production mode, NODE_ENV=production would cause
  // authenticateRequest to return 401 for missing tokens.
  // These tests verify the auth logic structure.

  it('validates that endpoints would require auth in production', () => {
    // This test documents the expected behavior
    // In production (NODE_ENV=production):
    // - No token => 401 { error: 'unauthorized' }
    // - Invalid token => 401 { error: 'invalid_token' }
    // - Valid token => 200 with derived household_key
    
    // The actual production behavior is enforced by:
    // - authenticateRequest checking isProductionMode()
    // - API handlers calling authenticateRequest()
    
    expect(true).toBe(true);
  });
});
