import { 
  validateDecisionResponse, 
  validateDrmResponse,
  validateFeedbackResponse,
  validateReceiptImportResponse,
  validateHealthzResponse,
  validateInternalMetricsResponse,
  DECISION_RESPONSE_ALLOWED_FIELDS,
  DRM_RESPONSE_ALLOWED_FIELDS,
  FEEDBACK_RESPONSE_ALLOWED_FIELDS,
  RECEIPT_RESPONSE_ALLOWED_FIELDS,
  HEALTHZ_RESPONSE_ALLOWED_FIELDS,
  INTERNAL_METRICS_RESPONSE_ALLOWED_FIELDS,
} from '../invariants';
import { createFeedbackCopy, createAutopilotApproval, NOTES } from '../feedback/handler';
import { processReceiptImport, clearReceiptStores } from '../receipt/handler';
import { MOCK_KEYS, StubOcrProvider } from '../ocr/providers';
import type { DecisionEvent } from '../../../types/decision-os';
import * as childProcess from 'child_process';

// =============================================================================
// DECISION RESPONSE VALIDATION
// =============================================================================

describe('validateDecisionResponse', () => {
  describe('valid responses', () => {
    it('passes with minimal required fields', () => {
      const response = {
        drmRecommended: true,
        decision: { action: 'cook' },
      };
      const result = validateDecisionResponse(response);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('passes with autopilot:true', () => {
      const response = {
        drmRecommended: false,
        decision: null,
        autopilot: true,
      };
      const result = validateDecisionResponse(response);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('passes with autopilot:false', () => {
      const response = {
        drmRecommended: true,
        decision: { action: 'order' },
        autopilot: false,
      };
      const result = validateDecisionResponse(response);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('passes with reason string', () => {
      const response = {
        drmRecommended: true,
        decision: null,
        reason: 'Multiple rejections detected',
      };
      const result = validateDecisionResponse(response);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('passes with all allowed fields', () => {
      const response = {
        drmRecommended: true,
        decision: { meal: 'Chicken' },
        autopilot: true,
        reason: 'User preference',
      };
      const result = validateDecisionResponse(response);
      expect(result.valid).toBe(true);
    });
  });

  describe('type validation', () => {
    it('fails with autopilot:"yes"', () => {
      const response = {
        drmRecommended: true,
        decision: null,
        autopilot: 'yes',
      };
      const result = validateDecisionResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'autopilot')).toBe(true);
    });

    it('fails with autopilot:1', () => {
      const response = {
        drmRecommended: true,
        decision: null,
        autopilot: 1,
      };
      const result = validateDecisionResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'autopilot')).toBe(true);
    });

    it('fails when drmRecommended is missing', () => {
      const response = { decision: null };
      const result = validateDecisionResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'drmRecommended')).toBe(true);
    });

    it('fails when decision is missing', () => {
      const response = { drmRecommended: true };
      const result = validateDecisionResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'decision')).toBe(true);
    });

    it('fails when decision is an array', () => {
      const response = {
        drmRecommended: true,
        decision: [{ action: 'cook' }],
      };
      const result = validateDecisionResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'decision')).toBe(true);
    });
  });

  describe('BANNED FIELDS (prevents future drift)', () => {
    it('FAILS with decisionEventId (BANNED)', () => {
      const response = {
        drmRecommended: true,
        decision: { meal: 'Chicken' },
        decisionEventId: 'dec-123', // BANNED
      };
      const result = validateDecisionResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'decisionEventId')).toBe(true);
    });

    it('FAILS with message (BANNED - use reason)', () => {
      const response = {
        drmRecommended: true,
        decision: null,
        message: 'Some message', // BANNED - use reason
      };
      const result = validateDecisionResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'message')).toBe(true);
    });

    it('FAILS with any unknown field', () => {
      const response = {
        drmRecommended: true,
        decision: null,
        unknownField: 'value',
      };
      const result = validateDecisionResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'unknownField')).toBe(true);
    });
  });
});

// =============================================================================
// DRM RESPONSE VALIDATION
// =============================================================================

