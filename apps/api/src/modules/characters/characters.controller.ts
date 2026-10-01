// apps/api/src/modules/characters/characters.controller.ts
// HTTP/API transport only; validation/auth context; no business logic.
// Domain: Casting & Characters

import { addActorPhoto, listPerformerConsents, recordPerformerConsent, revokePerformerConsent } from "./characters.consent";
import { generateAllCharacterLooks, generateCharacterLook, getCharacterLook } from "./characters.look";
import type { FastifyInstance, FastifyReply } from "fastify";
import {
  addCharacterAlias,
  createCharacter,
  deleteAgeState,
  deleteLook,
  listAgeStates,
  saveAgeState,
  deleteRelationship,
  editCharacter,
  getCastingWorkspace,
  mergeCharacters,
  applySuggestedProfiles,
  markCharactersDistinct,
  saveLook,
  setRelationship,
  syncFromScript,
  unmergeCharacter,
} from "./characters.service";
import {
  CharacterConflictError,
  CharacterNotFoundError,
  CharacterValidationError,
  ScriptNotApprovedError,
} from "./characters.validator";
import { CharacterForbiddenError } from "./characters.permissions";

function handleError(err: unknown, reply: FastifyReply) {
  const send = (status: number, e: Error & { code: string; issues?: unknown }) =>
    reply.code(status).send({ error: { code: e.code, message: e.message, issues: e.issues } });
  if (err instanceof CharacterValidationError) return send(400, err);
  if (err instanceof CharacterForbiddenError) return send(403, err);
  if (err instanceof CharacterNotFoundError) return send(404, err);
  if (err instanceof CharacterConflictError) return send(409, err);
  if (err instanceof ScriptNotApprovedError) return send(412, err);
  reply.log.error({ err }, "Unhandled error in characters module");
  return reply.code(500).send({ error: { code: "AURA-CHR-500", message: "Unexpected error" } });
}

type P = { id: string };

export async function registerCharactersRoutes(app: FastifyInstance) {
  const route = <T>(fn: (req: { params: P; body: unknown; query: Record<string, string | undefined>; db: import("@supabase/supabase-js").SupabaseClient }) => Promise<T>, status = 200) =>
    async (request: import("fastify").FastifyRequest, reply: FastifyReply) => {
      try {
        const out = await fn({ params: request.params as P, body: request.body, query: (request.query ?? {}) as Record<string, string | undefined>, db: request.db });
        return reply.code(status).send(out);
      } catch (err) {
        return handleError(err, reply);
      }
    };

  app.get("/api/projects/:id/characters", route(({ params, db }) => getCastingWorkspace(db, params.id)));
  app.post("/api/projects/:id/characters/sync", route(({ params, body, db }) => syncFromScript(db, params.id, body)));
  app.post("/api/projects/:id/characters/apply-suggestions", route(({ params, db }) => applySuggestedProfiles(db, params.id)));
  app.post("/api/projects/:id/characters/distinct", route(({ params, body, db }) => markCharactersDistinct(db, params.id, body)));
  app.post("/api/projects/:id/characters/merge", route(({ params, body, db }) => mergeCharacters(db, params.id, body)));
  app.patch("/api/characters/:id", route(({ params, body, db }) => editCharacter(db, params.id, body)));
  app.post("/api/characters/:id/aliases", route(({ params, body, db }) => addCharacterAlias(db, params.id, body), 201));
  app.post("/api/characters/:id/unmerge", route(({ params, db }) => unmergeCharacter(db, params.id)));
  app.post("/api/projects/:id/characters", route(({ params, body, db }) => createCharacter(db, params.id, body), 201));
  app.post("/api/projects/:id/relationships", route(({ params, body, db }) => setRelationship(db, params.id, body)));
  app.delete("/api/relationships/:id", route(({ params, db }) => deleteRelationship(db, params.id)));
  app.get("/api/characters/:id/look", route(({ params, db, query }) => getCharacterLook(db, params.id, query.look_id || null, process.env, query.age_state_id || null)));
  app.post("/api/projects/:id/characters/looks/generate", route(({ params, body, db }) => generateAllCharacterLooks(db, params.id, body)));
  app.post("/api/characters/:id/look/generate", route(({ params, body, db }) => generateCharacterLook(db, params.id, body)));
  app.post("/api/characters/:id/looks", route(({ params, body, db }) => saveLook(db, params.id, body)));
  app.delete("/api/looks/:id", route(({ params, db }) => deleteLook(db, params.id)));
  app.get("/api/characters/:id/consents", route(({ params, db }) => listPerformerConsents(db, params.id)));
  app.post("/api/characters/:id/consents", route(({ params, body, db }) => recordPerformerConsent(db, params.id, body), 201));
  app.post("/api/consents/:id/withdraw", route(({ params, db }) => revokePerformerConsent(db, params.id)));
  app.post("/api/characters/:id/actor-photos", route(({ params, body, db }) => addActorPhoto(db, params.id, body), 201));
  app.get("/api/characters/:id/ages", route(({ params, db }) => listAgeStates(db, params.id)));
  app.post("/api/characters/:id/ages", route(({ params, body, db }) => saveAgeState(db, params.id, body)));
  app.delete("/api/ages/:id", route(({ params, db }) => deleteAgeState(db, params.id)));
}
