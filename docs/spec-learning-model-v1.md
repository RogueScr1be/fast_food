# Learning Model v1 — Mathematical Specification

**Version:** `LEARNING_MODEL_VERSION = 1`
**Status:** Spec only. No code.

---

## Inputs

```
feedbackEntries: Array<{
  mealId:    string
  rating:    -1 | 0 | +1
  timestamp: number        // ms since epoch
  mode?:     'fancy' | 'easy' | 'cheap'
  isRescue?: boolean
  source?:   'chooseForMe' | 'swipeAccept'
}>

recentDeals: string[]      // ordered list of mealIds dealt this session (most recent last)
now:         number         // current time (ms since epoch), default Date.now()
```

## Output

```
weights: Map<string, number>   // mealId → weight (only meals WITH feedback)
```

Meals without any feedback entry are **absent** from the map.
At selection time, absent meals receive `DEFAULT_WEIGHT = 1.0`.

---

## Step 1: Rating Delta

Each feedback rating maps to a fixed numeric delta:

| Rating | Semantic | Delta (δ) |
|--------|----------|-----------|
| +1 | "Loved it" | +1.0 |
| 0 | "It was fine" | 0.0 |
| -1 | "Not great" | -0.6 |

**Justification:**
- Neutral at 0.0 means "baseline, no boost, no penalty." A completed-and-rated-fine meal behaves identically to an unrated meal in selection probability, but the system knows the user tried it.
- Negative at -0.6 (not -1.0) is asymmetric: one positive (+1.0) nearly cancels one negative (-0.6), keeping the meal viable. Two positives fully recover from one negative (+2.0 - 0.6 = +1.4). This prevents single bad experiences from permanently burying meals.
- Positive at +1.0 is the strongest single signal. Combined with the max-weight cap, a meal can't dominate indefinitely.

---

## Step 2: Time Decay

Each feedback entry's delta is multiplied by an exponential decay factor based on its age:

```
decay(entry) = 0.5 ^ (daysSinceEntry / HALF_LIFE_DAYS)

where:
  daysSinceEntry = (now - entry.timestamp) / 86_400_000
  HALF_LIFE_DAYS = 30
```

| Age | Decay Factor |
|-----|-------------|
| 0 days (today) | 1.000 |
| 1 day | 0.977 |
| 7 days | 0.851 |
| 14 days | 0.724 |
| 30 days | 0.500 |
| 60 days | 0.250 |
| 90 days | 0.125 |

**Justification:** 30-day half-life means recent feedback dominates, but old feedback doesn't vanish instantly. A meal disliked 2 months ago carries only 25% of its original penalty — the user's taste may have changed. Simple exponential decay is deterministic, monotonic, and trivially computed.

---

## Step 3: Per-Meal Score

For each meal with at least one feedback entry, compute:

```
score(mealId) = Σ  δ(entry.rating) × decay(entry)
                for each entry where entry.mealId === mealId
```

Currently `logFeedback` is idempotent per mealId (one entry per meal). So in practice:

```
score(mealId) = δ(rating) × decay(entry)    // single entry
```

If the model later allows re-rating, the sum handles multiple entries naturally.

---

## Step 4: Raw Weight

Convert score to a weight centered on 1.0:

```
rawWeight(mealId) = 1.0 + score(mealId)
```

| Scenario | Score | Raw Weight |
|----------|-------|------------|
| Just liked (+1, today) | +1.0 | 2.0 |
| Just neutral (0, today) | 0.0 | 1.0 |
| Just disliked (-1, today) | -0.6 | 0.4 |
| Liked 30 days ago | +0.5 | 1.5 |
| Disliked 30 days ago | -0.3 | 0.7 |
| Disliked 90 days ago | -0.075 | 0.925 |
| No feedback | (absent) | (DEFAULT_WEIGHT = 1.0 at selection) |

---

## Step 5: Clamp

Clamp the raw weight to a sane range:

```
weight(mealId) = clamp(rawWeight, MIN_WEIGHT, MAX_WEIGHT)

MIN_WEIGHT = 0.15
MAX_WEIGHT = 3.0
```

