/**
 * Decision OS Feature Flags
 * 
 * Hard kill switches with fail-closed behavior.
 * 
 * Environment Variables:
 * - DECISION_OS_ENABLED: Master kill switch
 * - DECISION_AUTOPILOT_ENABLED: Autopilot feature
 * - DECISION_OCR_ENABLED: OCR/receipt scanning
 * - DECISION_DRM_ENABLED: Dinner Rescue Mode
 * - RUNTIME_FLAGS_ENABLED: Enable DB-backed flags override
 * 
 * Defaults:
 * - Production (NODE_ENV=production): ALL false if env var missing (fail-closed)
 * - Non-production: Master true, features true EXCEPT OCR false
 * 
 * Runtime Flags (DB-backed):
 * - When RUNTIME_FLAGS_ENABLED=true, DB flags are AND'd with ENV flags
 * - DB flags cached for 30 seconds per process
 * - If DB read fails in production, fail closed (treat as disabled)
 */

export interface DecisionOsFlags {
  /** Master kill switch - if false, all Decision OS functionality disabled */
  decisionOsEnabled: boolean;
  /** Autopilot feature - automatic meal approval */
  autopilotEnabled: boolean;
  /** OCR feature - receipt scanning */
  ocrEnabled: boolean;
  /** DRM feature - Dinner Rescue Mode */
  drmEnabled: boolean;
  /** Read-only mode - if true, no DB writes (emergency freeze) */
  readonlyMode: boolean;
  /** MVP enabled - if false, app shows "temporarily unavailable" */
  mvpEnabled: boolean;
}

/**
 * DB flag row structure
 */
export interface RuntimeFlagRow {
  key: string;
  enabled: boolean;
  updated_at: string;
}

/**
 * DB client interface for flag queries
 */
