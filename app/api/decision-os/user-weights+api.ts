import { DEFAULT_USER_WEIGHTS } from '@/lib/decision-core/weights';
import { authenticateRequest } from '@/lib/decision-os/auth/helper';
import { getDb } from '@/lib/decision-os/db/client';

export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await authenticateRequest(request.headers.get('Authorization'));
    if (!auth.success) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }

    const db = getDb();
    const rows = await db.query<{
      weights: unknown;
      updated_at: string;
      version: number | null;
    }>(
      `SELECT weights, updated_at, version
       FROM user_weights
       WHERE household_key = $1
       ORDER BY updated_at DESC
       LIMIT 1`,
      [auth.context.householdKey],
    );

    if (rows.length === 0) {
      return Response.json({
        v: 1,
        household_key: auth.context.householdKey,
        updated_at: new Date(0).toISOString(),
        weights: DEFAULT_USER_WEIGHTS,
        meal_weights: {},
      });
    }

    const rawWeights = rows[0].weights as
      | (typeof DEFAULT_USER_WEIGHTS & { meal_weights?: Record<string, number> })
      | { meal_weights?: Record<string, number> }
      | null;
    const typedWeights =
      rawWeights &&
      typeof rawWeights === 'object' &&
      'v' in rawWeights &&
      (rawWeights as { v?: number }).v === 1 &&
      'base' in rawWeights
        ? (rawWeights as typeof DEFAULT_USER_WEIGHTS)
        : DEFAULT_USER_WEIGHTS;
    const mealWeights =
      rawWeights &&
      typeof rawWeights === 'object' &&
      'meal_weights' in rawWeights &&
      rawWeights.meal_weights &&
      typeof rawWeights.meal_weights === 'object'
        ? rawWeights.meal_weights
        : {};

    return Response.json({
      v: rows[0].version ?? 1,
      household_key: auth.context.householdKey,
      updated_at: rows[0].updated_at,
      weights: typedWeights,
      meal_weights: mealWeights,
    });
  } catch {
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}
