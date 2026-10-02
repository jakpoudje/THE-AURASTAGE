// apps/api/src/modules/generation/generation.controller.ts
// HTTP/API transport only; validation/auth context; no business logic.
// Domain: Visual Generation
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
import { approveAllShots, compileAllShots, sketchAllShots } from "./generation.batch";
import { cancelTake, compileShot, getPackageDetail, getVisualWorkspace, requestTakes, setTakeApproval } from "./generation.service";
import { GenerationBusyError, GenerationConflictError, GenerationNotFoundError, GenerationNotReadyError, GenerationValidationError } from "./generation.validator";
import { GenerationForbiddenError } from "./generation.permissions";
import { getVisualProgress } from "./generation.progress";

function handleError(err: unknown, reply: FastifyReply) {
  const send = (status: number, e: Error & { code: string; issues?: unknown }) =>
    reply.code(status).send({ error: { code: e.code, message: e.message, issues: e.issues } });
  if (err instanceof GenerationValidationError) return send(400, err);
  if (err instanceof GenerationForbiddenError) return send(403, err);
  if (err instanceof GenerationNotFoundError) return send(404, err);
  if (err instanceof GenerationConflictError) return send(409, err);
  if (err instanceof GenerationNotReadyError) return send(412, err);
  if (err instanceof GenerationBusyError) return send(429, err);
  reply.log.error({ err }, "Unhandled error in generation module");
  return reply.code(500).send({ error: { code: "AURA-GEN-500", message: "Unexpected error" } });
}

type Params = { id: string; shotId: string; action: string };
const route =
  <T>(fn: (a: { params: Params; body: unknown; db: SupabaseClient; req: FastifyRequest }) => Promise<T>) =>
  async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      return reply.send(await fn({ params: request.params as Params, body: request.body, db: request.db, req: request }));
    } catch (err) {
      return handleError(err, reply);
    }
  };

export async function registerGenerationRoutes(app: FastifyInstance) {
  app.get("/api/projects/:id/visual", route(({ params, db }) => getVisualWorkspace(db, params.id)));
  app.post("/api/projects/:id/visual/shots/:shotId/compile", route(({ params, body, db }) => compileShot(db, params.id, params.shotId, body)));
  app.post(
    "/api/visual/packages/:id/takes",
    route(({ params, body, db, req }) => requestTakes(db, params.id, body, (req.headers["idempotency-key"] as string | undefined) ?? null))
  );
  // One click for the whole film (owner, 2026-10-02).
  app.get("/api/projects/:id/visual/progress", route(({ params, db }) => getVisualProgress(db, params.id)));
  app.post("/api/projects/:id/visual/compile-all", route(({ params, db }) => compileAllShots(db, params.id)));
  app.post("/api/projects/:id/visual/sketch-all", route(({ params, db }) => sketchAllShots(db, params.id)));
  app.post("/api/projects/:id/visual/approve-all", route(({ params, db }) => approveAllShots(db, params.id)));
  app.get("/api/visual/packages/:id", route(({ params, db }) => getPackageDetail(db, params.id)));
  app.post("/api/takes/:id/cancel", route(({ params, db }) => cancelTake(db, params.id)));
  app.post("/api/takes/:id/:action", route(({ params, db }) => setTakeApproval(db, params.id, params.action)));
}
