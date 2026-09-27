// apps/api/src/modules/scene-dna/sceneDna.controller.ts
// HTTP/API transport only; validation/auth context; no business logic.
// Domain: Scene DNA
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
import { approveSceneDna, getSceneDnaWorkspace, updateSceneDna } from "./sceneDna.service";
import { SceneDnaConflictError, SceneDnaNotFoundError, SceneDnaNotReadyError, SceneDnaValidationError } from "./sceneDna.validator";
import { SceneDnaForbiddenError } from "./sceneDna.permissions";

function handleError(err: unknown, reply: FastifyReply) {
  const send = (status: number, e: Error & { code: string; issues?: unknown }) =>
    reply.code(status).send({ error: { code: e.code, message: e.message, issues: e.issues } });
  if (err instanceof SceneDnaValidationError) return send(400, err);
  if (err instanceof SceneDnaForbiddenError) return send(403, err);
  if (err instanceof SceneDnaNotFoundError) return send(404, err);
  if (err instanceof SceneDnaConflictError) return send(409, err);
  if (err instanceof SceneDnaNotReadyError) return send(412, err);
  reply.log.error({ err }, "Unhandled error in scene-dna module");
  return reply.code(500).send({ error: { code: "AURA-SDNA-500", message: "Unexpected error" } });
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

export async function registerSceneDnaRoutes(app: FastifyInstance) {
  app.get("/api/projects/:id/scene-dna", route(({ params, db }) => getSceneDnaWorkspace(db, params.id)));
  app.patch("/api/projects/:id/scene-dna/:sceneId", route(({ params, body, db }) => updateSceneDna(db, params.id, params.sceneId, body)));
  app.post("/api/projects/:id/scene-dna/:sceneId/approve", route(({ params, db }) => approveSceneDna(db, params.id, params.sceneId)));
}
