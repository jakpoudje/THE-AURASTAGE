// apps/api/src/modules/assets/assets.controller.ts
// HTTP/API transport only; validation/auth context; no business logic.
// Domain: Assets Library
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { listProjectAssets, readAssetContent, uploadAudio } from "./assets.service";
import { AssetNotFoundError, AssetNotReadyError, AssetValidationError, MAX_AUDIO_BYTES } from "./assets.validator";
import { AssetForbiddenError } from "./assets.permissions";

function handleError(err: unknown, reply: FastifyReply) {
  const send = (status: number, e: Error & { code: string }) => reply.code(status).send({ error: { code: e.code, message: e.message } });
  if (err instanceof AssetValidationError) return send(400, err);
  if (err instanceof AssetForbiddenError) return send(403, err);
  if (err instanceof AssetNotFoundError) return send(404, err);
  if (err instanceof AssetNotReadyError) return send(412, err);
  reply.log.error({ err }, "Unhandled error in assets module");
  return reply.code(500).send({ error: { code: "AURA-AST-500", message: "Unexpected error" } });
}

export async function registerAssetsRoutes(app: FastifyInstance) {
  // Raw audio bodies (the browser sends the file itself, not a form).
  app.addContentTypeParser(/^audio\/.*/, { parseAs: "buffer", bodyLimit: MAX_AUDIO_BYTES + 1024 }, (_req, body, done) => done(null, body));

  app.post("/api/projects/:id/assets/audio", { bodyLimit: MAX_AUDIO_BYTES + 1024 }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      return reply.code(201).send(await uploadAudio(request.db, id, request.body, String(request.headers["content-type"] ?? ""), request.query as Record<string, string>));
    } catch (err) {
      return handleError(err, reply);
    }
  });
  app.get("/api/projects/:id/assets", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { type } = request.query as { type?: string };
      return reply.send(await listProjectAssets(request.db, id, type ?? null));
    } catch (err) {
      return handleError(err, reply);
    }
  });
  app.get("/api/assets/:id/content", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const c = await readAssetContent(request.db, id);
      return reply.header("Content-Type", c.contentType).header("Cache-Control", "private, max-age=3600").send(c.bytes);
    } catch (err) {
      return handleError(err, reply);
    }
  });
}
