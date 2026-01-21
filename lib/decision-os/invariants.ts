/**
 * Decision OS Response Invariants
 * 
 * CANONICAL RESPONSE SHAPES (enforced by validators):
 * 
 * Decision: { decision: object|null, drmRecommended: boolean, reason?: string, autopilot?: boolean }
 * DRM: { drmActivated: boolean }
 * Feedback: { recorded: true }
 * Receipt Import: { receiptImportId: string, status: 'received'|'parsed'|'failed' }
 */

export interface ValidationResult {
  valid: boolean;
  errors: Array<{ field: string; message: string; value?: unknown }>;
}

/**
 * Allowed fields for each response type (single source of truth)
 */
export const DECISION_RESPONSE_ALLOWED_FIELDS = new Set(['decision', 'drmRecommended', 'reason', 'autopilot']);
export const DRM_RESPONSE_ALLOWED_FIELDS = new Set(['drmActivated']);
export const FEEDBACK_RESPONSE_ALLOWED_FIELDS = new Set(['recorded']);
export const RECEIPT_RESPONSE_ALLOWED_FIELDS = new Set(['receiptImportId', 'status']);

/**
 * Recursively checks that no arrays exist deep in an object structure.
 */
export function assertNoArraysDeep(
  obj: unknown,
  path: string = 'root'
): Array<{ field: string; message: string; value?: unknown }> {
  const errors: Array<{ field: string; message: string; value?: unknown }> = [];

  if (Array.isArray(obj)) {
    errors.push({ field: path, message: `Unexpected array at ${path}`, value: obj });
    return errors;
  }

  if (obj !== null && typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      const nestedPath = `${path}.${key}`;
      if (Array.isArray(value)) {
        errors.push({ field: nestedPath, message: `Unexpected array at ${nestedPath}`, value });
      } else if (value !== null && typeof value === 'object') {
        errors.push(...assertNoArraysDeep(value, nestedPath));
      }
    }
  }

  return errors;
}

/**
 * Check for unknown fields in response
 */
function checkUnknownFields(
  resp: Record<string, unknown>,
  allowedFields: Set<string>,
  responseName: string
): Array<{ field: string; message: string; value?: unknown }> {
  const errors: Array<{ field: string; message: string; value?: unknown }> = [];
  
  for (const key of Object.keys(resp)) {
    if (!allowedFields.has(key)) {
      errors.push({
        field: key,
        message: `Unknown field '${key}' in ${responseName} response (allowed: ${Array.from(allowedFields).join(', ')})`,
        value: resp[key],
      });
    }
  }
  
  return errors;
}

/**
 * Validates a Decision endpoint response.
 * 
 * CANONICAL CONTRACT:
 * - decision: object | null (required)
 * - drmRecommended: boolean (required)
 * - reason?: string (optional)
 * - autopilot?: boolean (optional)
 * 
 * REJECTS:
 * - decisionEventId (banned)
 * - message (banned - use reason)
 * - any unknown fields
 * - any arrays
 */
