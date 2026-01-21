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
 * 
 * Defaults:
 * - Production (NODE_ENV=production): ALL false if env var missing (fail-closed)
 * - Non-production: Master true, features true EXCEPT OCR false
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
  
  return {
    decisionOsEnabled: parseFlag(process.env.DECISION_OS_ENABLED, defaultMaster),
    autopilotEnabled: parseFlag(process.env.DECISION_AUTOPILOT_ENABLED, defaultAutopilot),
    ocrEnabled: parseFlag(process.env.DECISION_OCR_ENABLED, defaultOcr),
    drmEnabled: parseFlag(process.env.DECISION_DRM_ENABLED, defaultDrm),
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
 * Get flags for testing purposes (allows override)
 */
export function getFlagsForTest(overrides?: Partial<DecisionOsFlags>): DecisionOsFlags {
  const baseFlags = getFlags();
  return {
    ...baseFlags,
    ...overrides,
  };
}
