/**
 * Decision OS Auth Helper
 * 
 * Handles JWT verification and household mapping for Supabase Auth.
 * 
 * Production mode:
 * - Requires valid Supabase JWT
 * - Derives household_key from auth, NOT from client input
 * 
 * Dev mode (NODE_ENV !== 'production'):
 * - Falls back to 'default' household_key when no auth token
 * - Allows testing without authentication
 */

import { getDb } from '../db/client';

// =============================================================================
// TYPES
// =============================================================================

export interface AuthContext {
  userId: string;           // Supabase auth user ID (sub claim)
  userProfileId: number;    // Internal user_profiles.id
  householdKey: string;     // Derived household_key for this user
  householdId: string;      // households.id (UUID)
}

export type AuthError = 'unauthorized' | 'invalid_token' | 'server_error';

export type AuthResult = 
  | { success: true; context: AuthContext }
  | { success: false; error: AuthError };

// =============================================================================
// JWT VERIFICATION
// =============================================================================

/**
 * Decode and verify Supabase JWT.
 * 
 * For Supabase, the JWT contains:
 * - sub: user ID (UUID)
 * - email: user email
 * - aud: "authenticated"
 * - exp: expiration timestamp
 * 
 * In production, we should use the Supabase JWT secret to verify.
 * For MVP, we do basic validation and trust the token if it decodes properly.
 */
export function decodeSupabaseJwt(token: string): { sub: string; email?: string } | null {
  try {
    // JWT format: header.payload.signature
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }
    
    // Decode payload (base64url)
    const payload = parts[1];
    const decoded = Buffer.from(payload, 'base64url').toString('utf-8');
    const claims = JSON.parse(decoded);
    
    // Validate required claims
    if (!claims.sub || typeof claims.sub !== 'string') {
      return null;
    }
    
    // Check expiration
    if (claims.exp && typeof claims.exp === 'number') {
      const now = Math.floor(Date.now() / 1000);
      if (claims.exp < now) {
        return null; // Token expired
      }
    }
    
    // Check audience (optional, but good for security)
    if (claims.aud && claims.aud !== 'authenticated') {
      return null;
    }
    
    return {
      sub: claims.sub,
      email: claims.email,
    };
  } catch {
    return null;
  }
}

/**
 * Extract Bearer token from Authorization header
 */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) {
    return null;
  }
  
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

// =============================================================================
// HOUSEHOLD MAPPING
// =============================================================================

/**
 * Generate a deterministic household_key from user ID.
 * Format: hh-<first 8 chars of user id>
 */
export function generateHouseholdKey(userId: string): string {
  // Use first 8 chars of user ID for brevity
  const shortId = userId.replace(/-/g, '').substring(0, 8);
  return `hh-${shortId}`;
}

/**
 * Ensure user_profile exists for auth user.
 * Creates one if not present.
 */
async function ensureUserProfile(authUserId: string): Promise<number> {
  const db = getDb();
  
  // Try to find existing user by auth_user_id
  const existingUsers = await db.query<{ id: number }>(
    `SELECT id FROM user_profiles WHERE auth_user_id = $1`,
    [authUserId]
  );
  
  if (existingUsers.length > 0) {
    return existingUsers[0].id;
  }
  
  // Create new user_profile
  const newUsers = await db.query<{ id: number }>(
    `INSERT INTO user_profiles (auth_user_id) VALUES ($1) RETURNING id`,
    [authUserId]
  );
  
  return newUsers[0].id;
}

/**
 * Ensure household exists for this key.
 * Creates one if not present.
 */
async function ensureHousehold(householdKey: string): Promise<string> {
  const db = getDb();
  
  // Try to find existing household
  const existing = await db.query<{ id: string }>(
    `SELECT id FROM households WHERE household_key = $1`,
    [householdKey]
  );
  
  if (existing.length > 0) {
    return existing[0].id;
  }
  
  // Create new household
  const newHousehold = await db.query<{ id: string }>(
    `INSERT INTO households (household_key) VALUES ($1) RETURNING id`,
    [householdKey]
  );
  
  return newHousehold[0].id;
}

/**
 * Ensure user is a member of a household.
 * Creates membership if not present.
 */
async function ensureHouseholdMembership(
  householdId: string, 
  userProfileId: number
): Promise<void> {
  const db = getDb();
  
  // Check if membership exists
  const existing = await db.query<{ id: string }>(
    `SELECT id FROM household_members WHERE user_profile_id = $1`,
    [userProfileId]
  );
  
  if (existing.length > 0) {
    return; // Already a member (possibly of different household)
  }
  
  // Create membership
  await db.query(
    `INSERT INTO household_members (household_id, user_profile_id, role) 
     VALUES ($1, $2, 'owner')
     ON CONFLICT (user_profile_id) DO NOTHING`,
    [householdId, userProfileId]
  );
}

// =============================================================================
// MAIN AUTH FUNCTION
// =============================================================================

/**
 * Authenticate request and return auth context.
 * 
 * Production mode (NODE_ENV === 'production'):
 * - Requires valid JWT
 * - Returns error if no/invalid token
 * 
 * Dev mode:
 * - Falls back to 'default' household if no token
 * - Still processes token if provided
 */
export async function authenticateRequest(
  authHeader: string | null
): Promise<AuthResult> {
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Extract token
  const token = extractBearerToken(authHeader);
  
  // No token provided
  if (!token) {
    if (isProduction) {
      return { success: false, error: 'unauthorized' };
    }
    
    // Dev mode fallback
    return {
      success: true,
      context: {
        userId: 'dev-user',
        userProfileId: 1,
        householdKey: 'default',
        householdId: '00000000-0000-0000-0000-000000000000',
      },
    };
  }
  
  // Decode and verify JWT
  const claims = decodeSupabaseJwt(token);
  if (!claims) {
    return { success: false, error: 'invalid_token' };
  }
  
  try {
    // Ensure user_profile exists
    const userProfileId = await ensureUserProfile(claims.sub);
    
    // Generate and ensure household
    const householdKey = generateHouseholdKey(claims.sub);
    const householdId = await ensureHousehold(householdKey);
    
    // Ensure membership
    await ensureHouseholdMembership(householdId, userProfileId);
    
    return {
      success: true,
      context: {
        userId: claims.sub,
        userProfileId,
        householdKey,
        householdId,
      },
    };
  } catch (error) {
    console.error('Auth error:', error instanceof Error ? error.message : 'Unknown');
    return { success: false, error: 'server_error' };
  }
}

/**
 * Check if running in production mode
 */
export function isProductionMode(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Get default household context for dev/test
 */
export function getDevHouseholdContext(): AuthContext {
  return {
    userId: 'dev-user',
    userProfileId: 1,
    householdKey: 'default',
    householdId: '00000000-0000-0000-0000-000000000000',
  };
}