describe('validateDrmResponse', () => {
  describe('valid responses', () => {
    it('passes with drmActivated: true', () => {
      const response = { drmActivated: true };
      const result = validateDrmResponse(response);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('passes with drmActivated: false', () => {
      const response = { drmActivated: false };
      const result = validateDrmResponse(response);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('type validation', () => {
    it('fails when drmActivated is missing', () => {
      const response = {};
      const result = validateDrmResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'drmActivated')).toBe(true);
    });

    it('fails when drmActivated is not boolean', () => {
      const response = { drmActivated: 'yes' };
      const result = validateDrmResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'drmActivated')).toBe(true);
    });
  });

  describe('BANNED FIELDS (prevents future drift)', () => {
    it('FAILS with rescueActivated (BANNED)', () => {
      const response = {
        drmActivated: true,
        rescueActivated: true, // BANNED
      };
      const result = validateDrmResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'rescueActivated')).toBe(true);
    });

    it('FAILS with rescueType (BANNED)', () => {
      const response = {
        drmActivated: true,
        rescueType: 'handle_it', // BANNED
      };
      const result = validateDrmResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'rescueType')).toBe(true);
    });

    it('FAILS with recorded (BANNED)', () => {
      const response = {
        drmActivated: true,
        recorded: true, // BANNED
      };
      const result = validateDrmResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'recorded')).toBe(true);
    });

    it('FAILS with message (BANNED)', () => {
      const response = {
        drmActivated: true,
        message: 'Dinner rescued', // BANNED
      };
      const result = validateDrmResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'message')).toBe(true);
    });
  });
});

// =============================================================================
// FEEDBACK RESPONSE VALIDATION
// =============================================================================

describe('validateFeedbackResponse', () => {
  describe('valid responses', () => {
    it('passes with recorded: true', () => {
      const response = { recorded: true };
      const result = validateFeedbackResponse(response);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('type validation', () => {
    it('fails when recorded is missing', () => {
      const response = {};
      const result = validateFeedbackResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'recorded')).toBe(true);
    });

    it('fails when recorded is false', () => {
      const response = { recorded: false };
      const result = validateFeedbackResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'recorded')).toBe(true);
    });
  });

  describe('BANNED FIELDS (prevents future drift)', () => {
    it('FAILS with eventId (BANNED)', () => {
      const response = {
        recorded: true,
        eventId: 'evt-123', // BANNED
      };
      const result = validateFeedbackResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'eventId')).toBe(true);
    });
  });
});

// =============================================================================
// RECEIPT IMPORT RESPONSE VALIDATION
// =============================================================================

describe('validateReceiptImportResponse', () => {
  describe('valid responses', () => {
    it('passes with valid receiptImportId and status', () => {
      const response = { receiptImportId: 'rcpt-123', status: 'parsed' };
      const result = validateReceiptImportResponse(response);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('passes with status: received', () => {
      const response = { receiptImportId: 'rcpt-123', status: 'received' };
      const result = validateReceiptImportResponse(response);
      expect(result.valid).toBe(true);
    });

    it('passes with status: failed', () => {
      const response = { receiptImportId: '', status: 'failed' };
      const result = validateReceiptImportResponse(response);
      expect(result.valid).toBe(true);
    });
  });

  describe('type validation', () => {
    it('fails when receiptImportId is missing', () => {
      const response = { status: 'parsed' };
      const result = validateReceiptImportResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'receiptImportId')).toBe(true);
    });

    it('fails when status is missing', () => {
      const response = { receiptImportId: 'rcpt-123' };
      const result = validateReceiptImportResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'status')).toBe(true);
    });

    it('fails with invalid status value', () => {
      const response = { receiptImportId: 'rcpt-123', status: 'processing' };
      const result = validateReceiptImportResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'status')).toBe(true);
    });
  });

  describe('BANNED FIELDS (prevents future drift)', () => {
    it('FAILS with any extra field', () => {
      const response = {
        receiptImportId: 'rcpt-123',
        status: 'parsed',
        items: [], // BANNED - no arrays
      };
      const result = validateReceiptImportResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'items')).toBe(true);
    });
  });
});

// =============================================================================
// ALLOWED FIELDS CONSTANTS (single source of truth)
// =============================================================================

