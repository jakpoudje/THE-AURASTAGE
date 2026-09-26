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

    const anonClient = createSupabaseClient();
    const { data, error } = await anonClient.auth.getUser(token);
    if (error || !data.user) {
      reply.code(401).send({ error: { code: "AURA-MOS-401", message: "Invalid or expired session" } });
      return reply;
    }

    request.userId = data.user.id;
    request.db = createSupabaseClient(token);
  });
}
