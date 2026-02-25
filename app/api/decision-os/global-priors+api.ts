import { authenticateRequest } from '@/lib/decision-os/auth/helper';
import { getDb } from '@/lib/decision-os/db/client';

interface GlobalPriorRow {
  bucket_key: string;
  meal_key: string | null;
  meal_id: number | null;
  prior_score: number;
  sample_count: number | null;
  sample_size: number | null;
  household_count: number | null;
}

function toMealKey(row: GlobalPriorRow): string | null {
  if (row.meal_key) return row.meal_key;
  if (row.meal_id !== null && row.meal_id !== undefined) return String(row.meal_id);
  return null;
}

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await authenticateRequest(request.headers.get('Authorization'));
    if (!auth.success) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const bucket = (url.searchParams.get('bucket') ?? '').trim();
    const defaultMinEvents = parsePositiveInt(process.env.GLOBAL_PRIORS_MIN_EVENTS ?? '200', 200);
    const defaultMinHouseholds = parsePositiveInt(
      process.env.GLOBAL_PRIORS_MIN_HOUSEHOLDS ?? '30',
      30,
    );
    const requestedMinEvents = parsePositiveInt(url.searchParams.get('minEvents'), defaultMinEvents);
    const requestedMinHouseholds = parsePositiveInt(
      url.searchParams.get('minHouseholds'),
      defaultMinHouseholds,
    );
    const minEvents = Math.max(defaultMinEvents, requestedMinEvents);
    const minHouseholds = Math.max(defaultMinHouseholds, requestedMinHouseholds);

    const db = getDb();
    const rows = await db.query<GlobalPriorRow>(
      `SELECT
          bucket_key,
          meal_key,
          meal_id,
          prior_score,
          sample_count,
          sample_size,
          household_count
       FROM global_priors
       WHERE ($1 = '' OR bucket_key = $1)
       ORDER BY bucket_key ASC
       LIMIT 1000`,
      [bucket],
    );

    const priors: Array<{
      bucket_key: string;
      meal_key: string;
      prior_score: number;
      sample_count: number;
      household_count: number;
    }> = [];

    for (const row of rows) {
      const sampleCount = row.sample_count ?? row.sample_size ?? 0;
      const householdCount = row.household_count ?? 0;
      if (sampleCount < minEvents || householdCount < minHouseholds) continue;

      const mealKey = toMealKey(row);
      if (!mealKey) continue;

      priors.push({
        bucket_key: row.bucket_key,
        meal_key: mealKey,
        prior_score: Number(row.prior_score ?? 0),
        sample_count: sampleCount,
        household_count: householdCount,
      });
    }

    return Response.json({
      v: 1,
      bucket: bucket || null,
      thresholds: {
        min_events: minEvents,
        min_households: minHouseholds,
      },
      priors,
    });
  } catch {
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}
