/**
 * FAST FOOD: Decision OS Invariants
 * 
 * Runtime invariant checks to ensure system never violates core principles.
 * 
 * INVARIANTS:
 * - No arrays anywhere in decision responses
 * - No hidden lists in decision_payload
 * - Single action only
 */

// =============================================================================
// DEEP ARRAY CHECK
// =============================================================================

/**
 * Recursively check if an object contains any arrays at any depth
 * 
 * @param obj - Object to check
 * @param path - Current path for error reporting
 * @returns Array of paths where arrays were found
 */
export function findArraysDeep(obj: unknown, path: string = ''): string[] {
  const arrayPaths: string[] = [];
  
  if (obj === null || obj === undefined) {
    return arrayPaths;
  }
  
  if (Array.isArray(obj)) {
    arrayPaths.push(path || 'root');
    // Also check inside the array
    obj.forEach((item, index) => {
      arrayPaths.push(...findArraysDeep(item, `${path}[${index}]`));
    });
    return arrayPaths;
  }
  
  if (typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      const newPath = path ? `${path}.${key}` : key;
      arrayPaths.push(...findArraysDeep(value, newPath));
    }
  }
  
  return arrayPaths;
}

/**
 * Assert that an object contains no arrays at any depth
 * Throws InvariantViolationError if arrays are found
 * 
 * @param obj - Object to check
 * @param context - Context string for error message (e.g., "response payload")
 * @throws InvariantViolationError if any arrays are found
 */
export function assertNoArraysDeep(obj: unknown, context: string = 'object'): void {
  const arrayPaths = findArraysDeep(obj);
  
  if (arrayPaths.length > 0) {
    throw new InvariantViolationError(
      `INVARIANT VIOLATION: Arrays found in ${context} at: ${arrayPaths.join(', ')}`
    );
  }
}

// =============================================================================
// CUSTOM ERROR CLASS
// =============================================================================

/**
 * Error thrown when a system invariant is violated
 */
export class InvariantViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvariantViolationError';
    
    // Maintain proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, InvariantViolationError);
    }
  }
}

// =============================================================================
// RESPONSE VALIDATION
// =============================================================================

export type ValidationError = {
  field: string;
  message: string;
};

export type ValidationResult = {
  valid: boolean;
  errors: ValidationError[];
};

export const DECISION_RESPONSE_ALLOWED_FIELDS = new Set([
  'decision',
  'drmRecommended',
  'reason',
  'autopilot',
]);

export const DRM_RESPONSE_ALLOWED_FIELDS = new Set([
  'drmActivated',
  'reason',
  'decision',
]);

export const FEEDBACK_RESPONSE_ALLOWED_FIELDS = new Set([
  'recorded',
  'drmRequired',
  'sessionId',
]);

export const RECEIPT_RESPONSE_ALLOWED_FIELDS = new Set([
  'receiptImportId',
  'status',
]);

export const HEALTHZ_RESPONSE_ALLOWED_FIELDS = new Set(['ok']);

export const INTERNAL_METRICS_RESPONSE_ALLOWED_FIELDS = new Set([
  'ok',
  'counters',
  'last_flush_at',
  'db_flush_ok',
]);

export const ERROR_RESPONSE_ALLOWED_FIELDS = new Set(['error']);

