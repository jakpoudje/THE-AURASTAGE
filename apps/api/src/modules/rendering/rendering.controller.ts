// apps/api/src/modules/rendering/rendering.controller.ts
// HTTP/API transport only; validation/auth context; no business logic.
// Domain: Export & Deliver
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cancelRender, createRender, getDeliveryWorkspace, getRenderManifest } from "./rendering.service";
import { RenderingConflictError, RenderingNotFoundError, RenderingNotReadyError, RenderingValidationError } from "./rendering.validator";
import { RenderingForbiddenError } from "./rendering.permissions";

function handleError(err: unknown, reply: FastifyReply) {
  const send = (status: number, e: Error & { code: string; issues?: unknown }) => reply.code(status).send({ error: { code: e.code, message: e.message, issues: e.issues } });
  if (err instanceof RenderingValidationError) return send(400, err);
  if (err instanceof RenderingForbiddenError) return send(403, err);
  if (err instanceof RenderingNotFoundError) return send(404, err);
  if (err instanceof RenderingConflictError) return send(409, err);
  if (err instanceof RenderingNotReadyError) return send(412, err);
  reply.log.error({ err }, "Unhandled error in rendering module");
  return reply.code(500).send({ error: { code: "AURA-EXP-500", message: "Unexpected error" } });
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

export async function registerRenderingRoutes(app: FastifyInstance) {
  app.get("/api/projects/:id/delivery", route(({ params, db }) => getDeliveryWorkspace(db, params.id)));
  app.post("/api/projects/:id/delivery/renders", route(({ params, body, db }) => createRender(db, params.id, body)));
  app.post("/api/renders/:id/cancel", route(({ params, db }) => cancelRender(db, params.id)));
  app.get("/api/renders/:id/manifest", route(({ params, db }) => getRenderManifest(db, params.id)));
}
