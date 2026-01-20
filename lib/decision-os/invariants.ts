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

/**
 * Validate a decision response for all invariants
 * - No arrays anywhere
 * - decision is object or null (not array)
 * - drmRecommended is boolean
 * 
 * @param response - Response to validate
 * @throws InvariantViolationError on violation
 */
export function validateDecisionResponse(response: unknown): void {
  if (typeof response !== 'object' || response === null) {
    throw new InvariantViolationError(
      'INVARIANT VIOLATION: Response must be an object'
    );
  }
  
  const resp = response as Record<string, unknown>;
  
  // Check drmRecommended is boolean
  if (typeof resp.drmRecommended !== 'boolean') {
    throw new InvariantViolationError(
      'INVARIANT VIOLATION: drmRecommended must be a boolean'
    );
  }
  
  // Check decision is object or null, not array
  if (resp.decision !== null) {
    if (Array.isArray(resp.decision)) {
      throw new InvariantViolationError(
        'INVARIANT VIOLATION: decision must be a single object, not an array'
      );
    }
    if (typeof resp.decision !== 'object') {
      throw new InvariantViolationError(
        'INVARIANT VIOLATION: decision must be an object or null'
      );
    }
  }
  
  // Deep check for arrays anywhere in the response
  assertNoArraysDeep(response, 'response payload');
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
