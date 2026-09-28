// apps/api/src/modules/editorial/editorial.controller.ts
// HTTP/API transport only; validation/auth context; no business logic.
// Domain: Editorial & Timeline
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assembleTimeline, editTimeline, exportEdl, getEditorialWorkspace, lockPicture, restoreTimelineVersion, saveTimelineVersion } from "./editorial.service";
import { EditorialConflictError, EditorialLockedError, EditorialNotFoundError, EditorialNotReadyError, EditorialValidationError } from "./editorial.validator";
import { EditorialForbiddenError } from "./editorial.permissions";

function handleError(err: unknown, reply: FastifyReply) {
  const send = (status: number, e: Error & { code: string; issues?: unknown }) => reply.code(status).send({ error: { code: e.code, message: e.message, issues: e.issues } });
  if (err instanceof EditorialValidationError) return send(400, err);
  if (err instanceof EditorialForbiddenError) return send(403, err);
  if (err instanceof EditorialNotFoundError) return send(404, err);
  if (err instanceof EditorialConflictError) return send(409, err);
  if (err instanceof EditorialNotReadyError) return send(412, err);
  if (err instanceof EditorialLockedError) return send(423, err);
  reply.log.error({ err }, "Unhandled error in editorial module");
  return reply.code(500).send({ error: { code: "AURA-EDT-500", message: "Unexpected error" } });
}
type Params = { id: string; versionId: string };
const route =
  <T>(fn: (a: { params: Params; body: unknown; db: SupabaseClient }) => Promise<T>) =>
  async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      return reply.send(await fn({ params: request.params as Params, body: request.body, db: request.db }));
    } catch (err) {
      return handleError(err, reply);
    }
  };

export async function registerEditorialRoutes(app: FastifyInstance) {
  app.get("/api/projects/:id/editorial", route(({ params, db }) => getEditorialWorkspace(db, params.id)));
  app.post("/api/projects/:id/editorial/assemble", route(({ params, body, db }) => assembleTimeline(db, params.id, body)));
  app.post("/api/projects/:id/editorial/edit", route(({ params, body, db }) => editTimeline(db, params.id, body)));
  app.post("/api/projects/:id/editorial/versions", route(({ params, body, db }) => saveTimelineVersion(db, params.id, body)));
  app.post("/api/projects/:id/editorial/versions/:versionId/restore", route(({ params, body, db }) => restoreTimelineVersion(db, params.id, params.versionId, body)));
  app.post("/api/projects/:id/editorial/lock", route(({ params, body, db }) => lockPicture(db, params.id, body)));
  app.get("/api/projects/:id/editorial/edl", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as Params;
      const { filename, text } = await exportEdl(request.db, id);
      return reply.header("Content-Type", "text/plain; charset=utf-8").header("Content-Disposition", `attachment; filename="${filename}"`).send(text);
    } catch (err) {
      return handleError(err, reply);
    }
  });
}
