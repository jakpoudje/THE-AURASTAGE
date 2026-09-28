// apps/api/src/modules/help/help.controller.ts
// HTTP/API transport only. Domain: Help & Support + account security.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as svc from "./help.service";
import { HelpForbiddenError, HelpNotFoundError, HelpRateLimitError, HelpValidationError } from "./help.validator";

function handleError(err: unknown, reply: FastifyReply) {
  const send = (status: number, e: Error & { code: string; issues?: unknown }) => reply.code(status).send({ error: { code: e.code, message: e.message, issues: e.issues } });
  if (err instanceof HelpValidationError) return send(400, err);
  if (err instanceof HelpForbiddenError) return send(403, err);
  if (err instanceof HelpNotFoundError) return send(404, err);
  if (err instanceof HelpRateLimitError) return send(429, err);
  reply.log.error({ err }, "Unhandled error in help module");
  return reply.code(500).send({ error: { code: "AURA-HLP-500", message: "Unexpected error" } });
}
type Params = { id: string };
const route =
  <T>(fn: (a: { params: Params; query: Record<string, string | undefined>; body: unknown; db: SupabaseClient }) => Promise<T> | T) =>
  async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      return reply.send(await fn({ params: request.params as Params, query: (request.query ?? {}) as Record<string, string>, body: request.body, db: request.db }));
    } catch (err) {
      return handleError(err, reply);
    }
  };

export async function registerHelpRoutes(app: FastifyInstance) {
  app.get("/api/help/status", route(({ db }) => svc.systemStatus(db)));
  app.get("/api/help/guides", route(() => svc.guides()));
  app.post("/api/help/assistant", route(({ body, db }) => svc.ask(db, body)));
  app.get("/api/projects/:id/diagnostics", route(({ params, db }) => svc.projectDiagnostics(db, params.id)));
  app.get("/api/help/tickets", route(({ query, db }) => svc.listTickets(db, query.all === "1")));
  app.post("/api/help/tickets", route(({ body, db }) => svc.createTicket(db, body)));
  app.post("/api/help/tickets/:id/reply", route(({ params, body, db }) => svc.replyTicket(db, params.id, body)));
  app.post("/api/help/tickets/:id/close", route(({ params, db }) => svc.closeTicket(db, params.id)));
  app.get("/api/account/sessions", route(({ db }) => svc.sessions(db)));
  app.post("/api/account/sessions/revoke", route(({ body, db }) => svc.revokeSessions(db, body)));
}
