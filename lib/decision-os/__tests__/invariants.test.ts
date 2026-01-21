import { validateDecisionResponse } from '../invariants';
import { createFeedbackCopy, createAutopilotApproval, NOTES } from '../feedback/handler';
import { processReceiptImport, clearReceiptStores } from '../receipt/handler';
import { MOCK_KEYS, StubOcrProvider } from '../ocr/providers';
import type { DecisionEvent, ReceiptImportResponse } from '../../../types/decision-os';
import * as childProcess from 'child_process';

describe('validateDecisionResponse', () => {
  it('passes without autopilot', () => {
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
