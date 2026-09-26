import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Creates a Supabase client. When `accessToken` is provided (the caller's own
 * JWT, forwarded from an Authorization: Bearer header), Postgres RLS policies
 * apply exactly as they would for a direct client-side request — this is the
 * only way apps/api touches the database in Phase 1. There is deliberately no
 * service-role client here; add one only when a real background worker needs
 * to bypass RLS, and keep that key out of every process that also handles
 * end-user requests.
 */
export function createSupabaseClient(accessToken?: string): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be set");
  }
  return createClient(url, anonKey, {
    global: accessToken
      ? { headers: { Authorization: `Bearer ${accessToken}` } }
      : undefined,
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
