// apps/api/src/modules/collaboration/collaboration.controller.ts
// HTTP/API transport only; validation/auth context; no business logic.
// Domain: Team & Collaboration

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as svc from "./collaboration.service";
import {
  CollaborationConflictError, CollaborationGoneError, CollaborationNotFoundError, CollaborationValidationError,
} from "./collaboration.validator";
import { CollaborationForbiddenError } from "./collaboration.permissions";

function handleError(err: unknown, reply: FastifyReply) {
  const send = (status: number, e: Error & { code: string; issues?: unknown }) =>
    reply.code(status).send({ error: { code: e.code, message: e.message, issues: e.issues } });
  if (err instanceof CollaborationValidationError) return send(400, err);
  if (err instanceof CollaborationForbiddenError) return send(403, err);
  if (err instanceof CollaborationNotFoundError) return send(404, err);
  if (err instanceof CollaborationConflictError) return send(409, err);
  if (err instanceof CollaborationGoneError) return send(410, err);
  reply.log.error({ err }, "Unhandled error in collaboration module");
  return reply.code(500).send({ error: { code: "AURA-COL-500", message: "Unexpected error" } });
}

type Params = { id: string; userId: string };
const route =
  <T>(fn: (a: { params: Params; body: unknown; db: SupabaseClient; userId: string }) => Promise<T>) =>
  async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      return reply.send(await fn({ params: request.params as Params, body: request.body, db: request.db, userId: request.userId }));
    } catch (err) {
      return handleError(err, reply);
    }
  };

export async function registerCollaborationRoutes(app: FastifyInstance) {
  app.get("/api/organizations", route(({ db, userId }) => svc.listMyOrganizations(db, userId)));
  app.post("/api/organizations/bootstrap", route(({ db, userId, body }) => svc.bootstrapOrganization(db, userId, body)));

  // Studio people (owners, admins, producers)
  app.get("/api/organizations/:id/team", route(({ params, db }) => svc.getOrgTeam(db, params.id)));
  app.post("/api/organizations/:id/invites", route(({ params, body, db }) => svc.createInvite(db, params.id, body)));
  app.patch("/api/organizations/:id/members/:userId", route(({ params, body, db }) => svc.setOrgRole(db, params.id, params.userId, body)));
  app.delete("/api/organizations/:id/members/:userId", route(({ params, db }) => svc.removeOrgMember(db, params.id, params.userId)));

  // Project team
  app.get("/api/projects/:id/access", route(({ params, db }) => svc.getProjectAccess(db, params.id)));
  app.get("/api/projects/:id/team", route(({ params, db }) => svc.getProjectTeam(db, params.id)));
  app.post("/api/projects/:id/team/members", route(({ params, body, db }) => svc.setProjectMember(db, params.id, body)));
  app.delete("/api/projects/:id/team/members/:userId", route(({ params, db }) => svc.removeProjectMember(db, params.id, params.userId)));

  // Invites. Tokens travel in request bodies, never in URLs, so they don't end up in access logs.
  app.delete("/api/invites/:id", route(({ params, db }) => svc.revokeInvite(db, params.id)));
  app.post("/api/invites/preview", route(({ body, db }) => svc.previewInvite(db, body)));
  app.post("/api/invites/accept", route(({ body, db }) => svc.acceptInvite(db, body)));
}
