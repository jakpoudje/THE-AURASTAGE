// apps/api/src/modules/dialogue/dialogue.controller.ts
// HTTP/API transport only; validation/auth context; no business logic.
// Domain: Dialogue Intelligence
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
import { approveSceneDialogue, getDialogueWorkspace, syncDialogue, updateDialogueLine } from "./dialogue.service";
import { DialogueConflictError, DialogueNotFoundError, DialogueScriptNotApprovedError, DialogueValidationError } from "./dialogue.validator";
import { DialogueForbiddenError } from "./dialogue.permissions";

function handleError(err: unknown, reply: FastifyReply) {
  const send = (status: number, e: Error & { code: string; issues?: unknown }) =>
    reply.code(status).send({ error: { code: e.code, message: e.message, issues: e.issues } });
  if (err instanceof DialogueValidationError) return send(400, err);
  if (err instanceof DialogueForbiddenError) return send(403, err);
  if (err instanceof DialogueNotFoundError) return send(404, err);
  if (err instanceof DialogueConflictError) return send(409, err);
  if (err instanceof DialogueScriptNotApprovedError) return send(412, err);
  reply.log.error({ err }, "Unhandled error in dialogue module");
  return reply.code(500).send({ error: { code: "AURA-DLG-500", message: "Unexpected error" } });
}

type Params = { id: string; sceneId?: string };
const route =
  <T>(fn: (a: { params: Params; body: unknown; db: SupabaseClient }) => Promise<T>) =>
  async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      return reply.send(await fn({ params: request.params as Params, body: request.body, db: request.db }));
    } catch (err) {
      return handleError(err, reply);
    }
  };

export async function registerDialogueRoutes(app: FastifyInstance) {
  app.get("/api/projects/:id/dialogue", route(({ params, db }) => getDialogueWorkspace(db, params.id)));
  app.post("/api/projects/:id/dialogue/sync", route(({ params, db }) => syncDialogue(db, params.id)));
  app.post("/api/projects/:id/dialogue/scenes/:sceneId/approve", route(({ params, db }) => approveSceneDialogue(db, params.id, params.sceneId!)));
  app.patch("/api/dialogue-lines/:id", route(({ params, body, db }) => updateDialogueLine(db, params.id, body)));
}
