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

**Undo is an autonomy penalty signal (-0.5), not a taste rejection.**

The user may actually like the food choice; they just didn't want it auto-applied this time. Using -0.5 (same as `drm_triggered`) instead of -1.0 (full rejection) preserves this distinction.

### Stress Multiplier

After 8pm local time, weight magnitude is multiplied by 1.10 to reflect dinner-time stress. Final weights are clamped to [-2, 2].

Examples:
- `undo` before 8pm: -0.5
- `undo` after 8pm: -0.55

## Undo Behavior

1. **Window**: 10 minutes from autopilot action
2. **Eligibility**: Only autopilot-approved events can be undone
3. **Append-Only**: Creates new `decision_events` row with:
   - `user_action = 'undo'`
   - `status = 'rejected'`
   - `notes = 'undo_autopilot'`
   - `is_autopilot = false`
4. **Idempotency**: Multiple undo requests create only one undo copy
5. **Consumption**: v1 does NOT reverse consumption (documented limitation)

## DB Column Mapping

When processing feedback, ensure these columns are set correctly:

| Field | Description |
|-------|-------------|
| `user_action` | The client's submitted action (approved/rejected/drm_triggered/undo) |
| `status` | Internal status for DB queries (maps from user_action) |
| `is_autopilot` | `false` for all user-submitted feedback (including undo) |
| `notes` | `'undo_autopilot'` for undo actions |
| `actioned_at` | ISO timestamp when user acted (required) |
| `decided_at` | Copied from original event |
