// apps/api/src/infrastructure/auth.ts
// Cross-cutting infrastructure: verifies the caller's Supabase access token
// and attaches a per-request, RLS-scoped Supabase client. No module reaches
// into another domain's tables directly — every domain repository receives
// this same `request.db` (CLAUDE.md rules 4 and 7: no direct cross-domain
// table access, and no provider SDK usage outside the Provider Gateway —
// Supabase here is the database, not a generation provider).

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createSupabaseClient } from "@aurastage/database";
import type { SupabaseClient } from "@supabase/supabase-js";

declare module "fastify" {
  interface FastifyRequest {
    db: SupabaseClient;
    userId: string;
  }
}

const PUBLIC_PATHS = new Set(["/health"]);

/**
 * Verified sessions are remembered for a short while (2026-10-02: every API call asked Supabase Auth to verify the token
 * — with pages refreshing progress every few seconds that was most of Auth's traffic, and when the database was busy
 * sign-in took up to a minute for everyone). A token is re-checked with Supabase at least every 30 s, never past its own
 * expiry, and the whole cache is forgotten the moment anyone signs other devices out (forgetVerifiedSessions).
 */
const VERIFIED_MS = 30_000;
const verified = new Map<string, { userId: string; until: number }>();
export function forgetVerifiedSessions() {
  verified.clear();
}
function tokenExpiry(token: string): number {
  try {
    const exp = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")).exp;
    return typeof exp === "number" ? exp * 1000 : 0;
  } catch {
    return 0;
  }
}

export async function registerAuth(app: FastifyInstance) {
  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    const pathname = request.url.split("?")[0];
    if (PUBLIC_PATHS.has(pathname)) return;

    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (!token) {
      reply.code(401).send({ error: { code: "AURA-MOS-401", message: "Missing bearer token" } });
      return reply;
    }

    const now = Date.now();
    const known = verified.get(token);
    if (known && known.until > now) {
      request.userId = known.userId;
      request.db = createSupabaseClient(token);
      return;
    }
    const anonClient = createSupabaseClient();
    const { data, error } = await anonClient.auth.getUser(token);
    if (error || !data.user) {
      verified.delete(token);
      reply.code(401).send({ error: { code: "AURA-MOS-401", message: "Invalid or expired session" } });
      return reply;
    }
    if (verified.size > 5000) verified.clear(); // bounded; entries are short-lived anyway
    verified.set(token, { userId: data.user.id, until: Math.min(now + VERIFIED_MS, tokenExpiry(token) || now) });

    request.userId = data.user.id;
    request.db = createSupabaseClient(token);
  });
}
