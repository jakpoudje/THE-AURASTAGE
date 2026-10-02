// apps/api/src/modules/assets/assets.controller.ts
// HTTP/API transport only; validation/auth context; no business logic.
// Domain: Assets Library
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { deleteAsset, deleteAssets, editAsset, getAssetDetail, getLibrary, linkAsset, listProjectAssets, readAssetContent, readAssetVersionContent, replaceAsset, requestVideoEdit, uploadAsset, uploadAudio } from "./assets.service";
import { AssetConflictError, AssetNotFoundError, AssetNotReadyError, AssetValidationError, MAX_ASSET_BYTES, MAX_AUDIO_BYTES } from "./assets.validator";
import { AssetForbiddenError } from "./assets.permissions";

function handleError(err: unknown, reply: FastifyReply) {
  const send = (status: number, e: Error & { code: string }) => reply.code(status).send({ error: { code: e.code, message: e.message } });
  if (err instanceof AssetValidationError) return send(400, err);
  if (err instanceof AssetForbiddenError) return send(403, err);
  if (err instanceof AssetNotFoundError) return send(404, err);
  if (err instanceof AssetConflictError) return send(409, err);
  if (err instanceof AssetNotReadyError) return send(412, err);
  reply.log.error({ err }, "Unhandled error in assets module");
  return reply.code(500).send({ error: { code: "AURA-AST-500", message: "Unexpected error" } });
}

export async function registerAssetsRoutes(app: FastifyInstance) {
  // Raw audio bodies (the browser sends the file itself, not a form).
  app.addContentTypeParser(/^audio\/.*/, { parseAs: "buffer", bodyLimit: MAX_AUDIO_BYTES + 1024 }, (_req, body, done) => done(null, body));
  // Library uploads: images, video, PDFs, text/CSV and .cube LUTs, sent as the raw file (checked by content).
  app.addContentTypeParser(/^(image\/|video\/|application\/pdf|application\/x-cube|text\/plain|text\/csv)/, { parseAs: "buffer", bodyLimit: MAX_ASSET_BYTES + 1024 }, (_req, body, done) => done(null, body));
  const route = (fn: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>) => async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      return await fn(request, reply);
    } catch (err) {
      return handleError(err, reply);
    }
  };
  const P = (r: FastifyRequest) => r.params as { id: string };

  app.get("/api/projects/:id/library", route(async (r) => getLibrary(r.db, P(r).id, r.query as Record<string, string>)));
  app.post("/api/projects/:id/library", { bodyLimit: MAX_ASSET_BYTES + 1024 }, route(async (r, reply) =>
    reply.code(201).send(await uploadAsset(r.db, P(r).id, r.body, String(r.headers["content-type"] ?? ""), r.query as Record<string, string>))));
  app.get("/api/assets/:id", route(async (r) => getAssetDetail(r.db, P(r).id)));
  app.patch("/api/assets/:id", route(async (r) => editAsset(r.db, P(r).id, r.body)));
  app.post("/api/assets/:id/delete", route(async (r) => deleteAsset(r.db, P(r).id, r.body)));
  app.post("/api/projects/:id/library/delete", route(async (r) => deleteAssets(r.db, P(r).id, r.body)));
  app.post("/api/assets/:id/versions", { bodyLimit: MAX_ASSET_BYTES + 1024 }, route(async (r, reply) =>
    reply.code(201).send(await replaceAsset(r.db, P(r).id, r.body, String(r.headers["content-type"] ?? ""), r.query as Record<string, string>))));
  app.post("/api/assets/:id/links", route(async (r) => linkAsset(r.db, P(r).id, r.body)));
  app.post("/api/assets/:id/video-edit", route(async (r, reply) => reply.code(201).send(await requestVideoEdit(r.db, P(r).id, r.body))));

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
      const { version, download } = request.query as { version?: string; download?: string };
      if (version || download) {
        const n = version ? Number(version) : null;
        if (n !== null && !(Number.isInteger(n) && n >= 1)) throw new AssetValidationError("Unknown version.");
        const c = await readAssetVersionContent(request.db, id, n);
        if (download) reply.header("Content-Disposition", `attachment; filename="${c.filename}"`);
        return reply.header("Content-Type", c.contentType).header("Cache-Control", "private, max-age=3600").send(c.bytes);
      }
      const c = await readAssetContent(request.db, id);
      return reply.header("Content-Type", c.contentType).header("Cache-Control", "private, max-age=3600").send(c.bytes);
    } catch (err) {
      return handleError(err, reply);
    }
  });
}