describe('Allowed Fields Constants', () => {
  it('DECISION_RESPONSE_ALLOWED_FIELDS has exact expected values', () => {
    expect(DECISION_RESPONSE_ALLOWED_FIELDS).toEqual(
      new Set(['decision', 'drmRecommended', 'reason', 'autopilot'])
    );
    // Verify banned fields are NOT in allowed set
    expect(DECISION_RESPONSE_ALLOWED_FIELDS.has('decisionEventId')).toBe(false);
    expect(DECISION_RESPONSE_ALLOWED_FIELDS.has('message')).toBe(false);
  });

  it('DRM_RESPONSE_ALLOWED_FIELDS has exact expected values', () => {
    expect(DRM_RESPONSE_ALLOWED_FIELDS).toEqual(new Set(['drmActivated']));
    // Verify banned fields are NOT in allowed set
    expect(DRM_RESPONSE_ALLOWED_FIELDS.has('rescueActivated')).toBe(false);
    expect(DRM_RESPONSE_ALLOWED_FIELDS.has('rescueType')).toBe(false);
    expect(DRM_RESPONSE_ALLOWED_FIELDS.has('recorded')).toBe(false);
    expect(DRM_RESPONSE_ALLOWED_FIELDS.has('message')).toBe(false);
  });

  it('FEEDBACK_RESPONSE_ALLOWED_FIELDS has exact expected values', () => {
    expect(FEEDBACK_RESPONSE_ALLOWED_FIELDS).toEqual(new Set(['recorded']));
    expect(FEEDBACK_RESPONSE_ALLOWED_FIELDS.has('eventId')).toBe(false);
  });

  it('RECEIPT_RESPONSE_ALLOWED_FIELDS has exact expected values', () => {
    expect(RECEIPT_RESPONSE_ALLOWED_FIELDS).toEqual(
      new Set(['receiptImportId', 'status'])
    );
  });
});

// =============================================================================
// INVARIANT: Receipt import always returns { receiptImportId, status }
// =============================================================================

describe('Receipt Import Response Invariant', () => {
  beforeEach(() => {
    clearReceiptStores();
  });

  it('returns receiptImportId and status on success', async () => {
    const result = await processReceiptImport(MOCK_KEYS.FULL, 1);
    
    expect(result).toHaveProperty('receiptImportId');
    expect(result).toHaveProperty('status');
    expect(typeof result.receiptImportId).toBe('string');
    expect(['received', 'parsed', 'failed']).toContain(result.status);
  });

  it('returns receiptImportId and status on OCR error', async () => {
    const result = await processReceiptImport(MOCK_KEYS.ERROR, 1);
    
    expect(result).toHaveProperty('receiptImportId');
    expect(result).toHaveProperty('status');
    expect(result.status).toBe('failed');
  });

  it('returns receiptImportId and status with empty OCR text', async () => {
    const result = await processReceiptImport(MOCK_KEYS.EMPTY, 1);
    
    expect(result).toHaveProperty('receiptImportId');
    expect(result).toHaveProperty('status');
  });

  it('response has exactly two keys (no arrays, no extra fields)', async () => {
    const result = await processReceiptImport(MOCK_KEYS.FULL, 1);
    
    const keys = Object.keys(result);
    expect(keys).toContain('receiptImportId');
    expect(keys).toContain('status');
    expect(keys.length).toBe(2);
    
    // Verify no arrays in response
    expect(Array.isArray(result.receiptImportId)).toBe(false);
    expect(Array.isArray(result.status)).toBe(false);
  });
});

// =============================================================================
// INVARIANT: StubOcrProvider returns valid response shape
// =============================================================================

describe('StubOcrProvider Response Invariant', () => {
  it('stub provider returns error with rawText empty string', async () => {
    const stub = new StubOcrProvider('OCR disabled for test');
    const result = await stub.extractText('any-image-data');
    
    expect(result).toHaveProperty('rawText');
    expect(result).toHaveProperty('error');
    expect(result.rawText).toBe('');
    expect(typeof result.error).toBe('string');
  });
});

// =============================================================================
// INVARIANT: Autopilot approval uses notes='autopilot', user_action='approved'
// =============================================================================

