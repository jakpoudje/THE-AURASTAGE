// apps/api/src/modules/assistant/assistant.controller.ts — HTTP transport only. Domain: Ask AuraStage (Intelligence layer).
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as svc from "./assistant.service";
import { AssistantError } from "./assistant.errors";

// Tools run through each domain's service, so their errors arrive as that domain's error classes.
const BY_NAME: [RegExp, number][] = [[/ValidationError$/, 400], [/ForbiddenError$/, 403], [/NotFoundError$/, 404], [/ConflictError$/, 409], [/(NotReady|NotApproved)Error$/, 412]];
function handleError(err: unknown, reply: FastifyReply) {
  if (err instanceof AssistantError) return reply.code(err.status).send({ error: { code: err.code, message: err.message, issues: err.issues } });
  const e = err as Error & { code?: string; issues?: unknown };
  const hit = e?.constructor && BY_NAME.find(([re]) => re.test(e.constructor.name));
  if (hit) return reply.code(hit[1]).send({ error: { code: `AURA-AI-${hit[1]}`, message: e.message, issues: e.issues } });
  if (e?.code === "AURA-AI-404") return reply.code(404).send({ error: { code: "AURA-AI-404", message: e.message } });
  reply.log.error({ err }, "Unhandled error in assistant module");
  return reply.code(500).send({ error: { code: "AURA-AI-500", message: "Unexpected error" } });
}
const route =
  <T>(fn: (a: { id: string; body: unknown; db: SupabaseClient }) => Promise<T>) =>
  async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      return reply.send(await fn({ id: (request.params as { id: string }).id, body: request.body, db: request.db }));
    } catch (err) {
      return handleError(err, reply);
    }
  };

export async function registerAssistantRoutes(app: FastifyInstance) {
  app.get("/api/assistant/capabilities", async () => svc.capabilities());
  app.post("/api/projects/:id/assistant", route(({ id, body, db }) => svc.ask(db, id, body)));
  app.get("/api/projects/:id/assistant", route(({ id, db }) => svc.list(db, id)));
  app.get("/api/assistant/proposals/:id", route(({ id, db }) => svc.getProposal(db, id)));
  app.post("/api/assistant/proposals/:id/apply", route(({ id, db }) => svc.apply(db, id)));
  app.post("/api/assistant/proposals/:id/reject", route(({ id, db }) => svc.reject(db, id)));
  app.post("/api/assistant/proposals/:id/undo", route(({ id, db }) => svc.undo(db, id)));
}