export function validateDecisionResponse(response: unknown): ValidationResult {
  const errors: Array<{ field: string; message: string; value?: unknown }> = [];

  if (response === null || typeof response !== 'object' || Array.isArray(response)) {
    errors.push({ field: 'response', message: 'Response must be a non-null object', value: response });
    return { valid: false, errors };
  }

  const resp = response as Record<string, unknown>;

  // Check for unknown fields (includes banned fields like decisionEventId, message)
  errors.push(...checkUnknownFields(resp, DECISION_RESPONSE_ALLOWED_FIELDS, 'decision'));

  // drmRecommended: required boolean
  if (!('drmRecommended' in resp)) {
    errors.push({ field: 'drmRecommended', message: 'drmRecommended is required' });
  } else if (typeof resp.drmRecommended !== 'boolean') {
    errors.push({ field: 'drmRecommended', message: 'drmRecommended must be a boolean', value: resp.drmRecommended });
  }

  // decision: required, must be object or null (NOT array)
  if (!('decision' in resp)) {
    errors.push({ field: 'decision', message: 'decision is required' });
  } else if (Array.isArray(resp.decision)) {
    errors.push({ field: 'decision', message: 'decision must be an object or null, not an array', value: resp.decision });
  } else if (resp.decision !== null && typeof resp.decision !== 'object') {
    errors.push({ field: 'decision', message: 'decision must be an object or null', value: resp.decision });
  }

  // reason: optional string
  if ('reason' in resp && resp.reason !== undefined) {
    if (typeof resp.reason !== 'string') {
      errors.push({ field: 'reason', message: 'reason must be a string if provided', value: resp.reason });
    }
  }

  // autopilot: optional boolean
  if ('autopilot' in resp && resp.autopilot !== undefined) {
    if (typeof resp.autopilot !== 'boolean') {
      errors.push({ field: 'autopilot', message: 'autopilot must be a boolean if provided', value: resp.autopilot });
    }
  }

  // Apply assertNoArraysDeep
  errors.push(...assertNoArraysDeep(resp, 'response'));

  return { valid: errors.length === 0, errors };
}

/**
 * Validates a DRM endpoint response.
 * 
 * CANONICAL CONTRACT:
 * - drmActivated: boolean (required)
 * 
 * REJECTS:
 * - rescueActivated (banned)
 * - rescueType (banned)
 * - recorded (banned)
 * - message (banned)
 * - any unknown fields
 * - any arrays
 */
export function validateDrmResponse(response: unknown): ValidationResult {
  const errors: Array<{ field: string; message: string; value?: unknown }> = [];

  if (response === null || typeof response !== 'object' || Array.isArray(response)) {
    errors.push({ field: 'response', message: 'Response must be a non-null object', value: response });
    return { valid: false, errors };
  }

  const resp = response as Record<string, unknown>;

  // Check for unknown fields
  errors.push(...checkUnknownFields(resp, DRM_RESPONSE_ALLOWED_FIELDS, 'drm'));

  // drmActivated: required boolean
  if (!('drmActivated' in resp)) {
    errors.push({ field: 'drmActivated', message: 'drmActivated is required' });
  } else if (typeof resp.drmActivated !== 'boolean') {
    errors.push({ field: 'drmActivated', message: 'drmActivated must be a boolean', value: resp.drmActivated });
  }

  // Apply assertNoArraysDeep
  errors.push(...assertNoArraysDeep(resp, 'response'));

  return { valid: errors.length === 0, errors };
}

/**
 * Validates a Feedback endpoint response.
 * 
 * CANONICAL CONTRACT:
 * - recorded: true (required, always true)
 * 
 * REJECTS:
 * - eventId (banned)
 * - any unknown fields
 * - any arrays
 */