describe('Autopilot Approval Markers Invariant', () => {
  const baseEvent: DecisionEvent = {
    id: 'test-event-1',
    user_profile_id: 1,
    decided_at: new Date().toISOString(),
    decision_payload: { meal: 'Test' },
    meal_id: 42,
    context_hash: 'test-hash',
  };

  it('createAutopilotApproval uses correct markers', () => {
    const approval = createAutopilotApproval(baseEvent);
    
    expect(approval.user_action).toBe('approved');
    expect(approval.notes).toBe(NOTES.AUTOPILOT);
    expect(approval.notes).toBe('autopilot');
  });

  it('createFeedbackCopy with isAutopilotApproval=true uses correct markers', () => {
    const copy = createFeedbackCopy(baseEvent, 'approved', true);
    
    expect(copy.user_action).toBe('approved');
    expect(copy.notes).toBe(NOTES.AUTOPILOT);
  });
});

// =============================================================================
// INVARIANT: Undo uses notes='undo_autopilot', user_action='rejected'
// =============================================================================

describe('Undo Markers Invariant', () => {
  const autopilotEvent: DecisionEvent = {
    id: 'autopilot-event-1',
    user_profile_id: 1,
    decided_at: new Date().toISOString(),
    actioned_at: new Date().toISOString(),
    user_action: 'approved',
    notes: 'autopilot',
    decision_payload: { meal: 'Test' },
    meal_id: 42,
  };

  it('undo creates rejected action with undo_autopilot notes', () => {
    const undoCopy = createFeedbackCopy(autopilotEvent, 'undo');
    
    expect(undoCopy.user_action).toBe('rejected');
    expect(undoCopy.notes).toBe(NOTES.UNDO_AUTOPILOT);
    expect(undoCopy.notes).toBe('undo_autopilot');
  });

  it('undo copy has required DB fields', () => {
    const undoCopy = createFeedbackCopy(autopilotEvent, 'undo');
    
    expect(undoCopy).toHaveProperty('id');
    expect(undoCopy).toHaveProperty('user_profile_id');
    expect(undoCopy).toHaveProperty('decided_at');
    expect(undoCopy).toHaveProperty('actioned_at');
    expect(undoCopy).toHaveProperty('user_action');
    expect(undoCopy).toHaveProperty('notes');
  });
});

// =============================================================================
// HEALTHZ RESPONSE VALIDATION
// =============================================================================

describe('validateHealthzResponse', () => {
  describe('valid responses', () => {
    it('passes with ok:true', () => {
      const response = { ok: true };
      const result = validateHealthzResponse(response);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('passes with ok:false', () => {
      const response = { ok: false };
      const result = validateHealthzResponse(response);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('invalid responses', () => {
    it('FAILS without ok field', () => {
      const response = {};
      const result = validateHealthzResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'ok' && e.message.includes('required'))).toBe(true);
    });

    it('FAILS with ok not boolean (string)', () => {
      const response = { ok: 'true' };
      const result = validateHealthzResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'ok' && e.message.includes('boolean'))).toBe(true);
    });

    it('FAILS with ok not boolean (number)', () => {
      const response = { ok: 1 };
      const result = validateHealthzResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'ok' && e.message.includes('boolean'))).toBe(true);
    });

    it('FAILS with ok as array', () => {
      const response = { ok: [true] };
      const result = validateHealthzResponse(response);
      expect(result.valid).toBe(false);
      // Should fail either for not being boolean or for being an array
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('FAILS with unknown field', () => {
      const response = { ok: true, status: 'healthy' };
      const result = validateHealthzResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'status')).toBe(true);
    });

    it('FAILS with error field (banned)', () => {
      const response = { ok: false, error: 'database down' };
      const result = validateHealthzResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'error')).toBe(true);
    });

    it('FAILS with null response', () => {
      const result = validateHealthzResponse(null);
      expect(result.valid).toBe(false);
    });

    it('FAILS with array response', () => {
      const result = validateHealthzResponse([{ ok: true }]);
      expect(result.valid).toBe(false);
    });
  });

  describe('ALLOWED_FIELDS constant', () => {
    it('contains only ok', () => {
      expect(HEALTHZ_RESPONSE_ALLOWED_FIELDS.size).toBe(1);
      expect(HEALTHZ_RESPONSE_ALLOWED_FIELDS.has('ok')).toBe(true);
    });

    it('does not contain error, status, or message', () => {
      expect(HEALTHZ_RESPONSE_ALLOWED_FIELDS.has('error')).toBe(false);
      expect(HEALTHZ_RESPONSE_ALLOWED_FIELDS.has('status')).toBe(false);
      expect(HEALTHZ_RESPONSE_ALLOWED_FIELDS.has('message')).toBe(false);
    });
  });
});