**MIN_WEIGHT = 0.15:** A disliked meal retains at least 15% of baseline weight. In a mode with 6 meals where 5 are at weight 1.0 and 1 is at 0.15, the disliked meal has probability `0.15 / 5.15 ≈ 2.9%`. Not zero, but rare.

**MAX_WEIGHT = 3.0:** Prevents a single loved meal from dominating. In the same 6-meal mode with one at 3.0 and five at 1.0, the loved meal has probability `3.0 / 8.0 = 37.5%`. Strong preference, not monopoly.

---

## Step 6: Cooldown Penalty

Meals dealt recently in this session receive a weight multiplier to suppress immediate repeats:

```
COOLDOWN_WINDOW = 3        // look back this many deals
COOLDOWN_MULTIPLIER = 0.3  // reduce weight to 30%

if mealId is in recentDeals[-COOLDOWN_WINDOW:]:
  weight *= COOLDOWN_MULTIPLIER
  weight = max(weight, MIN_WEIGHT)  // re-clamp after penalty
```

**Justification:** With only 6 meals per mode, uniform random produces a same-meal repeat ~17% of the time. The cooldown makes it ~3% without banning. The penalty is session-scoped (recentDeals resets each session), so a meal avoided in one session isn't penalized next time.

**N=3 and multiplier=0.3 reasoning:**
- 3 is half the pool size (6 meals per mode). Penalizing more would leave too few unpunished candidates.
- 0.3 reduces without eliminating. A liked meal (weight 2.0) after cooldown becomes 0.6 — below baseline but still above MIN_WEIGHT.

---

## Step 7: Selection

At selection time in `pickNext()`:

```
EXPLORE_RATE = 0.15   // 15% chance of uniform random per draw

if Math.random() < EXPLORE_RATE:
  return uniformRandomPick(candidates)

// Weighted random:
for each candidate:
  w = weights.get(candidate.id) ?? DEFAULT_WEIGHT    // 1.0 for unrated
  // cooldown already applied in computeWeights if applicable

totalWeight = sum of all w
roll = Math.random() * totalWeight
accumulate w until roll ≤ 0 → that candidate is picked
```

**EXPLORE_RATE = 0.15 justification:**
- Too low (5%): learning loop barely gets challenged, echo chamber risk.
- Too high (30%): weights barely matter, learning feels useless.
- 15% means 85% of draws use weights (learning is effective) while 15% are wild (exploration is meaningful). Over 10 cards dealt, ~1.5 are random discoveries.

**DEFAULT_WEIGHT = 1.0 for missing:**
- Unrated meals get full baseline probability. The system doesn't penalize untried meals. This is critical: with 6 meals per mode and possibly only 1-2 rated, the 4 unrated meals should have normal odds.

---

## Worked Example: 3 Meals Over Time

### Setup

Mode: Easy (6 meals). User has rated 3:
- `easy-1` (Sheet Pan Chicken): rated +1, 5 days ago
- `easy-2` (Pasta Marinara): rated 0, 10 days ago
- `easy-3` (Quesadillas): rated -1, 2 days ago
- `easy-4`, `easy-5`, `easy-6`: no feedback

`recentDeals = ['easy-1', 'easy-5', 'easy-3']` (last 3 dealt)

### Score Computation

```
easy-1: δ=+1.0, decay=0.5^(5/30)=0.891  → score = +0.891
easy-2: δ= 0.0, decay=0.5^(10/30)=0.794 → score =  0.000
easy-3: δ=-0.6, decay=0.5^(2/30)=0.955  → score = -0.573
```

### Raw Weight

```
easy-1: 1.0 + 0.891 = 1.891
easy-2: 1.0 + 0.000 = 1.000
easy-3: 1.0 - 0.573 = 0.427
```

### Clamp

All within [0.15, 3.0]. No clamping needed.

### Cooldown

`recentDeals[-3:] = ['easy-1', 'easy-5', 'easy-3']`

