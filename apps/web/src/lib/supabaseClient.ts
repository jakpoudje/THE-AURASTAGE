"use client";

// apps/web/src/lib/supabaseClient.ts
// Lazy singleton: the Supabase browser client must NOT be constructed at
// module-evaluation time. Next.js prerenders client components during
// `next build`, which would otherwise run this module (and therefore
// `createClient`) on the server with no real browser env available. We defer
// construction until something actually calls `getSupabaseClient()`, which
// only happens inside event handlers / effects that run in the browser.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;
let warned = false;

export function getSupabaseClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if ((!url || !anonKey) && !warned) {
    warned = true;
    // eslint-disable-next-line no-console
    console.warn(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set. Auth will not work until they are configured (see .env.example)."
    );
  }

  cached = createClient(url || "https://placeholder.invalid", anonKey || "placeholder-anon-key");
  return cached;
}