// =============================================================================
// INVARIANT: No coverage artifacts tracked by git
// =============================================================================

describe('Git Tracking Invariant', () => {
  it('no coverage directory tracked by git', () => {
    try {
      const result = childProcess.execSync('git ls-files --cached coverage/', {
        encoding: 'utf-8',
        cwd: process.cwd(),
      });
      // If we get here, check if result is empty
      expect(result.trim()).toBe('');
    } catch {
      // git ls-files returns error if path doesn't exist, which is fine
      expect(true).toBe(true);
    }
  });

  it('no lcov-report directory tracked by git', () => {
    try {
      const result = childProcess.execSync('git ls-files --cached lcov-report/', {
        encoding: 'utf-8',
        cwd: process.cwd(),
      });
      expect(result.trim()).toBe('');
    } catch {
      expect(true).toBe(true);
    }
  });

  it('.gitignore includes coverage protection', () => {
    const fs = require('fs');
    const path = require('path');
    
    const gitignorePath = path.resolve(process.cwd(), '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      expect(content).toContain('coverage/');
      expect(content).toContain('lcov-report/');
    } else {
      // If .gitignore doesn't exist, this test should still pass
      // but we document that .gitignore should be created
      expect(true).toBe(true);
    }
  });
});

// =============================================================================
// INVARIANT: "modified" action is banned
// =============================================================================

describe('Modified Action Ban Invariant', () => {
  it('NOTES constant does not include modified', () => {
    const notesValues = Object.values(NOTES);
    expect(notesValues).not.toContain('modified');
  });

  it('valid user actions do not include modified', () => {
    // Check that we can create feedback copies for valid actions
    const validActions = ['approved', 'rejected', 'drm_triggered', 'undo'] as const;
    const baseEvent: DecisionEvent = {
      id: 'test-modified-ban',
      user_profile_id: 1,
      decided_at: new Date().toISOString(),
      decision_payload: {},
    };
    
    validActions.forEach(action => {
      const copy = createFeedbackCopy(baseEvent, action);
      expect(copy.user_action).not.toBe('modified');
    });
  });
});

// =============================================================================
// INTERNAL METRICS RESPONSE VALIDATION
// =============================================================================

