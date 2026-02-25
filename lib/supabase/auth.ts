import type { SupabaseClient } from '@supabase/supabase-js';

let inFlight: Promise<void> | null = null;

/**
 * Ensures there is an authenticated session for best-effort writes.
 * Uses anonymous auth if configured; silently no-ops on failure.
 */
export async function ensureAnonymousAuth(client: SupabaseClient): Promise<void> {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const current = await client.auth.getSession();
      if (current.data.session) return;

      const authAny = client.auth as unknown as {
        signInAnonymously?: () => Promise<unknown>;
      };

      if (typeof authAny.signInAnonymously === 'function') {
        await authAny.signInAnonymously();
      }
    } catch {
      // Do not block app flow.
    }
  })();

  try {
    await inFlight;
  } finally {
    inFlight = null;
  }
}
