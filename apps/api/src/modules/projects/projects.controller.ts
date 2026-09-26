// apps/api/src/modules/projects/projects.controller.ts
// HTTP/API transport only; validation/auth context; no business logic.
// Domain: Projects

import type { FastifyInstance, FastifyReply } from "fastify";
import { createProject, editProject, getProject, listProjects } from "./projects.service";
import { ProjectValidationError } from "./projects.validator";
import { ForbiddenError } from "./projects.permissions";

function handleError(err: unknown, reply: FastifyReply) {
  if (err instanceof ProjectValidationError) {
    return reply.code(400).send({ error: { code: err.code, message: err.message, issues: err.issues } });
  }
  if (err instanceof ForbiddenError) {
    return reply.code(403).send({ error: { code: err.code, message: err.message } });
  }
  reply.log.error({ err }, "Unhandled error in projects module");
  return reply.code(500).send({ error: { code: "AURA-SCR-500", message: "Unexpected error" } });
}

export async function registerProjectsRoutes(app: FastifyInstance) {
  app.get("/api/projects", async (request, reply) => {
    const orgId = (request.query as Record<string, string>).org_id;
    if (!orgId) return reply.code(400).send({ error: { code: "AURA-SCR-400", message: "org_id is required" } });
    try {
      return await listProjects(request.db, orgId);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.get("/api/projects/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const project = await getProject(request.db, id);
      if (!project) return reply.code(404).send({ error: { code: "AURA-SCR-404", message: "Project not found" } });
      return project;
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.post("/api/projects", async (request, reply) => {
    try {
      const project = await createProject(request.db, request.body, request.userId);
      return reply.code(201).send(project);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.patch("/api/projects/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { org_id: string } & Record<string, unknown>;
    try {
      const project = await editProject(request.db, id, body, body.org_id);
      return project;
    } catch (err) {
      return handleError(err, reply);
    }
  });
}
