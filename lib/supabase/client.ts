import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let singleton: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (singleton) return singleton;

  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) return null;

  singleton = createClient(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });

  return singleton;
}
