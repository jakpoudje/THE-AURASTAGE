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

type Params = { id: string; userId: string; stage: string };
type Query = Record<string, string | undefined>;
const route =
  <T>(fn: (a: { params: Params; query: Query; body: unknown; db: SupabaseClient; userId: string }) => Promise<T>) =>
  async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      return reply.send(await fn({ params: request.params as Params, query: (request.query ?? {}) as Query, body: request.body, db: request.db, userId: request.userId }));
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
  app.get("/api/projects/:id/stage-owners", route(({ params, db }) => svc.getStageOwners(db, params.id)));
  app.put("/api/projects/:id/stage-owners/:stage", route(({ params, body, db }) => svc.setStageOwners(db, params.id, params.stage, body)));
  app.delete("/api/projects/:id/team/members/:userId", route(({ params, db }) => svc.removeProjectMember(db, params.id, params.userId)));

  // Invites. Tokens travel in request bodies, never in URLs, so they don't end up in access logs.
  app.delete("/api/invites/:id", route(({ params, db }) => svc.revokeInvite(db, params.id)));
  app.post("/api/invites/preview", route(({ body, db }) => svc.previewInvite(db, body)));
  app.post("/api/invites/accept", route(({ body, db }) => svc.acceptInvite(db, body)));

  // Comments (version-aware, optional timecode anchor), tasks/review requests, notifications, activity
  app.get("/api/projects/:id/comments", route(({ params, query, db }) => svc.listComments(db, params.id, query)));
  app.post("/api/projects/:id/comments", route(({ params, body, db }) => svc.addComment(db, params.id, body)));
  app.post("/api/comments/:id/resolve", route(({ params, body, db }) => svc.resolveComment(db, params.id, body)));
  app.patch("/api/comments/:id", route(({ params, body, db }) => svc.editComment(db, params.id, body)));
  app.delete("/api/comments/:id", route(({ params, db }) => svc.deleteComment(db, params.id)));
  app.get("/api/projects/:id/tasks", route(({ params, db }) => svc.listTasks(db, params.id)));
  app.post("/api/projects/:id/tasks", route(({ params, body, db }) => svc.createTask(db, params.id, body)));
  app.get("/api/tasks/mine", route(({ db }) => svc.listTasks(db, null)));
  app.patch("/api/tasks/:id", route(({ params, body, db }) => svc.setTaskStatus(db, params.id, body)));
  app.get("/api/notifications", route(({ db }) => svc.listNotifications(db)));
  app.post("/api/notifications/read", route(({ body, db }) => svc.markNotificationsRead(db, body)));
  app.get("/api/projects/:id/activity", route(({ params, query, db }) => svc.projectActivity(db, params.id, query)));
}
