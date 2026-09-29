// apps/api/src/modules/audio/audio.controller.ts
// HTTP/API transport only; validation/auth context; no business logic.
// Domain: Audio Studio
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
import { approveSession, createClip, deleteClip, getAudioWorkspace, recordMeasurement, spotScene, updateClip, updateMix, updateTrack } from "./audio.service";
import { AudioBusyError, AudioConflictError, AudioNotFoundError, AudioNotReadyError, AudioValidationError } from "./audio.validator";
import { generateSceneCues, generateSound } from "./audio.generation";
import { AudioForbiddenError } from "./audio.permissions";

function handleError(err: unknown, reply: FastifyReply) {
  const send = (status: number, e: Error & { code: string; issues?: unknown }) => reply.code(status).send({ error: { code: e.code, message: e.message, issues: e.issues } });
  if (err instanceof AudioValidationError) return send(400, err);
  if (err instanceof AudioForbiddenError) return send(403, err);
  if (err instanceof AudioNotFoundError) return send(404, err);
  if (err instanceof AudioConflictError) return send(409, err);
  if (err instanceof AudioNotReadyError) return send(412, err);
  if (err instanceof AudioBusyError) return send(429, err);
  reply.log.error({ err }, "Unhandled error in audio module");
  return reply.code(500).send({ error: { code: "AURA-AUD-500", message: "Unexpected error" } });
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

export async function registerAudioRoutes(app: FastifyInstance) {
  app.get("/api/projects/:id/audio", route(({ params, db }) => getAudioWorkspace(db, params.id)));
  app.post("/api/projects/:id/audio/scenes/:sceneId/spot", route(({ params, db }) => spotScene(db, params.id, params.sceneId)));
  app.post("/api/projects/:id/audio/scenes/:sceneId/generate", route(({ params, body, db }) => generateSound(db, params.id, params.sceneId, body)));
  app.post("/api/projects/:id/audio/scenes/:sceneId/generate-cues", route(({ params, db }) => generateSceneCues(db, params.id, params.sceneId)));
  app.post("/api/projects/:id/audio/scenes/:sceneId/approve", route(({ params, db }) => approveSession(db, params.id, params.sceneId)));
  app.patch("/api/audio-tracks/:id", route(({ params, body, db }) => updateTrack(db, params.id, body)));
  app.put("/api/projects/:id/audio/scenes/:sceneId/mix", route(({ params, body, db }) => updateMix(db, params.id, params.sceneId, body)));
  app.post("/api/audio-sessions/:id/clips", route(({ params, body, db }) => createClip(db, params.id, body)));
  app.post("/api/audio-sessions/:id/measurements", route(({ params, body, db }) => recordMeasurement(db, params.id, body)));
  app.patch("/api/audio-clips/:id", route(({ params, body, db }) => updateClip(db, params.id, body)));
  app.delete("/api/audio-clips/:id", route(({ params, db }) => deleteClip(db, params.id)));
}
