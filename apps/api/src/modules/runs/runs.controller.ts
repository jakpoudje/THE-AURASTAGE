// apps/api/src/modules/runs/runs.controller.ts
// HTTP/API transport only; validation/auth context; no business logic.
// Domain: MOS — production runs (migration 0056).
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
import { controlRun, listProjectRuns, startRun, stepRun } from "./runs.service";
import { RunForbiddenError, RunNotFoundError, RunValidationError } from "./runs.errors";

function handleError(err: unknown, reply: FastifyReply) {
  const send = (status: number, e: Error & { code: string; issues?: unknown }) => reply.code(status).send({ error: { code: e.code, message: e.message, issues: e.issues } });
  if (err instanceof RunValidationError) return send(400, err);
  if (err instanceof RunForbiddenError) return send(403, err);
  if (err instanceof RunNotFoundError) return send(404, err);
  reply.log.error({ err }, "Unhandled error in runs module");
  return reply.code(500).send({ error: { code: "AURA-RUN-500", message: "Unexpected error" } });
}
type Params = { id: string };
const route =
  <T>(fn: (a: { params: Params; body: unknown; db: SupabaseClient }) => Promise<T>) =>
  async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      return reply.send(await fn({ params: request.params as Params, body: request.body, db: request.db }));
    } catch (err) {
      return handleError(err, reply);
    }
  };

export async function registerRunRoutes(app: FastifyInstance) {
  app.get("/api/projects/:id/runs", route(({ params, db }) => listProjectRuns(db, params.id)));
  app.post("/api/projects/:id/runs", route(({ params, body, db }) => startRun(db, params.id, body)));
  app.post("/api/runs/:id/step", route(({ params, db }) => stepRun(db, params.id)));
  app.post("/api/runs/:id/control", route(({ params, body, db }) => controlRun(db, params.id, body)));
}