function toValidationResult(errors: ValidationError[]): ValidationResult {
  return {
    valid: errors.length === 0,
    errors,
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pushUnknownFieldErrors(
  obj: Record<string, unknown>,
  allowedFields: Set<string>,
  errors: ValidationError[],
  context: string
): void {
  for (const key of Object.keys(obj)) {
    if (!allowedFields.has(key)) {
      errors.push({
        field: key,
        message: `INVARIANT VIOLATION: Unknown field '${key}' in ${context}`,
      });
    }
  }
}

/**
 * Validate a decision response for all invariants
 * - No arrays anywhere
 * - decision is object or null (not array)
 * - drmRecommended is boolean
 * 
 * @param response - Response to validate
 * @returns validation result with aggregated errors
 */
export function validateDecisionResponse(response: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (typeof response !== 'object' || response === null) {
    errors.push({
      field: 'response',
      message: 'INVARIANT VIOLATION: Response must be an object',
    });
    return toValidationResult(errors);
  }
  
  const resp = response as Record<string, unknown>;

  pushUnknownFieldErrors(resp, DECISION_RESPONSE_ALLOWED_FIELDS, errors, 'decision response');
  
  // Check drmRecommended is boolean
  if (typeof resp.drmRecommended !== 'boolean') {
    errors.push({
      field: 'drmRecommended',
      message: 'INVARIANT VIOLATION: drmRecommended must be a boolean',
    });
  }
  
  // Check decision is object or null, not array
  if (!('decision' in resp)) {
    errors.push({
      field: 'decision',
      message: 'INVARIANT VIOLATION: decision must be an object or null',
    });
  } else if (resp.decision !== null) {
    if (Array.isArray(resp.decision)) {
      errors.push({
        field: 'decision',
        message: 'INVARIANT VIOLATION: decision must be a single object, not an array',
      });
    }
    if (typeof resp.decision !== 'object') {
      errors.push({
        field: 'decision',
        message: 'INVARIANT VIOLATION: decision must be an object or null',
      });
    }
  }

  if ('autopilot' in resp && typeof resp.autopilot !== 'boolean') {
    errors.push({
      field: 'autopilot',
      message: 'INVARIANT VIOLATION: autopilot must be a boolean',
    });
  }

  if ('reason' in resp && typeof resp.reason !== 'string') {
    errors.push({
      field: 'reason',
      message: 'INVARIANT VIOLATION: reason must be a string',
    });
  }
  
  // Deep check for arrays anywhere in the response
  try {
    assertNoArraysDeep(response, 'response payload');
  } catch (error) {
    errors.push({
      field: 'response',
      message: errorMessage(error),
    });
  }

  return toValidationResult(errors);
}

/**
 * Validate decision_payload before database insert
 * 
 * @param payload - Payload to validate
 * @throws InvariantViolationError on violation
 */
export function validateDecisionPayload(payload: unknown): void {
  assertNoArraysDeep(payload, 'decision_payload');
}

// =============================================================================
// SINGLE ACTION VALIDATION
// =============================================================================

/**
 * Validate that an action object has the required structure
 * and no forbidden fields
 * 
 * @param action - Action to validate
 * @throws InvariantViolationError on violation
 */
export function validateSingleAction(action: unknown): void {
  if (typeof action !== 'object' || action === null) {
    throw new InvariantViolationError(
      'INVARIANT VIOLATION: action must be an object'
    );
  }
  
  const act = action as Record<string, unknown>;
  
  // Must have decisionType
  if (!['cook', 'order', 'zero_cook'].includes(act.decisionType as string)) {
    throw new InvariantViolationError(
      'INVARIANT VIOLATION: action.decisionType must be cook, order, or zero_cook'
    );
  }
  
  // Must have decisionEventId
  if (typeof act.decisionEventId !== 'string') {
    throw new InvariantViolationError(
      'INVARIANT VIOLATION: action.decisionEventId must be a string'
    );
  }
  
  // No arrays anywhere
  assertNoArraysDeep(action, 'action');
  
  // No forbidden fields
  const forbiddenFields = [
    'options', 'alternatives', 'suggestions', 'otherMeals',
    'recommendations', 'choices', 'list', 'items'
  ];
  
  for (const field of forbiddenFields) {
    if (field in act) {
      throw new InvariantViolationError(
        `INVARIANT VIOLATION: action must not contain '${field}' field`
      );
    }
  }
}

// =============================================================================
// DRM RESPONSE VALIDATION
// =============================================================================

/**
 * Validate a DRM response for all invariants
 * - No arrays anywhere
 * - rescue is object or null (not array)
 * - exhausted is boolean
 * - drmEventId required when rescue present
 * 
 * @param response - Response to validate
 * @returns validation result with aggregated errors
 */
export function validateDrmResponse(response: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (!isPlainObject(response)) {
    errors.push({
      field: 'response',
      message: 'INVARIANT VIOLATION: DRM response must be an object',
    });
    return toValidationResult(errors);
  }
  
  const resp = response;
  // `exhausted` and `rescue` are accepted runtime fields for backward compatibility.
  const drmRuntimeAllowedFields = new Set([
    ...DRM_RESPONSE_ALLOWED_FIELDS,
    'exhausted',
    'rescue',
  ]);
  pushUnknownFieldErrors(resp, drmRuntimeAllowedFields, errors, 'DRM response');

  if (typeof resp.drmActivated !== 'boolean') {
    errors.push({
      field: 'drmActivated',
      message: 'INVARIANT VIOLATION: drmActivated must be a boolean',
    });
  }
  
  // `exhausted` is optional in API boundary contract, but type-checked when present.
  if ('exhausted' in resp && typeof resp.exhausted !== 'boolean') {
    errors.push({
      field: 'exhausted',
      message: 'INVARIANT VIOLATION: exhausted must be a boolean',
    });
  }

  if ('reason' in resp && typeof resp.reason !== 'string') {
    errors.push({
      field: 'reason',
      message: 'INVARIANT VIOLATION: reason must be a string',
    });
  }
  
  // Check decision is object or null, not array
  if ('decision' in resp && resp.decision !== null) {
    if (Array.isArray(resp.decision)) {
      errors.push({
        field: 'decision',
        message: 'INVARIANT VIOLATION: decision must be a single object, not an array',
      });
    } else if (typeof resp.decision !== 'object') {
      errors.push({
        field: 'decision',
        message: 'INVARIANT VIOLATION: decision must be an object or null',
      });
    }
  }

  // Validate legacy rescue shape when present
  if ('rescue' in resp && resp.rescue !== null && resp.rescue !== undefined) {
    if (Array.isArray(resp.rescue)) {
      errors.push({
        field: 'rescue',
        message: 'INVARIANT VIOLATION: rescue must be a single object, not an array',
      });
    } else if (typeof resp.rescue !== 'object') {
      errors.push({
        field: 'rescue',
        message: 'INVARIANT VIOLATION: rescue must be an object or null',
      });
    } else {
      try {
        validateSingleRescue(resp.rescue);
      } catch (error) {
        errors.push({
          field: 'rescue',
          message: errorMessage(error),
        });
      }
    }
  }
  
  return toValidationResult(errors);
}

/**
 * Validate a single rescue action
 * 
 * @param rescue - Rescue action to validate
 * @throws InvariantViolationError on violation
 */
export function validateSingleRescue(rescue: unknown): void {
  if (typeof rescue !== 'object' || rescue === null) {
    throw new InvariantViolationError(
      'INVARIANT VIOLATION: rescue must be an object'
    );
  }
  
  const resc = rescue as Record<string, unknown>;
  
  // Must have rescueType
  if (!['order', 'zero_cook'].includes(resc.rescueType as string)) {
    throw new InvariantViolationError(
      'INVARIANT VIOLATION: rescue.rescueType must be order or zero_cook'
    );
  }
  
  // Must have drmEventId
  if (typeof resc.drmEventId !== 'string') {
    throw new InvariantViolationError(
      'INVARIANT VIOLATION: rescue.drmEventId must be a string'
    );
  }
  
  // Must have title
  if (typeof resc.title !== 'string') {
    throw new InvariantViolationError(
      'INVARIANT VIOLATION: rescue.title must be a string'
    );
  }
  
  // Must have estMinutes
  if (typeof resc.estMinutes !== 'number') {
    throw new InvariantViolationError(
      'INVARIANT VIOLATION: rescue.estMinutes must be a number'
    );
  }
  
  // Must have contextHash
  if (typeof resc.contextHash !== 'string') {
    throw new InvariantViolationError(
      'INVARIANT VIOLATION: rescue.contextHash must be a string'
    );
  }
  
  // No arrays anywhere
  assertNoArraysDeep(rescue, 'rescue');
  
  // No forbidden fields (same as action validation)
  const forbiddenFields = [
    'options', 'alternatives', 'suggestions', 'otherMeals',
    'recommendations', 'choices', 'list', 'items', 'meals'
  ];
  
  for (const field of forbiddenFields) {
    if (field in resc) {
      throw new InvariantViolationError(
        `INVARIANT VIOLATION: rescue must not contain '${field}' field`
      );
    }
  }
}

/**
 * Validate rescue_payload before database insert
 * 
 * @param payload - Payload to validate
 * @throws InvariantViolationError on violation
 */
export function validateRescuePayload(payload: unknown): void {
  assertNoArraysDeep(payload, 'rescue_payload');
}

// =============================================================================
// GENERIC ERROR RESPONSE VALIDATION
// =============================================================================

/**
 * Validate canonical error shape used by API routes.
 * Expected shape: { error: string }
 */
export function validateErrorResponse(response: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (!isPlainObject(response)) {
    errors.push({
      field: 'response',
      message: 'INVARIANT VIOLATION: error response must be an object',
    });
    return toValidationResult(errors);
  }

  pushUnknownFieldErrors(response, ERROR_RESPONSE_ALLOWED_FIELDS, errors, 'error response');

  if (typeof response.error !== 'string' || !response.error.trim()) {
    errors.push({
      field: 'error',
      message: 'INVARIANT VIOLATION: error must be a non-empty string',
    });
  }

  return toValidationResult(errors);
}

// =============================================================================
// FEEDBACK RESPONSE VALIDATION
// =============================================================================

/**
 * Validate feedback API response.
 * Canonical success shape: { recorded: true }
 */
export function validateFeedbackResponse(response: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (!isPlainObject(response)) {
    errors.push({
      field: 'response',
      message: 'INVARIANT VIOLATION: feedback response must be an object',
    });
    return toValidationResult(errors);
  }

  pushUnknownFieldErrors(response, FEEDBACK_RESPONSE_ALLOWED_FIELDS, errors, 'feedback response');

  if (typeof response.recorded !== 'boolean') {
    errors.push({
      field: 'recorded',
      message: 'INVARIANT VIOLATION: recorded must be a boolean',
    });
  } else if (response.recorded !== true) {
    errors.push({
      field: 'recorded',
      message: 'INVARIANT VIOLATION: recorded must be true for successful feedback writes',
    });
  }

  if ('drmRequired' in response && typeof response.drmRequired !== 'boolean') {
    errors.push({
      field: 'drmRequired',
      message: 'INVARIANT VIOLATION: drmRequired must be a boolean',
    });
  }

  if ('sessionId' in response && typeof response.sessionId !== 'string') {
    errors.push({
      field: 'sessionId',
      message: 'INVARIANT VIOLATION: sessionId must be a string',
    });
  }

  return toValidationResult(errors);
}

// =============================================================================
// RECEIPT RESPONSE VALIDATION
// =============================================================================

/**
 * Validate receipt import API response.
 * Canonical success shape: { receiptImportId: string, status: 'received'|'parsed'|'failed' }
 */
export function validateReceiptImportResponse(response: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (!isPlainObject(response)) {
    errors.push({
      field: 'response',
      message: 'INVARIANT VIOLATION: receipt response must be an object',
    });
    return toValidationResult(errors);
  }

  pushUnknownFieldErrors(response, RECEIPT_RESPONSE_ALLOWED_FIELDS, errors, 'receipt response');

  if (typeof response.receiptImportId !== 'string') {
    errors.push({
      field: 'receiptImportId',
      message: 'INVARIANT VIOLATION: receiptImportId must be a string',
    });
  }

  const allowedStatuses = new Set(['received', 'parsed', 'failed']);
  if (typeof response.status !== 'string' || !allowedStatuses.has(response.status)) {
    errors.push({
      field: 'status',
      message: "INVARIANT VIOLATION: status must be one of 'received' | 'parsed' | 'failed'",
    });
  }

  return toValidationResult(errors);
}

// =============================================================================
// HEALTHZ RESPONSE VALIDATION
// =============================================================================

/**
 * Validate health endpoint response.
 * Required: { ok: boolean }
 * Optional provenance fields: buildSha, buildTime, vercelEnv, gitRef.
 */
export function validateHealthzResponse(response: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (!isPlainObject(response)) {
    errors.push({
      field: 'response',
      message: 'INVARIANT VIOLATION: healthz response must be an object',
    });
    return toValidationResult(errors);
  }

  const healthzRuntimeAllowed = new Set([
    ...HEALTHZ_RESPONSE_ALLOWED_FIELDS,
    'buildSha',
    'buildTime',
    'vercelEnv',
    'gitRef',
  ]);
  pushUnknownFieldErrors(response, healthzRuntimeAllowed, errors, 'healthz response');

  if (!('ok' in response)) {
    errors.push({
      field: 'ok',
      message: 'INVARIANT VIOLATION: ok is required',
    });
  } else if (typeof response.ok !== 'boolean') {
    errors.push({
      field: 'ok',
      message: 'INVARIANT VIOLATION: ok must be a boolean',
    });
  }

  if ('buildSha' in response && typeof response.buildSha !== 'string') {
    errors.push({
      field: 'buildSha',
      message: 'INVARIANT VIOLATION: buildSha must be a string',
    });
  }

  if ('buildTime' in response) {
    if (typeof response.buildTime !== 'string') {
      errors.push({
        field: 'buildTime',
        message: 'INVARIANT VIOLATION: buildTime must be a string',
      });
    } else if (Number.isNaN(Date.parse(response.buildTime))) {
      errors.push({
        field: 'buildTime',
        message: 'INVARIANT VIOLATION: buildTime must be a valid ISO date string',
      });
    }
  }

  if ('vercelEnv' in response && typeof response.vercelEnv !== 'string') {
    errors.push({
      field: 'vercelEnv',
      message: 'INVARIANT VIOLATION: vercelEnv must be a string',
    });
  }

  if ('gitRef' in response && typeof response.gitRef !== 'string') {
    errors.push({
      field: 'gitRef',
      message: 'INVARIANT VIOLATION: gitRef must be a string',
    });
  }

  return toValidationResult(errors);
}

// =============================================================================
// INTERNAL METRICS RESPONSE VALIDATION
// =============================================================================

/**
 * Validate internal metrics response shape.
 * Required keys: ok, counters, last_flush_at, db_flush_ok.
 */
export function validateInternalMetricsResponse(response: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (!isPlainObject(response)) {
    errors.push({
      field: 'response',
      message: 'INVARIANT VIOLATION: internal metrics response must be an object',
    });
    return toValidationResult(errors);
  }

  pushUnknownFieldErrors(
    response,
    INTERNAL_METRICS_RESPONSE_ALLOWED_FIELDS,
    errors,
    'internal metrics response'
  );

  if (!('ok' in response)) {
    errors.push({
      field: 'ok',
      message: 'INVARIANT VIOLATION: ok is required',
    });
  } else if (typeof response.ok !== 'boolean') {
    errors.push({
      field: 'ok',
      message: 'INVARIANT VIOLATION: ok must be a boolean',
    });
  }

  if (!('counters' in response)) {
    errors.push({
      field: 'counters',
      message: 'INVARIANT VIOLATION: counters is required',
    });
  } else if (!isPlainObject(response.counters)) {
    errors.push({
      field: 'counters',
      message: 'INVARIANT VIOLATION: counters must be an object',
    });
  } else {
    for (const [key, value] of Object.entries(response.counters)) {
      if (typeof value !== 'number') {
        errors.push({
          field: `counters.${key}`,
          message: 'INVARIANT VIOLATION: counters values must be numbers',
        });
      }
    }
  }

  if (!('last_flush_at' in response)) {
    errors.push({
      field: 'last_flush_at',
      message: 'INVARIANT VIOLATION: last_flush_at is required',
    });
  } else if (
    response.last_flush_at !== null &&
    typeof response.last_flush_at !== 'string'
  ) {
    errors.push({
      field: 'last_flush_at',
      message: 'INVARIANT VIOLATION: last_flush_at must be a string or null',
    });
  }

  if (!('db_flush_ok' in response)) {
    errors.push({
      field: 'db_flush_ok',
      message: 'INVARIANT VIOLATION: db_flush_ok is required',
    });
  } else if (
    response.db_flush_ok !== null &&
    typeof response.db_flush_ok !== 'boolean'
  ) {
    errors.push({
      field: 'db_flush_ok',
      message: 'INVARIANT VIOLATION: db_flush_ok must be a boolean or null',
    });
  }

  return toValidationResult(errors);
}