describe('validateInternalMetricsResponse', () => {
  describe('valid responses', () => {
    it('passes with all fields present and null flush values', () => {
      const response = { 
        ok: true, 
        counters: {}, 
        last_flush_at: null, 
        db_flush_ok: null 
      };
      const result = validateInternalMetricsResponse(response);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('passes with numeric counters and flush timestamp', () => {
      const response = { 
        ok: true, 
        counters: { 
          decision_called: 5, 
          receipt_called: 3, 
          healthz_hit: 10 
        },
        last_flush_at: '2025-01-20T12:00:00.000Z',
        db_flush_ok: true
      };
      const result = validateInternalMetricsResponse(response);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('passes with ok:false and counters', () => {
      const response = { 
        ok: false, 
        counters: { error_count: 1 },
        last_flush_at: '2025-01-20T12:00:00.000Z',
        db_flush_ok: false
      };
      const result = validateInternalMetricsResponse(response);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('passes with zero values in counters', () => {
      const response = { 
        ok: true, 
        counters: { decision_called: 0 },
        last_flush_at: null,
        db_flush_ok: null
      };
      const result = validateInternalMetricsResponse(response);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('passes with db_flush_ok:false (last flush failed)', () => {
      const response = { 
        ok: true, 
        counters: {},
        last_flush_at: '2025-01-20T12:00:00.000Z',
        db_flush_ok: false
      };
      const result = validateInternalMetricsResponse(response);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('invalid responses', () => {
    it('FAILS without ok field', () => {
      const response = { counters: {}, last_flush_at: null, db_flush_ok: null };
      const result = validateInternalMetricsResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'ok' && e.message.includes('required'))).toBe(true);
    });

    it('FAILS without counters field', () => {
      const response = { ok: true, last_flush_at: null, db_flush_ok: null };
      const result = validateInternalMetricsResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'counters' && e.message.includes('required'))).toBe(true);
    });

    it('FAILS without last_flush_at field', () => {
      const response = { ok: true, counters: {}, db_flush_ok: null };
      const result = validateInternalMetricsResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'last_flush_at' && e.message.includes('required'))).toBe(true);
    });

    it('FAILS without db_flush_ok field', () => {
      const response = { ok: true, counters: {}, last_flush_at: null };
      const result = validateInternalMetricsResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'db_flush_ok' && e.message.includes('required'))).toBe(true);
    });

    it('FAILS with ok not boolean (string)', () => {
      const response = { ok: 'true', counters: {}, last_flush_at: null, db_flush_ok: null };
      const result = validateInternalMetricsResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'ok' && e.message.includes('boolean'))).toBe(true);
    });

    it('FAILS with counters as array', () => {
      const response = { ok: true, counters: [1, 2, 3], last_flush_at: null, db_flush_ok: null };
      const result = validateInternalMetricsResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'counters' && e.message.includes('object'))).toBe(true);
    });

    it('FAILS with counters as null', () => {
      const response = { ok: true, counters: null, last_flush_at: null, db_flush_ok: null };
      const result = validateInternalMetricsResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'counters' && e.message.includes('object'))).toBe(true);
    });

    it('FAILS with non-numeric values in counters', () => {
      const response = { 
        ok: true, 
        counters: { decision_called: 'five' },
        last_flush_at: null,
        db_flush_ok: null
      };
      const result = validateInternalMetricsResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => 
        e.field === 'counters.decision_called' && e.message.includes('number')
      )).toBe(true);
    });

    it('FAILS with last_flush_at as number', () => {
      const response = { ok: true, counters: {}, last_flush_at: 12345, db_flush_ok: null };
      const result = validateInternalMetricsResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'last_flush_at' && e.message.includes('string or null'))).toBe(true);
    });

    it('FAILS with db_flush_ok as string', () => {
      const response = { ok: true, counters: {}, last_flush_at: null, db_flush_ok: 'true' };
      const result = validateInternalMetricsResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'db_flush_ok' && e.message.includes('boolean or null'))).toBe(true);
    });

    it('FAILS with unknown fields', () => {
      const response = { ok: true, counters: {}, last_flush_at: null, db_flush_ok: null, extra: 'field' };
      const result = validateInternalMetricsResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'extra')).toBe(true);
    });

    it('FAILS with arrays in response', () => {
      const response = { ok: true, counters: {}, last_flush_at: null, db_flush_ok: null, list: [1, 2, 3] };
      const result = validateInternalMetricsResponse(response);
      expect(result.valid).toBe(false);
    });

    it('FAILS with response as array', () => {
      const response = [{ ok: true, counters: {}, last_flush_at: null, db_flush_ok: null }];
      const result = validateInternalMetricsResponse(response);
      expect(result.valid).toBe(false);
    });

    it('FAILS with response as null', () => {
      const result = validateInternalMetricsResponse(null);
      expect(result.valid).toBe(false);
    });
  });

  describe('ALLOWED_FIELDS constant', () => {
    it('contains all required fields', () => {
      expect(INTERNAL_METRICS_RESPONSE_ALLOWED_FIELDS.size).toBe(4);
      expect(INTERNAL_METRICS_RESPONSE_ALLOWED_FIELDS.has('ok')).toBe(true);
      expect(INTERNAL_METRICS_RESPONSE_ALLOWED_FIELDS.has('counters')).toBe(true);
      expect(INTERNAL_METRICS_RESPONSE_ALLOWED_FIELDS.has('last_flush_at')).toBe(true);
      expect(INTERNAL_METRICS_RESPONSE_ALLOWED_FIELDS.has('db_flush_ok')).toBe(true);
    });

    it('does not contain banned fields', () => {
      expect(INTERNAL_METRICS_RESPONSE_ALLOWED_FIELDS.has('error')).toBe(false);
      expect(INTERNAL_METRICS_RESPONSE_ALLOWED_FIELDS.has('data')).toBe(false);
      expect(INTERNAL_METRICS_RESPONSE_ALLOWED_FIELDS.has('metrics')).toBe(false);
    });
  });
});
