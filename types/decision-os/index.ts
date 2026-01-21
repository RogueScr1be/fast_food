/**
 * Decision OS Type Definitions
 */

/**
 * Client-allowed user actions for feedback endpoint.
 * - approved: User approves the decision
 * - rejected: User rejects the decision
 * - drm_triggered: User explicitly triggers DRM (e.g., "Dinner changed")
 * - undo: User undoes an autopilot-approved decision (within 10-minute window)
 * 
 * NOTE: 'modified' is BANNED - clients cannot submit modified actions.
 * NOTE: 'expired' and 'pending' are internal-only statuses, not client actions.
 * NOTE: 'undo' is accepted from client but persisted as user_action='rejected' with notes='undo_autopilot'
 */
export type ClientUserAction = 'approved' | 'rejected' | 'drm_triggered' | 'undo';

/**
 * DB-persisted user_action values.
 * NOTE: 'undo' is NOT persisted - it maps to 'rejected' with notes='undo_autopilot'
 */
export type PersistedUserAction = 'approved' | 'rejected' | 'drm_triggered';

/**
 * Notes markers for special event types.
 */
export const NOTES_MARKERS = {
  UNDO_AUTOPILOT: 'undo_autopilot',  // Marks undo events (user_action='rejected')
  AUTOPILOT: 'autopilot',             // Marks autopilot-generated approvals
} as const;

/**
 * Decision event as stored in the DB.
 * 
 * ACTUAL DB COLUMNS (do not add phantom fields):
 * - id, user_profile_id, decided_at, actioned_at
 * - user_action: 'approved' | 'rejected' | 'drm_triggered'
 * - notes: string (markers: 'undo_autopilot', 'autopilot')
 * - decision_payload: jsonb
 * - decision_type, meal_id, context_hash
 * 
 * NON-DB FIELDS (runtime only, not persisted):
 * - status, is_autopilot, is_feedback_copy, original_event_id
 */
export interface DecisionEvent {
  // === DB COLUMNS ===
  id: string;
  user_profile_id: number;
  household_key: string; // Partition key for multi-tenant isolation
  decided_at: string; // ISO timestamp
  actioned_at?: string; // ISO timestamp when user acted
  user_action?: PersistedUserAction; // DB column: 'approved' | 'rejected' | 'drm_triggered'
  notes?: string; // Markers: 'undo_autopilot' or 'autopilot'
  decision_payload: Record<string, unknown>;
  decision_type?: string;
  meal_id?: number;
  context_hash?: string;
  
  // === RUNTIME ONLY (not persisted to DB) ===
  // These fields are used for in-memory processing but NOT written to DB
  _runtime_status?: 'pending' | 'approved' | 'rejected' | 'expired' | 'drm_triggered';
  _runtime_is_autopilot?: boolean;
  _runtime_is_feedback_copy?: boolean;
  _runtime_original_event_id?: string;
}

export interface FeedbackRequest {
  eventId: string;
  userAction: ClientUserAction; // Client can send 'undo', but it persists as 'rejected'
}

/**
 * Row to be inserted into decision_events table.
 * Contains ONLY DB columns - no runtime fields.
 */
export interface DecisionEventInsert {
  id: string;
  user_profile_id: number;
  household_key: string; // Required partition key
  decided_at: string;
  actioned_at: string;
  user_action: PersistedUserAction;
  notes?: string;
  decision_payload: Record<string, unknown>;
  decision_type: string; // Required - e.g., 'meal_decision'
  meal_id?: number;
  context_hash?: string;
}

/**
 * Decision response from the decision endpoint
 * 
 * CANONICAL CONTRACT (DO NOT ADD FIELDS):
 * - decision: object | null (the meal suggestion)
 * - drmRecommended: boolean (whether DRM should be triggered)
 * - reason?: string (explanation when decision is null or drmRecommended)
 * - autopilot?: boolean (whether autopilot was applied)
 * 
 * BANNED FIELDS (DO NOT ADD):
 * - decisionEventId (internal only)
 * - message (use reason instead)
 * - any arrays
 */
export interface DecisionResponse {
  drmRecommended: boolean;
  decision: Record<string, unknown> | null;
  autopilot?: boolean;
  reason?: string;
}

/**
 * DRM response from the drm endpoint
 * 
 * CANONICAL CONTRACT (DO NOT ADD FIELDS):
 * - drmActivated: boolean
 * 
 * BANNED FIELDS (DO NOT ADD):
 * - rescueActivated, rescueType, recorded, message
 * - any arrays
 */
export interface DrmResponse {
  drmActivated: boolean;
}

/**
 * Feedback response from the feedback endpoint
 * 
 * CANONICAL CONTRACT (DO NOT ADD FIELDS):
 * - recorded: true (always)
 * 
 * BANNED FIELDS (DO NOT ADD):
 * - eventId
 * - any arrays
 */
export interface FeedbackResponse {
  recorded: true;
}

export interface AutopilotConfig {
  enabled: boolean;
  minApprovalRate: number; // 0.0 to 1.0
  minDecisions: number;
  windowDays: number;
}

export interface ApprovalRateResult {
  rate: number;
  approved: number;
  rejected: number;
  total: number;
  eligible: boolean;
}

// =============================================================================
// RECEIPT IMPORT TYPES
// =============================================================================

/**
 * Receipt import status
 */
export type ReceiptImportStatus = 'received' | 'parsed' | 'failed';

/**
 * Receipt import response (API response shape - DO NOT CHANGE)
 */
export interface ReceiptImportResponse {
  receiptImportId: string;
  status: ReceiptImportStatus;
}

/**
 * Receipt import request
 */
export interface ReceiptImportRequest {
  imageBase64: string;
  userProfileId: number;
}

/**
 * Parsed item from receipt OCR
 */
export interface ParsedReceiptItem {
  name: string;
  price?: number;
  quantity?: number;
  confidence: number; // 0.0 to 1.0
}

/**
 * Receipt import record (DB row)
 */
export interface ReceiptImportRecord {
  id: string;
  user_profile_id: number;
  household_key: string; // Partition key for multi-tenant isolation
  created_at: string;
  status: ReceiptImportStatus;
  raw_ocr_text?: string;
  parsed_items?: ParsedReceiptItem[];
  error_message?: string;
  image_hash?: string; // For duplicate detection
}

/**
 * Inventory item (for upsert after receipt parsing)
 * 
 * DB CANONICAL COLUMNS:
 * - item_name (not 'name')
 * - remaining_qty (not 'quantity')
 * - last_seen_at (not 'updated_at')
 * - household_key (required)
 */
export interface InventoryItem {
  id: string;
  user_profile_id: number;
  household_key: string; // Partition key for multi-tenant isolation
  // Canonical columns (migration 019 normalizes these)
  item_name: string;
  remaining_qty: number;
  confidence: number;
  last_seen_at: string;
  // Legacy columns (kept for backward compatibility)
  name?: string; // Deprecated: use item_name
  quantity?: number; // Deprecated: use remaining_qty
  unit?: string;
  source?: 'receipt' | 'manual';
  receipt_import_id?: string;
  created_at?: string;
  updated_at?: string; // Deprecated: use last_seen_at
}
