// apps/api/src/modules/world/world.controller.ts — HTTP transport only. Domain: Locations & Props.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createWorldItem, generateWorldLook, generateAllWorldLooks, getWorldLook, getWorldWorkspace, syncWorld, updateWorldItem } from "./world.service";
import { WorldConflictError, WorldForbiddenError, WorldNotFoundError, WorldNotReadyError, WorldValidationError } from "./world.errors";

function handleError(err: unknown, reply: FastifyReply) {
  const send = (status: number, e: Error & { code: string; issues?: unknown }) => reply.code(status).send({ error: { code: e.code, message: e.message, issues: e.issues } });
  if (err instanceof WorldValidationError) return send(400, err);
  if (err instanceof WorldForbiddenError) return send(403, err);
  if (err instanceof WorldNotFoundError) return send(404, err);
  if (err instanceof WorldConflictError) return send(409, err);
  if (err instanceof WorldNotReadyError) return send(412, err);
  reply.log.error({ err }, "Unhandled error in world module");
  return reply.code(500).send({ error: { code: "AURA-WLD-500", message: "Unexpected error" } });
}

type P = { id: string; kind: string };
export async function registerWorldRoutes(app: FastifyInstance) {
  const route = <T>(fn: (req: { params: P; body: unknown; db: SupabaseClient }) => Promise<T>, status = 200) =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        return reply.code(status).send(await fn({ params: request.params as P, body: request.body, db: request.db }));
      } catch (err) {
        return handleError(err, reply);
      }
    };
  app.get("/api/projects/:id/world", route(({ params, db }) => getWorldWorkspace(db, params.id)));
  app.post("/api/projects/:id/world/looks/generate-all", route(({ params, body, db }) => generateAllWorldLooks(db, params.id, body)));
  app.post("/api/projects/:id/world/sync", route(({ params, db }) => syncWorld(db, params.id)));
  app.post("/api/projects/:id/world/:kind", route(({ params, body, db }) => createWorldItem(db, params.id, params.kind, body), 201));
  app.patch("/api/world/:kind/:id", route(({ params, body, db }) => updateWorldItem(db, params.kind, params.id, body)));
  app.get("/api/world/:kind/:id/look", route(({ params, db }) => getWorldLook(db, params.kind, params.id)));
  app.post("/api/world/:kind/:id/look/generate", route(({ params, body, db }) => generateWorldLook(db, params.kind, params.id, body)));
}
