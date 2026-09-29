// apps/api/src/modules/screenplay/screenplay.controller.ts
// HTTP/API transport only; validation/auth context; no business logic.
// Domain: Scriptwriter
// Canonical object: Script / Scene

import type { FastifyInstance, FastifyReply } from "fastify";
import { approveScript, getScopePlan, getWorkspace, saveScriptVersion } from "./screenplay.service";
import { ScriptConflictError, ScriptNotFoundError, ScriptValidationError } from "./screenplay.validator";
import { ScriptForbiddenError } from "./screenplay.permissions";
import { applyStory, checkContinuity, getWriting, listWriting, openAsDraft, requestWriting, saveOutline, ScriptBusyError, ScriptNotReadyError } from "./screenplay.writing";

function handleError(err: unknown, reply: FastifyReply) {
  if (err instanceof ScriptValidationError) {
    return reply.code(400).send({ error: { code: err.code, message: err.message, issues: err.issues } });
  }
  if (err instanceof ScriptForbiddenError) return reply.code(403).send({ error: { code: err.code, message: err.message } });
  if (err instanceof ScriptNotFoundError) return reply.code(404).send({ error: { code: err.code, message: err.message } });
  if (err instanceof ScriptConflictError) return reply.code(409).send({ error: { code: err.code, message: err.message } });
  if (err instanceof ScriptNotReadyError) return reply.code(412).send({ error: { code: err.code, message: err.message } });
  if (err instanceof ScriptBusyError) return reply.code(429).send({ error: { code: err.code, message: err.message } });
  reply.log.error({ err }, "Unhandled error in screenplay module");
  return reply.code(500).send({ error: { code: "AURA-SCR-500", message: "Unexpected error" } });
}

export async function registerScreenplayRoutes(app: FastifyInstance) {
  // AuraScript (screenplay.writing.ts): story development → outline → full script, scene rewrites, continuity.
  const w = <T>(fn: (req: import("fastify").FastifyRequest) => Promise<T>, code = 200) => async (request: import("fastify").FastifyRequest, reply: FastifyReply) => {
    try { return reply.code(code).send(await fn(request)); } catch (err) { return handleError(err, reply); }
  };
  const pid = (r: import("fastify").FastifyRequest) => (r.params as { id: string }).id;
  app.get("/api/projects/:id/script/writing", w((r) => listWriting(r.db, pid(r))));
  app.post("/api/projects/:id/script/writing", w((r) => requestWriting(r.db, pid(r), r.body), 201));
  app.post("/api/projects/:id/script/writing/outline", { bodyLimit: 1024 * 1024 }, w((r) => saveOutline(r.db, pid(r), r.body), 201));
  app.get("/api/projects/:id/script/continuity", w((r) => checkContinuity(r.db, pid(r))));
  app.get("/api/script-writing/:id", w((r) => getWriting(r.db, pid(r))));
  app.post("/api/script-writing/:id/apply-story", w((r) => applyStory(r.db, pid(r), r.body)));
  app.post("/api/script-writing/:id/open-draft", w((r) => openAsDraft(r.db, pid(r), r.body), 201));

  app.get("/api/projects/:id/script", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return await getWorkspace(request.db, id);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.post("/api/projects/:id/script/versions", { bodyLimit: 4 * 1024 * 1024 }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return reply.code(201).send(await saveScriptVersion(request.db, id, request.body));
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.post("/api/projects/:id/script/approve", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return await approveScript(request.db, id, request.body);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.get("/api/projects/:id/scope-plan", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return { plan: await getScopePlan(request.db, id, request.query) };
    } catch (err) {
      return handleError(err, reply);
    }
  });
}