export interface FlagDbClient {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

/**
 * Cached DB flags with expiration
 */
interface FlagCache {
  flags: Map<string, boolean>;
  expiresAt: number;
}

// In-memory cache for DB flags (30 second TTL)
const FLAG_CACHE_TTL_MS = 30_000;
let dbFlagCache: FlagCache | null = null;

/**
 * Clear the flag cache (for testing)
 */
export function clearFlagCache(): void {
  dbFlagCache = null;
}

/**
 * Get cached DB flags or return null if expired/missing
 */
function getCachedDbFlags(): Map<string, boolean> | null {
  if (!dbFlagCache) return null;
  if (Date.now() > dbFlagCache.expiresAt) {
    dbFlagCache = null;
    return null;
  }
  return dbFlagCache.flags;
}

/**
 * Set DB flags cache
 */
function setCachedDbFlags(flags: Map<string, boolean>): void {
  dbFlagCache = {
    flags,
    expiresAt: Date.now() + FLAG_CACHE_TTL_MS,
  };
}

/**
 * Fetch flags from database
 */
async function fetchDbFlags(client: FlagDbClient): Promise<Map<string, boolean>> {
  const result = await client.query<RuntimeFlagRow>(
    'SELECT key, enabled FROM runtime_flags'
  );
  
  const flags = new Map<string, boolean>();
  for (const row of result.rows) {
    flags.set(row.key, row.enabled);
  }
  return flags;
}

/**
 * Resolve flags input
 */
export interface ResolveFlagsInput {
  /** Environment flags (from getFlags()) */
  env?: DecisionOsFlags;
  /** Database client for runtime flags */
  db?: FlagDbClient | null;
  /** Whether to use cached DB flags (default: true) */
  useCache?: boolean;
}

/**
 * Resolved flags with metadata
 */
export interface ResolvedFlags extends DecisionOsFlags {
  /** Source of flags: 'env' | 'env+db' */
  source: 'env' | 'env+db';
  /** Whether DB flags were successfully loaded */
  dbLoaded: boolean;
}

/**
 * Resolve effective flags by combining ENV and DB flags.
 * 
 * Priority:
 * 1. ENV master kill switch still gates everything
 * 2. If RUNTIME_FLAGS_ENABLED=true, read DB flags and AND them with env flags
 * 3. Cache DB flags for 30 seconds per process
 * 
 * Fail-closed behavior:
 * - In production, if DB read fails, treat all DB flags as disabled
 * - In dev, if DB read fails, fall back to env-only flags
 */
export async function resolveFlags(input: ResolveFlagsInput = {}): Promise<ResolvedFlags> {
  const envFlags = input.env ?? getFlags();
  const useCache = input.useCache ?? true;
  const prod = isProduction();
  
  // Base result from env flags
  const result: ResolvedFlags = {
    ...envFlags,
    source: 'env',
    dbLoaded: false,
  };
  
  // Check if runtime flags are enabled
  const runtimeFlagsEnabled = parseFlag(process.env.RUNTIME_FLAGS_ENABLED, false);
  if (!runtimeFlagsEnabled || !input.db) {
    return result;
  }
  
  // Try to get DB flags (from cache or fresh)
  let dbFlags: Map<string, boolean> | null = null;
  
  if (useCache) {
    dbFlags = getCachedDbFlags();
  }
  
  if (!dbFlags) {
    try {
      dbFlags = await fetchDbFlags(input.db);
      if (useCache) {
        setCachedDbFlags(dbFlags);
      }
    } catch (error) {
      // Fail closed in production, fall back in dev
      if (prod) {
        // All DB flags treated as disabled (fail closed)
        return {
          decisionOsEnabled: false,
          autopilotEnabled: false,
          ocrEnabled: false,
          drmEnabled: false,
          readonlyMode: false,
          mvpEnabled: false,
          source: 'env',
          dbLoaded: false,
        };
      }
      // In dev, just use env flags
      return result;
    }
  }
  
  // AND env flags with DB flags
  result.source = 'env+db';
  result.dbLoaded = true;
  
  // Only enable if BOTH env AND db say enabled
  result.decisionOsEnabled = envFlags.decisionOsEnabled && 
    (dbFlags.get('decision_os_enabled') ?? false);
  result.autopilotEnabled = envFlags.autopilotEnabled && 
    (dbFlags.get('decision_autopilot_enabled') ?? false);
  result.ocrEnabled = envFlags.ocrEnabled && 
    (dbFlags.get('decision_ocr_enabled') ?? false);
  result.drmEnabled = envFlags.drmEnabled && 
    (dbFlags.get('decision_drm_enabled') ?? false);
  result.mvpEnabled = envFlags.mvpEnabled &&
    (dbFlags.get('ff_mvp_enabled') ?? true); // Default true if DB flag not set
  
  // Readonly mode: only check DB flag (no env flag for this)
  // AND with master: readonly doesn't bypass auth
  result.readonlyMode = result.decisionOsEnabled && 
    (dbFlags.get('decision_os_readonly') ?? false);
  
  return result;
}

/**
 * Parse string "true"/"false" to boolean.
 * Returns defaultValue if undefined/null or not "true"/"false".
 */
function parseFlag(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  
  const normalized = value.toLowerCase().trim();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  
  // Invalid value - return default
  return defaultValue;
}

/**
 * Check if running in production mode
 */
function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Get current feature flags.
 * 
 * Production behavior (fail-closed):
 * - If env var missing, defaults to FALSE
 * - Must explicitly enable features
 * 
 * Development behavior (dev-friendly):
 * - Master enabled by default
 * - All features enabled by default EXCEPT OCR
 * - OCR disabled by default (requires external API)
 */
export function getFlags(): DecisionOsFlags {
  const prod = isProduction();
  
  // Production: fail-closed (all false by default)
  // Non-production: dev-friendly defaults
  const defaultMaster = prod ? false : true;
  const defaultAutopilot = prod ? false : true;
  const defaultOcr = false; // Always default false (requires external API)
  const defaultDrm = prod ? false : true;
  const defaultMvp = prod ? false : true;
  
  return {
    decisionOsEnabled: parseFlag(process.env.DECISION_OS_ENABLED, defaultMaster),
    autopilotEnabled: parseFlag(process.env.DECISION_AUTOPILOT_ENABLED, defaultAutopilot),
    ocrEnabled: parseFlag(process.env.DECISION_OCR_ENABLED, defaultOcr),
    drmEnabled: parseFlag(process.env.DECISION_DRM_ENABLED, defaultDrm),
    readonlyMode: false, // Default false - only controlled by DB flag
    mvpEnabled: parseFlag(process.env.FF_MVP_ENABLED, defaultMvp),
  };
}

/**
 * Check if Decision OS is enabled (master switch)
 */
export function isDecisionOsEnabled(): boolean {
  return getFlags().decisionOsEnabled;
}

/**
 * Check if autopilot is enabled
 * Returns false if master is disabled OR autopilot specifically disabled
 */
export function isAutopilotEnabled(): boolean {
  const flags = getFlags();
  return flags.decisionOsEnabled && flags.autopilotEnabled;
}

/**
 * Check if OCR is enabled
 * Returns false if master is disabled OR OCR specifically disabled
 */
export function isOcrEnabled(): boolean {
  const flags = getFlags();
  return flags.decisionOsEnabled && flags.ocrEnabled;
}

/**
 * Check if DRM is enabled
 * Returns false if master is disabled OR DRM specifically disabled
 */
export function isDrmEnabled(): boolean {
  const flags = getFlags();
  return flags.decisionOsEnabled && flags.drmEnabled;
}

/**
 * Check if MVP is enabled
 * Returns false if MVP specifically disabled (app shows "temporarily unavailable")
 */
export function isMvpEnabled(): boolean {
  const flags = getFlags();
  return flags.mvpEnabled;
}

/**
 * Get flags for testing purposes (allows override)
 */
export function getFlagsForTest(overrides?: Partial<DecisionOsFlags>): DecisionOsFlags {
  const baseFlags = getFlags();
  return {
    ...baseFlags,
    ...overrides,
  };
}
