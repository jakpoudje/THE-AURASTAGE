// apps/api/src/modules/settings/settings.controller.ts — HTTP transport only. Domain: Project Settings.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as svc from "./settings.service";
import { SettingsConflictError, SettingsForbiddenError, SettingsNotFoundError, SettingsValidationError } from "./settings.validator";

function handleError(err: unknown, reply: FastifyReply) {
  const send = (status: number, e: Error & { code: string; issues?: unknown }) => reply.code(status).send({ error: { code: e.code, message: e.message, issues: e.issues } });
  if (err instanceof SettingsValidationError) return send(400, err);
  if (err instanceof SettingsForbiddenError) return send(403, err);
  if (err instanceof SettingsNotFoundError) return send(404, err);
  if (err instanceof SettingsConflictError) return send(409, err);
  reply.log.error({ err }, "Unhandled error in settings module");
  return reply.code(500).send({ error: { code: "AURA-SET-500", message: "Unexpected error" } });
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

export async function registerSettingsRoutes(app: FastifyInstance) {
  app.get("/api/projects/:id/settings", route(({ id, db }) => svc.getSettings(db, id)));
  app.post("/api/projects/:id/settings/impact", route(({ id, body, db }) => svc.previewImpact(db, id, body)));
  app.put("/api/projects/:id/settings", route(({ id, body, db }) => svc.saveSettings(db, id, body)));
}
