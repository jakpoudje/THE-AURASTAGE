// apps/api/src/storage/media.ts
// Private media store (Railway bucket, S3-compatible). Takes are written by the
// generation worker and shown to project members through short-lived signed
// links only — the bucket itself is never public.
// Env (Railway variable references to the "aurastage-media" bucket):
//   MEDIA_BUCKET, MEDIA_ENDPOINT, MEDIA_REGION, MEDIA_ACCESS_KEY_ID, MEDIA_SECRET_ACCESS_KEY
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

type Env = Record<string, string | undefined>;

export function mediaConfigured(env: Env = process.env) {
  return !!(env.MEDIA_BUCKET && env.MEDIA_ENDPOINT && env.MEDIA_ACCESS_KEY_ID && env.MEDIA_SECRET_ACCESS_KEY);
}

let cached: { key: string; client: S3Client } | null = null;
function client(env: Env) {
  const key = `${env.MEDIA_ENDPOINT}|${env.MEDIA_ACCESS_KEY_ID}`;
  if (cached?.key === key) return cached.client;
  const c = new S3Client({
    endpoint: env.MEDIA_ENDPOINT,
    region: env.MEDIA_REGION || "auto",
    credentials: { accessKeyId: env.MEDIA_ACCESS_KEY_ID!, secretAccessKey: env.MEDIA_SECRET_ACCESS_KEY! },
  });
  cached = { key, client: c };
  return c;
}

export async function putMedia(storageKey: string, bytes: Uint8Array, contentType: string, env: Env = process.env) {
  await client(env).send(new PutObjectCommand({ Bucket: env.MEDIA_BUCKET, Key: storageKey, Body: bytes, ContentType: contentType }));
}

export async function getMedia(storageKey: string, env: Env = process.env): Promise<{ bytes: Uint8Array; contentType: string }> {
  const r = await client(env).send(new GetObjectCommand({ Bucket: env.MEDIA_BUCKET, Key: storageKey }));
  return { bytes: await r.Body!.transformToByteArray(), contentType: r.ContentType ?? "application/octet-stream" };
}

/** Signed, time-limited link for one object (default 1 hour). */
export async function signedMediaUrl(storageKey: string, seconds = 3600, env: Env = process.env) {
  return getSignedUrl(client(env), new GetObjectCommand({ Bucket: env.MEDIA_BUCKET, Key: storageKey }), { expiresIn: seconds });
}

/** Object key layout: <org>/<project>/takes/<shot>/<take>.<ext> */
export function takeStorageKey(t: { org_id: string; project_id: string; shot_id: string; id: string }, mediaType: string) {
  const ext = mediaType.includes("svg") ? "svg" : mediaType.includes("png") ? "png" : mediaType.includes("jpeg") ? "jpg" : mediaType.includes("webp") ? "webp" : mediaType.includes("mp4") ? "mp4" : "bin";
  return `${t.org_id}/${t.project_id}/takes/${t.shot_id}/${t.id}.${ext}`;
}
