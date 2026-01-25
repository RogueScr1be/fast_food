# Fast Food Fork Guardrails

This document defines the constraints and guardrails for the Decision OS implementation.

## API Response Shape Constraints

1. **No Arrays Deep**: All API responses must pass `assertNoArraysDeep` validation.
2. **Feedback Response**: Always exactly `{ recorded: true }` - no exceptions.
3. **Decision Response**: Object with `drmRecommended`, `decision`, and optional `autopilot` boolean.

## User Action Constraints

### Allowed Client Actions
- `approved` - User approves the decision
- `rejected` - User rejects the decision  
- `drm_triggered` - User explicitly triggers DRM (e.g., "Dinner changed")
- `undo` - User undoes an autopilot-approved decision (within 10-minute window)

### Banned Actions
- `modified` - **BANNED** - Clients cannot submit modified actions

### Internal-Only Statuses (Not Client Actions)
- `pending` - Decision is awaiting user action
- `expired` - Decision window has passed

## Taste Graph Weight Semantics

| Action/Status | Base Weight | Meaning |
|--------------|-------------|---------|
| `approved` | +1.0 | Positive taste signal |
| `rejected` | -1.0 | Negative taste signal |
| `drm_triggered` | -0.5 | Mild negative, user changed plans |
| `expired` | -0.2 | Very mild negative, no engagement |
| `undo` | **-0.5** | **AUTONOMY PENALTY, not taste rejection** |

### Undo Weight Semantics

**Undo is an autonomy penalty (-0.5) and does not reduce taste scores.**

The user may actually like the food choice; they just didn't want it auto-applied this time. Using -0.5 (same as `drm_triggered`) instead of -1.0 (full rejection) preserves this distinction.

Undo behavior:
- Inserts `taste_signal` with weight -0.5 (autonomy penalty)
- Does NOT update `taste_meal_scores` (score/approvals/rejections unchanged)
- This slows autopilot without changing meal preferences

### Stress Multiplier

After 8pm local time, weight magnitude is multiplied by 1.10 to reflect dinner-time stress. Final weights are clamped to [-2, 2].

Examples:
- `undo` before 8pm: -0.5
- `undo` after 8pm: -0.55

## Undo Behavior

1. **Window**: 10 minutes from autopilot action
2. **Eligibility**: Only autopilot-approved events can be undone (notes='autopilot')
3. **Append-Only**: Creates new `decision_events` row with:
   - `user_action = 'rejected'` (NOT 'undo')
   - `notes = 'undo_autopilot'` (this is the only undo marker)
4. **Idempotency**: Multiple undo requests create only one undo copy
5. **Consumption**: v1 does NOT reverse consumption (documented limitation)
6. **Throttles Autopilot**: Recent undo (within 72h) blocks autopilot (reason: 'recent_undo')

**Undo is persisted as `user_action='rejected'` with `notes='undo_autopilot'`.**

## Autopilot Behavior

1. **Approval Marker**: Autopilot approvals are marked via `notes='autopilot'` on the feedback-copy row
2. **Double-Learn Prevention**: If autopilot already approved, later client approval is no-op
3. **Throttling**: Recent undo (72h window) blocks autopilot eligibility
4. **Approval Rate**: Undo events are EXCLUDED from approval rate calculation

**Autopilot approvals are marked via `notes='autopilot'` on the feedback-copy row.**

## DB Column Mapping (Schema-True)

**ACTUAL DB COLUMNS** (no phantom fields):

| Column | Description |
|--------|-------------|
| `id` | Unique event ID |
| `user_profile_id` | User's profile ID |
| `decided_at` | ISO timestamp when decision was made |
| `actioned_at` | ISO timestamp when user acted (required for feedback) |
| `user_action` | `'approved'` \| `'rejected'` \| `'drm_triggered'` |
| `notes` | `'undo_autopilot'` or `'autopilot'` |
| `decision_payload` | JSON payload |
| `decision_type` | Type of decision |
| `meal_id` | Meal ID |
| `context_hash` | Context hash |

**NON-DB FIELDS** (runtime only, prefixed with `_runtime_`):
- `_runtime_status`, `_runtime_is_autopilot`, `_runtime_is_feedback_copy`, `_runtime_original_event_id`

These are used for in-memory processing but NOT written to DB.