```
easy-1: in cooldown → 1.891 × 0.3 = 0.567
easy-3: in cooldown → 0.427 × 0.3 = 0.128 → clamped to 0.15 (MIN_WEIGHT)
easy-5: in cooldown, no feedback → 1.0 × 0.3 = 0.30
```

### Final Weights

| Meal | Feedback | Weight | Selection % |
|------|----------|--------|-------------|
| easy-1 | Liked, 5d ago, cooldown | 0.567 | 14.1% |
| easy-2 | Neutral, 10d ago | 1.000 | 24.9% |
| easy-3 | Disliked, 2d ago, cooldown | 0.150 | 3.7% |
| easy-4 | None | 1.000 | 24.9% |
| easy-5 | None, cooldown | 0.300 | 7.5% |
| easy-6 | None | 1.000 | 24.9% |
| **Total** | | **4.017** | **100%** |

**Reading:** The liked meal (easy-1) is temporarily deprioritized by cooldown but will recover next session. The disliked meal (easy-3) is rare at 3.7%. Unrated meals have strong presence. Neutral meal (easy-2) behaves identically to unrated.

### 30 Days Later (Same Feedback, No Cooldown)

```
easy-1: δ=+1.0, decay=0.5^(35/30)=0.435 → weight = 1.435
easy-2: δ= 0.0, decay irrelevant        → weight = 1.000
easy-3: δ=-0.6, decay=0.5^(32/30)=0.482 → weight = 1.0 - 0.289 = 0.711
```

| Meal | Weight | Selection % |
|------|--------|-------------|
| easy-1 | 1.435 | 23.7% |
| easy-2 | 1.000 | 16.5% |
| easy-3 | 0.711 | 11.7% |
| easy-4 | 1.000 | 16.5% |
| easy-5 | 1.000 | 16.5% |
| easy-6 | 1.000 | 16.5% |

Decay has softened all preferences toward baseline. The disliked meal is recovering. The liked meal still has a mild edge. System naturally relaxes toward uniform over time.

---

## Constants Summary

| Constant | Value | Purpose |
|----------|-------|---------|
| `LEARNING_MODEL_VERSION` | 1 | Version tag for derived logic |
| `DELTA_POSITIVE` | +1.0 | Weight boost per positive rating |
| `DELTA_NEUTRAL` | 0.0 | No effect (baseline) |
| `DELTA_NEGATIVE` | -0.6 | Weight penalty per negative rating |
| `HALF_LIFE_DAYS` | 30 | Exponential decay half-life |
| `MIN_WEIGHT` | 0.15 | Floor clamp on derived weight |
| `MAX_WEIGHT` | 3.0 | Ceiling clamp on derived weight |
| `DEFAULT_WEIGHT` | 1.0 | Weight for meals with no feedback (at selection) |
| `COOLDOWN_WINDOW` | 3 | Recent deals to penalize |
| `COOLDOWN_MULTIPLIER` | 0.3 | Weight multiplier for cooled-down meals |
| `EXPLORE_RATE` | 0.15 | Probability of uniform random per draw |

---

## Implementation Confirmation

This is implementable as a **pure function module** with zero I/O:

```ts
// lib/learning/weights.ts

export function computeWeights(
  entries: FeedbackEntry[],
  recentDeals: string[],
  now?: number,
): Map<string, number>
```

- **Input:** feedback entries (read by caller from AsyncStorage), recent deal IDs (read by caller from session state), current time.
- **Output:** `Map<string, number>` — mealId to clamped, cooled-down weight.
- **No side effects:** No reads, no writes, no network, no state mutation.
- **Deterministic:** Same inputs produce same outputs (no internal randomness). Randomness lives in the caller (`pickNext`) via `Math.random()`.
- **Testable:** Feed mock entries, assert exact weight values.

The caller (`deal.tsx`) reads feedback from AsyncStorage once per session, calls `computeWeights()`, and passes the resulting map to `pickNext()`. If the map is empty (no feedback), `pickNext()` falls back to uniform random — identical to today's behavior.
