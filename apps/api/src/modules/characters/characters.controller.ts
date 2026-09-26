// apps/api/src/modules/characters/characters.controller.ts
// HTTP/API transport only; validation/auth context; no business logic.
// Domain: Casting & Characters

import type { FastifyInstance, FastifyReply } from "fastify";
import {
  addCharacterAlias,
  editCharacter,
  getCastingWorkspace,
  mergeCharacters,
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
  const route = <T>(fn: (req: { params: P; body: unknown; db: import("@supabase/supabase-js").SupabaseClient }) => Promise<T>, status = 200) =>
    async (request: import("fastify").FastifyRequest, reply: FastifyReply) => {
      try {
        const out = await fn({ params: request.params as P, body: request.body, db: request.db });
        return reply.code(status).send(out);
      } catch (err) {
        return handleError(err, reply);
      }
    };

  app.get("/api/projects/:id/characters", route(({ params, db }) => getCastingWorkspace(db, params.id)));
  app.post("/api/projects/:id/characters/sync", route(({ params, body, db }) => syncFromScript(db, params.id, body)));
  app.post("/api/projects/:id/characters/merge", route(({ params, body, db }) => mergeCharacters(db, params.id, body)));
  app.patch("/api/characters/:id", route(({ params, body, db }) => editCharacter(db, params.id, body)));
  app.post("/api/characters/:id/aliases", route(({ params, body, db }) => addCharacterAlias(db, params.id, body), 201));
  app.post("/api/characters/:id/unmerge", route(({ params, db }) => unmergeCharacter(db, params.id)));
}
