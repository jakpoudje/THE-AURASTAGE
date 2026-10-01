// apps/api/src/modules/shots/shots.controller.ts
// HTTP/API transport only; validation/auth context; no business logic.
// Domain: Storyboard & Shots
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addShot, approveAllShotPlans, approveShotPlan, deleteShot, generateAllShots, generateShots, getStoryboard, moveShot, updateShot } from "./shots.service";
import { ShotConflictError, ShotNotFoundError, ShotNotReadyError, ShotValidationError } from "./shots.validator";
import { ShotForbiddenError } from "./shots.permissions";

function handleError(err: unknown, reply: FastifyReply) {
  const send = (status: number, e: Error & { code: string; issues?: unknown }) =>
    reply.code(status).send({ error: { code: e.code, message: e.message, issues: e.issues } });
  if (err instanceof ShotValidationError) return send(400, err);
  if (err instanceof ShotForbiddenError) return send(403, err);
  if (err instanceof ShotNotFoundError) return send(404, err);
  if (err instanceof ShotConflictError) return send(409, err);
  if (err instanceof ShotNotReadyError) return send(412, err);
  reply.log.error({ err }, "Unhandled error in shots module");
  return reply.code(500).send({ error: { code: "AURA-SHOT-500", message: "Unexpected error" } });
}

type Params = { id: string; sceneId: string };
const route =
  <T>(fn: (a: { params: Params; body: unknown; db: SupabaseClient }) => Promise<T>) =>
  async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      return reply.send(await fn({ params: request.params as Params, body: request.body, db: request.db }));
    } catch (err) {
      return handleError(err, reply);
    }
  };

export async function registerShotsRoutes(app: FastifyInstance) {
  app.get("/api/projects/:id/storyboard", route(({ params, db }) => getStoryboard(db, params.id)));
  app.post("/api/projects/:id/storyboard/approve-all", route(({ params, db }) => approveAllShotPlans(db, params.id)));
  app.post("/api/projects/:id/storyboard/generate-all", route(({ params, body, db }) => generateAllShots(db, params.id, body)));
  app.post("/api/projects/:id/storyboard/scenes/:sceneId/generate", route(({ params, body, db }) => generateShots(db, params.id, params.sceneId, body)));
  app.post("/api/projects/:id/storyboard/scenes/:sceneId/shots", route(({ params, body, db }) => addShot(db, params.id, params.sceneId, body)));
  app.post("/api/projects/:id/storyboard/scenes/:sceneId/approve", route(({ params, db }) => approveShotPlan(db, params.id, params.sceneId)));
  app.patch("/api/shots/:id", route(({ params, body, db }) => updateShot(db, params.id, body)));
  app.delete("/api/shots/:id", route(({ params, db }) => deleteShot(db, params.id)));
  app.post("/api/shots/:id/move", route(({ params, body, db }) => moveShot(db, params.id, body)));
}