export function validateFeedbackResponse(response: unknown): ValidationResult {
  const errors: Array<{ field: string; message: string; value?: unknown }> = [];

  if (response === null || typeof response !== 'object' || Array.isArray(response)) {
    errors.push({ field: 'response', message: 'Response must be a non-null object', value: response });
    return { valid: false, errors };
  }

  const resp = response as Record<string, unknown>;

  // Check for unknown fields
  errors.push(...checkUnknownFields(resp, FEEDBACK_RESPONSE_ALLOWED_FIELDS, 'feedback'));

  // recorded: required, must be true
  if (!('recorded' in resp)) {
    errors.push({ field: 'recorded', message: 'recorded is required' });
  } else if (resp.recorded !== true) {
    errors.push({ field: 'recorded', message: 'recorded must be true', value: resp.recorded });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates a Receipt Import endpoint response.
 * 
 * CANONICAL CONTRACT:
 * - receiptImportId: string (required)
 * - status: 'received' | 'parsed' | 'failed' (required)
 * 
 * REJECTS:
 * - any unknown fields
 * - any arrays
 */
export function validateReceiptImportResponse(response: unknown): ValidationResult {
  const errors: Array<{ field: string; message: string; value?: unknown }> = [];

  if (response === null || typeof response !== 'object' || Array.isArray(response)) {
    errors.push({ field: 'response', message: 'Response must be a non-null object', value: response });
    return { valid: false, errors };
  }

  const resp = response as Record<string, unknown>;

  // Check for unknown fields
  errors.push(...checkUnknownFields(resp, RECEIPT_RESPONSE_ALLOWED_FIELDS, 'receiptImport'));

  // receiptImportId: required string
  if (!('receiptImportId' in resp)) {
    errors.push({ field: 'receiptImportId', message: 'receiptImportId is required' });
  } else if (typeof resp.receiptImportId !== 'string') {
    errors.push({ field: 'receiptImportId', message: 'receiptImportId must be a string', value: resp.receiptImportId });
  }

  // status: required, must be one of valid values
  const validStatuses = ['received', 'parsed', 'failed'];
  if (!('status' in resp)) {
    errors.push({ field: 'status', message: 'status is required' });
  } else if (typeof resp.status !== 'string' || !validStatuses.includes(resp.status)) {
    errors.push({ 
      field: 'status', 
      message: `status must be one of: ${validStatuses.join(', ')}`, 
      value: resp.status 
    });
  }

  return { valid: errors.length === 0, errors };
}

// =============================================================================
// HEALTHZ RESPONSE VALIDATION
// =============================================================================

/**
 * Allowed fields for healthz responses
 */
export const HEALTHZ_RESPONSE_ALLOWED_FIELDS = new Set(['ok']);

/**
 * Validates a healthz endpoint response.
 * 
 * CANONICAL CONTRACT:
 * - ok: boolean (required)
 * 
 * REJECTS:
 * - any unknown fields
 * - any arrays
 * - ok not boolean
 */
export function validateHealthzResponse(response: unknown): ValidationResult {
  const errors: Array<{ field: string; message: string; value?: unknown }> = [];

  if (response === null || typeof response !== 'object' || Array.isArray(response)) {
    errors.push({ field: 'response', message: 'Response must be a non-null object', value: response });
    return { valid: false, errors };
  }

  const resp = response as Record<string, unknown>;

  // Check for unknown fields
  errors.push(...checkUnknownFields(resp, HEALTHZ_RESPONSE_ALLOWED_FIELDS, 'healthz'));

  // ok: required boolean
  if (!('ok' in resp)) {
    errors.push({ field: 'ok', message: 'ok is required' });
  } else if (typeof resp.ok !== 'boolean') {
    errors.push({ field: 'ok', message: 'ok must be a boolean', value: resp.ok });
  } else if (Array.isArray(resp.ok)) {
    errors.push({ field: 'ok', message: 'ok must not be an array', value: resp.ok });
  }

  // No arrays anywhere
  errors.push(...assertNoArraysDeep(resp, 'response'));

  return { valid: errors.length === 0, errors };
}

// =============================================================================
// INTERNAL METRICS RESPONSE VALIDATION
// =============================================================================

/**
 * Allowed fields for internal metrics responses
 */
export const INTERNAL_METRICS_RESPONSE_ALLOWED_FIELDS = new Set([
  'ok', 
  'counters', 
  'last_flush_at', 
  'db_flush_ok'
]);

/**
 * Validates an internal metrics endpoint response.
 * 
 * CANONICAL CONTRACT:
 * - ok: boolean (required)
 * - counters: object with string keys and number values only (required)
 * - last_flush_at: string | null (required) - ISO timestamp of last DB flush attempt
 * - db_flush_ok: boolean | null (required) - true if last flush succeeded, false if failed
 * 
 * REJECTS:
 * - any unknown fields
 * - any arrays
 * - non-numeric values in counters
 */
export function validateInternalMetricsResponse(response: unknown): ValidationResult {
  const errors: Array<{ field: string; message: string; value?: unknown }> = [];

  if (response === null || typeof response !== 'object' || Array.isArray(response)) {
    errors.push({ field: 'response', message: 'Response must be a non-null object', value: response });
    return { valid: false, errors };
  }

  const resp = response as Record<string, unknown>;

  // Check for unknown fields
  errors.push(...checkUnknownFields(resp, INTERNAL_METRICS_RESPONSE_ALLOWED_FIELDS, 'internalMetrics'));

  // ok: required boolean
  if (!('ok' in resp)) {
    errors.push({ field: 'ok', message: 'ok is required' });
  } else if (typeof resp.ok !== 'boolean') {
    errors.push({ field: 'ok', message: 'ok must be a boolean', value: resp.ok });
  }

  // counters: required object with number values
  if (!('counters' in resp)) {
    errors.push({ field: 'counters', message: 'counters is required' });
  } else if (resp.counters === null || typeof resp.counters !== 'object' || Array.isArray(resp.counters)) {
    errors.push({ field: 'counters', message: 'counters must be a non-null object', value: resp.counters });
  } else {
    // Validate all counter values are numbers
    const counters = resp.counters as Record<string, unknown>;
    for (const [key, value] of Object.entries(counters)) {
      if (typeof value !== 'number') {
        errors.push({ 
          field: `counters.${key}`, 
          message: `counters.${key} must be a number`, 
          value 
        });
      }
    }
  }

  // last_flush_at: required, must be string or null
  if (!('last_flush_at' in resp)) {
    errors.push({ field: 'last_flush_at', message: 'last_flush_at is required' });
  } else if (resp.last_flush_at !== null && typeof resp.last_flush_at !== 'string') {
    errors.push({ 
      field: 'last_flush_at', 
      message: 'last_flush_at must be a string or null', 
      value: resp.last_flush_at 
    });
  }

  // db_flush_ok: required, must be boolean or null
  if (!('db_flush_ok' in resp)) {
    errors.push({ field: 'db_flush_ok', message: 'db_flush_ok is required' });
  } else if (resp.db_flush_ok !== null && typeof resp.db_flush_ok !== 'boolean') {
    errors.push({ 
      field: 'db_flush_ok', 
      message: 'db_flush_ok must be a boolean or null', 
      value: resp.db_flush_ok 
    });
  }

  // No arrays anywhere
  errors.push(...assertNoArraysDeep(resp, 'response'));

  return { valid: errors.length === 0, errors };
}

// =============================================================================
// ERROR RESPONSE VALIDATION
// =============================================================================

/**
 * Allowed fields for error responses
 */
export const ERROR_RESPONSE_ALLOWED_FIELDS = new Set(['error']);

/**
 * Validates an error response.
 * 
 * Error responses are NOT required to match success contracts,
 * but must be minimal and have no arrays.
 * 
 * CANONICAL CONTRACT:
 * - error: string (required)
 */
export function validateErrorResponse(response: unknown): ValidationResult {
  const errors: Array<{ field: string; message: string; value?: unknown }> = [];

  if (response === null || typeof response !== 'object' || Array.isArray(response)) {
    errors.push({ field: 'response', message: 'Response must be a non-null object', value: response });
    return { valid: false, errors };
  }

  const resp = response as Record<string, unknown>;

  // Check for unknown fields
  errors.push(...checkUnknownFields(resp, ERROR_RESPONSE_ALLOWED_FIELDS, 'error'));

  // error: required string
  if (!('error' in resp)) {
    errors.push({ field: 'error', message: 'error is required' });
  } else if (typeof resp.error !== 'string') {
    errors.push({ field: 'error', message: 'error must be a string', value: resp.error });
  }

  // No arrays
  errors.push(...assertNoArraysDeep(resp, 'response'));

  return { valid: errors.length === 0, errors };
}
