// apps/api/src/modules/assets/assets.service.ts
// Domain workflow for the Assets Library (canonical owner of media files).
// Audio uploads are checked by content, fingerprinted (SHA-256), stored in the
// private media bucket and registered with an audit event. Bytes are only ever
// served back to project members through this API.
import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMedia, mediaConfigured, putMedia } from "../../storage/media";
import { assertAssetAccess, assertProjectAccess } from "./assets.permissions";
import * as repo from "./assets.repository";
import { toAssetDTO } from "./assets.mapper";
import { AssetNotReadyError, AssetValidationError, cleanName, MAX_AUDIO_BYTES, sniffAudio } from "./assets.validator";

type Env = Record<string, string | undefined>;

export async function uploadAudio(
  db: SupabaseClient,
  projectId: string,
  body: unknown,
  contentType: string,
  query: { name?: string; duration?: string; sample_rate?: string; channels?: string },
  env: Env = process.env
) {
  const project = await assertProjectAccess(db, projectId);
  if (!mediaConfigured(env)) throw new AssetNotReadyError("Media storage isn't set up on the server yet.");
  if (!Buffer.isBuffer(body) || body.length === 0) throw new AssetValidationError("No audio was received.");
  if (body.length > MAX_AUDIO_BYTES) throw new AssetValidationError("That file is larger than 50 MB.");
  const { ext, media_type } = sniffAudio(body, contentType);
  const name = cleanName(query.name);
  const num = (v?: string) => (v && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
  const key = `${project.org_id}/${projectId}/assets/${randomUUID()}.${ext}`;
  await putMedia(key, body, media_type, env);
  const row = await repo.registerAsset(db, {
    projectId,
    type: "audio",
    name,
    path: key,
    checksum: createHash("sha256").update(body).digest("hex"),
    metadata: { media_type, size_bytes: body.length, duration_seconds: num(query.duration), sample_rate: num(query.sample_rate), channels: num(query.channels) },
  });
  return toAssetDTO(row);
}

export async function listProjectAssets(db: SupabaseClient, projectId: string, type: string | null) {
  await assertProjectAccess(db, projectId);
  return (await repo.listAssets(db, projectId, type)).map(toAssetDTO);
}

export async function readAssetContent(db: SupabaseClient, assetId: string, env: Env = process.env) {
  const a = await assertAssetAccess(db, assetId);
  if (!a.storage_path) throw new AssetNotReadyError("This asset has no stored file.");
  const m = await getMedia(a.storage_path, env);
  return { bytes: Buffer.from(m.bytes), contentType: a.metadata?.media_type ?? m.contentType, name: a.name as string };
}
