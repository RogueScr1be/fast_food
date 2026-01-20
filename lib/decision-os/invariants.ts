/**
 * Decision OS Response Invariants
 */

export interface ValidationResult {
  valid: boolean;
  errors: Array<{ field: string; message: string; value?: unknown }>;
}

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
 * Validates a Decision endpoint response.
 * 
 * Enforces:
 * - drmRecommended must be a boolean
 * - decision must be an object or null (NOT an array)
 * - autopilot (if present and not undefined) must be a boolean
 * - No arrays deep in the response structure
 */
export function validateDecisionResponse(response: unknown): ValidationResult {
  const errors: Array<{ field: string; message: string; value?: unknown }> = [];

  if (response === null || typeof response !== 'object' || Array.isArray(response)) {
    errors.push({ field: 'response', message: 'Response must be a non-null object', value: response });
    return { valid: false, errors };
  }

  const resp = response as Record<string, unknown>;

  // drmRecommended: required boolean
  if (!('drmRecommended' in resp)) {
    errors.push({ field: 'drmRecommended', message: 'drmRecommended is required' });
  } else if (typeof resp.drmRecommended !== 'boolean') {
    errors.push({ field: 'drmRecommended', message: 'drmRecommended must be a boolean', value: resp.drmRecommended });
  }

  // decision: must be object or null (NOT array)
  if ('decision' in resp) {
    if (Array.isArray(resp.decision)) {
      errors.push({ field: 'decision', message: 'decision must be an object or null, not an array', value: resp.decision });
    } else if (resp.decision !== null && typeof resp.decision !== 'object') {
      errors.push({ field: 'decision', message: 'decision must be an object or null', value: resp.decision });
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
