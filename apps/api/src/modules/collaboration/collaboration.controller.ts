// apps/api/src/modules/collaboration/collaboration.controller.ts
// HTTP/API transport only; validation/auth context; no business logic.
// Domain: Team & Collaboration

import type { FastifyInstance, FastifyReply } from "fastify";
import { bootstrapOrganization, listMyOrganizations } from "./collaboration.service";
import { CollaborationValidationError } from "./collaboration.validator";

function handleError(err: unknown, reply: FastifyReply) {
  if (err instanceof CollaborationValidationError) {
    return reply.code(400).send({ error: { code: err.code, message: err.message, issues: err.issues } });
  }
  reply.log.error({ err }, "Unhandled error in collaboration module");
  return reply.code(500).send({ error: { code: "AURA-MOS-500", message: "Unexpected error" } });
}

export async function registerCollaborationRoutes(app: FastifyInstance) {
  app.get("/api/organizations", async (request, reply) => {
    try {
      return await listMyOrganizations(request.db, request.userId);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.post("/api/organizations/bootstrap", async (request, reply) => {
    try {
      const org = await bootstrapOrganization(request.db, request.userId, request.body);
      return reply.code(200).send(org);
    } catch (err) {
      return handleError(err, reply);
    }
  });
}
