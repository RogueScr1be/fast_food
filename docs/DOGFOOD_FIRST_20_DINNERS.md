# First 20 Dinners — Dogfood Protocol

This document defines the exact testing protocol for the Fast Food MVP's first 20 dinners.

## Goal

Prove the MVP works for its core use case:
> A user can open the app at ~5pm, provide minimal intent, receive one dinner decision, execute it immediately, or be rescued automatically by DRM.

---

## Daily Test Script (<3 minutes)

Perform this test once per day during the dogfood period.

### Step 1: Open App (0:00)

- Launch Fast Food
- Note the current time
- **Expected**: Tonight screen loads, shows intent buttons

### Step 2: Select Intent (0:15)

- Tap 0-2 intent buttons (easy, cheap, no energy, quick)
- Tap "Decide for me"
- **Expected**: Loading indicator, then single decision card

### Step 3: Evaluate Decision (0:45)

Look at the decision shown. Does it:
- Show exactly ONE meal option?
- Display time estimate?
- Display cost estimate?
- Show "Let's do it" button (green/primary)?
- Show "Not tonight" button (small/secondary)?

### Step 4: Approve (Normal Path) (1:00)

- Tap "Let's do it"
- **Expected**: Navigate to Execute screen with steps
- **Expected**: Max 7 steps shown

### Step 5: Record Outcome (1:30)

Log the following in your tracking sheet:
- Date
- Time started
- Dinner happened? (yes/no)
- Decision executable? (yes/no)
- Annoyance score (1-5)

---

## Weekly Scenarios

In addition to daily tests, perform these scenarios once per week.

### Scenario A: Reject Twice (DRM Test)

1. Open app at ~5pm
2. Tap "Decide for me"
3. Tap "Not tonight" (first rejection)
4. Wait for new decision
5. Tap "Not tonight" (second rejection)
6. **Expected**: Automatic redirect to Rescue screen
7. **Expected**: DRM shows fallback decision with "Okay" button
8. **Expected**: No choices presented (DRM has absolute authority)

Record:
- DRM rescue decisive? (yes/no)
- Fallback was acceptable? (yes/no)

### Scenario B: Explicit "I'm Done"

1. Open app at ~5pm
2. Navigate to Rescue screen (via QA panel or after rejections)
3. Tap "This isn't working" button
4. **Expected**: DRM activates with fallback decision
5. **Expected**: No questions asked

Record:
- Explicit DRM worked? (yes/no)

### Scenario C: Time Threshold (After 6:15pm)

1. Open app after 6:15pm local time
2. Tap "Decide for me"
3. **Expected**: Either normal decision OR DRM rescue (time threshold may trigger)

Record:
- App behavior after 6:15pm (normal/rescue)

---

## Success Criteria

These are the baseline targets for the first 20 dinners:

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Time-to-decision | < 180 seconds | Stopwatch from app open to "Let's do it" tap |
| Acceptance rate | 50-70% | % of sessions that end in "accepted" (not rejected/rescued) |
| DRM rate | Track only | % of sessions that end in "rescued" (no hard target yet) |
| Crash rate | 0% | App should never crash on Tonight/Decision/Execute |
| Multiple options shown | 0 | NEVER show more than 1 decision |

### Detailed Metrics

**Time-to-decision breakdown:**
- App launch: <2s
- Decision API response: <3s
- Total user interaction: <180s

**Quality checks:**
- Decision always includes execution_payload
- DRM always produces a fallback (never fails)
- Execute screen shows max 7 steps

---

## What to Record

For each dinner, log:

| Field | Values | Description |
|-------|--------|-------------|
| Date | YYYY-MM-DD | Test date |
| Time | HH:MM | When you started |
| Intent | easy/cheap/no_energy/quick | What buttons you tapped |
| Outcome | accepted/rejected/rescued | How session ended |
| Dinner happened? | yes/no | Did you actually eat the meal? |
| Decision executable? | yes/no | Could you actually make/order the meal? |
| DRM decisive? | yes/no/na | If rescued, was DRM helpful? |
| Annoyance | 1-5 | 1=seamless, 5=frustrated |
| Notes | freetext | Any issues or observations |

### Template (Copy to Spreadsheet)

```
Date,Time,Intent,Outcome,Dinner Happened,Executable,DRM Decisive,Annoyance,Notes
2025-01-20,17:30,easy,accepted,yes,yes,na,1,Perfect flow
2025-01-21,18:00,cheap quick,rescued,yes,yes,yes,2,DRM picked cereal which was fine
```

---

## Escalation & Rollback Criteria

**Immediate rollback/disable if ANY of these occur TWICE in a day:**

| Issue | Description | Action |
|-------|-------------|--------|
| Multiple options shown | User sees >1 meal choice | Rollback build |
| DRM fails | DRM endpoint returns no decision | Rollback build |
| Session stuck | No navigation (frozen screen) | Rollback build |
| Repeated crashes | Crash on Tonight/Decision/Execute | Rollback build |

### How to Rollback

1. **Server-side (preferred):**
   - Set `ff_mvp_enabled=false` in runtime_flags table (Supabase)
   - Effect: App shows "temporarily unavailable" message
   - Takes effect within 30 seconds

2. **Client-side (if server unreachable):**
   - Set `EXPO_PUBLIC_FF_MVP_ENABLED=false` in EAS secrets
   - Rebuild and redeploy via TestFlight
   - Users must update app

3. **Emergency freeze (all endpoints):**
   - Set `decision_os_enabled=false` in runtime_flags
   - All Decision OS endpoints return 401

---

## QA Panel Access

Hidden QA panel is available for debugging:

1. On Tonight screen, **long-press the title "What sounds good tonight?" for 2 seconds**
2. QA Panel opens with:
   - Current environment (API URL, build profile)
   - Quick actions (Force DRM, Reset Session)
   - Last 10 API events (endpoint, status, time)

**Use QA Panel for:**
- Verifying API connectivity
- Force-triggering DRM to test rescue flow
- Checking recent API calls if something seems wrong

---

## Pre-Dinner Checklist

Before each test:

- [ ] Phone charged
- [ ] Internet connection stable
- [ ] App is latest TestFlight version
- [ ] Tracking sheet ready

---

## Post-Dinner Notes

After each test, note:

1. **What went well?**
2. **What was confusing?**
3. **Would you use this instead of thinking about dinner yourself?**

---

## Contact for Issues

If you encounter a critical issue:

1. Take a screenshot
2. Note exact time
3. Open QA panel and screenshot the event log
4. Report via [your team's communication channel]

Do NOT:
- Try to "fix" the issue yourself
- Continue testing if the app is broken
- Ignore repeated failures
