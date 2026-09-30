// apps/api/src/modules/assets/assets.service.ts
// Domain workflow for the Assets Library (canonical owner of media files).
// Audio uploads are checked by content, fingerprinted (SHA-256), stored in the
// private media bucket and registered with an audit event. Bytes are only ever
// served back to project members through this API.
import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteMedia, getMedia, mediaConfigured, putMedia } from "../../storage/media";
import { assertAssetAccess, assertProjectAccess } from "./assets.permissions";
import * as repo from "./assets.repository";
import { toAssetDTO } from "./assets.mapper";
import { AssetConflictError, AssetNotFoundError, AssetNotReadyError, AssetValidationError, cleanName, MAX_AUDIO_BYTES, sniffAsset, sniffAudio } from "./assets.validator";
import { ASSET_CATEGORIES, AssetCategorySchema, AssetLinkInputSchema, UpdateAssetInputSchema } from "@aurastage/contracts";
import { assetCatalog, assetCatalogEngine } from "@aurastage/engines";
const { CatalogQuerySchema } = assetCatalog;

type Env = Record<string, string | undefined>;
type Row = Record<string, any>;

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

// ---------------------------------------------------------------------------------
// Assets Library (completion pass 12b)
// ---------------------------------------------------------------------------------
type Usage = { kind: "audio_clip" | "render" | "link" | "reference"; scene_id: string | null; label: string; href: string | null };

const PROFILE_LABELS: Record<string, string> = {
  streaming_master: "Streaming Master", review_copy: "Review Copy", mezzanine_master: "Mezzanine Master", audio_package: "Audio Package",
  subtitles: "Subtitles", edit_decision_list: "Edit Decision List",
};

/** Where every asset is used, from the records themselves: Audio Studio clips, render manifests, and links people made. */
async function usageIndex(db: SupabaseClient, projectId: string) {
  const [clips, sessions, scenes, chars, links, renders, world, refs] = await Promise.all([
    repo.listAssetClips(db, projectId), repo.listSessions(db, projectId), repo.listScenes(db, projectId),
    repo.listCharacters(db, projectId), repo.listLinks(db, projectId), repo.listRenderSources(db, projectId), repo.listWorldNames(db, projectId),
    repo.listReferenceUses(db, projectId),
  ]);
  const sceneLabel = (id: string) => {
    const s = scenes.find((x) => x.id === id);
    return s ? `Scene ${s.number} — ${s.heading}` : "A scene";
  };
  const map = new Map<string, Usage[]>();
  const push = (id: string, u: Usage) => {
    const list = map.get(id) ?? [];
    if (!list.some((x) => x.kind === u.kind && x.label === u.label)) list.push(u);
    map.set(id, list);
  };
  for (const c of clips) {
    const s = sessions.find((x) => x.id === c.session_id);
    if (s) push(c.asset_id, { kind: "audio_clip", scene_id: s.scene_id, label: `${sceneLabel(s.scene_id)} · Audio Studio`, href: `/projects/${projectId}/audio` });
  }
  for (const l of links) {
    if (l.object_type === "scene") push(l.asset_id, { kind: "link", scene_id: l.object_id, label: sceneLabel(l.object_id), href: `/projects/${projectId}/scene-dna` });
    else if (l.object_type === "location" || l.object_type === "prop") {
      const w = world.find((x) => x.id === l.object_id);
      push(l.asset_id, { kind: "link", scene_id: null, label: `${w?.name ?? (l.object_type === "location" ? "A location" : "A prop")} · Locations & Props`, href: `/projects/${projectId}/world` });
    } else {
      const ch = chars.find((x) => x.id === l.object_id);
      push(l.asset_id, { kind: "link", scene_id: null, label: `${ch?.name ?? "A character"} · Casting`, href: `/projects/${projectId}/casting` });
    }
  }
  // Reference views: the image a character's or place's look is built from (prompts send it to image providers).
  for (const r of refs.characters) {
    const ch = chars.find((x) => x.id === r.character_id);
    push(r.asset_id, { kind: "reference", scene_id: null, label: `${ch?.name ?? "A character"} · Look & References (${String(r.angle).replace(/_/g, " ")} ${String(r.size).replace(/_/g, " ").toLowerCase()})`, href: `/projects/${projectId}/casting` });
  }
  for (const r of refs.world) {
    const w = world.find((x) => x.id === r.object_id);
    push(r.asset_id, { kind: "reference", scene_id: null, label: `${w?.name ?? (r.object_type === "location" ? "A location" : "A prop")} · Locations & Props (${String(r.view_key).replace(/[_:]/g, " ").toLowerCase()} view)`, href: `/projects/${projectId}/world` });
  }
  for (const r of renders) {
    for (const id of (Array.isArray(r.asset_ids) ? r.asset_ids : []) as string[]) {
      push(id, { kind: "render", scene_id: null, label: `${PROFILE_LABELS[r.profile_id] ?? r.profile_id} · Picture Lock ${r.lock_number}`, href: `/projects/${projectId}/export` });
    }
  }
  return { map, scenes, chars };
}

const toLibraryDTO = (r: Row, versions: number, usage: Usage[]) => ({
  ...toAssetDTO(r),
  category: r.category as string,
  description: (r.description ?? "") as string,
  tags: (r.tags ?? []) as string[],
  current_version: (r.current_version ?? 1) as number,
  versions,
  archived: !!r.archived_at,
  updated_at: (r.updated_at ?? r.created_at) as string,
  specs: {
    media_type: r.metadata?.media_type ?? null,
    size_bytes: r.metadata?.size_bytes ?? null,
    duration_seconds: r.metadata?.duration_seconds ?? null,
    sample_rate: r.metadata?.sample_rate ?? null,
    channels: r.metadata?.channels ?? null,
    width: r.metadata?.width ?? null,
    height: r.metadata?.height ?? null,
  },
  usage,
});

export async function getLibrary(db: SupabaseClient, projectId: string, query: Record<string, string | undefined>) {
  await assertProjectAccess(db, projectId);
  const [all, vrows, idx] = await Promise.all([repo.listAllAssets(db, projectId), repo.versionCounts(db, projectId), usageIndex(db, projectId)]);
  const vcount = vrows.reduce<Record<string, number>>((m, v) => ((m[v.asset_id] = (m[v.asset_id] ?? 0) + 1), m), {});
  const items = all.map((r) => toLibraryDTO(r, vcount[r.id] ?? 1, idx.map.get(r.id) ?? []));
  const q = CatalogQuerySchema.safeParse({
    q: query.q ?? "", category: query.category || null, type: query.type || null, usage: query.usage || "any",
    scene_id: query.scene_id || null, archived: query.archived === "1" || query.archived === "true", sort: query.sort || "newest",
  });
  if (!q.success) throw new AssetValidationError("Those filters aren't valid.");
  const out = assetCatalogEngine({
    assets: items.map((a) => ({ id: a.id, type: a.type, category: a.category, name: a.name, description: a.description, tags: a.tags, archived: a.archived, created_at: a.created_at, usage: a.usage })),
    query: q.data,
  });
  const byId = new Map(items.map((a) => [a.id, a]));
  return {
    assets: out.ids.map((id) => byId.get(id)!),
    total: out.total,
    library_size: items.filter((a) => !a.archived).length,
    archived_count: items.filter((a) => a.archived).length,
    category_counts: out.category_counts,
    type_counts: out.type_counts,
    categories: ASSET_CATEGORIES,
    scenes: idx.scenes.map((s) => ({ id: s.id, number: s.number, heading: s.heading })),
    characters: idx.chars.map((c) => ({ id: c.id, name: c.name })),
    media_ready: mediaConfigured(),
    search_note: "Search matches names, descriptions, tags and categories. Searching inside images or audio isn't available yet.",
    engine_version: out.engine_version,
  };
}

export async function getAssetDetail(db: SupabaseClient, assetId: string) {
  const a = await assertAssetAccess(db, assetId);
  const [versions, idx, history] = await Promise.all([repo.listVersions(db, assetId), usageIndex(db, a.project_id), repo.listHistory(db, assetId)]);
  const usage = idx.map.get(assetId) ?? [];
  return {
    asset: toLibraryDTO(a, versions.length || 1, usage),
    versions: versions.map((v) => ({
      version_number: v.version_number, checksum: v.checksum, note: v.note, created_at: v.created_at, current: v.version_number === (a.current_version ?? 1),
      size_bytes: v.metadata?.size_bytes ?? null, media_type: v.metadata?.media_type ?? null,
    })),
    links: usage.filter((u) => u.kind === "link"),
    history: history.map((h) => ({ action: h.action, metadata: h.metadata, created_at: h.created_at })),
  };
}

export async function uploadAsset(
  db: SupabaseClient, projectId: string, body: unknown, contentType: string,
  query: { name?: string; category?: string; duration?: string; sample_rate?: string; channels?: string; width?: string; height?: string },
  env: Env = process.env
) {
  const project = await assertProjectAccess(db, projectId);
  if (!mediaConfigured(env)) throw new AssetNotReadyError("Media storage isn't set up on the server yet.");
  const kind = sniffAsset(body as Buffer, contentType);
  const bytes = body as Buffer;
  const name = cleanAssetName(query.name);
  const category = query.category ? AssetCategorySchema.safeParse(query.category) : null;
  if (category && !category.success) throw new AssetValidationError("Unknown category.");
  const key = `${project.org_id}/${projectId}/assets/${randomUUID()}.${kind.ext}`;
  await putMedia(key, bytes, kind.media_type, env);
  const row = await repo.registerAsset(db, {
    projectId, type: kind.type, name, path: key, checksum: createHash("sha256").update(bytes).digest("hex"), metadata: fileMetadata(kind.media_type, bytes.length, query),
  });
  if (category?.success && category.data !== row.category) await repo.updateAsset(db, row.id, { category: category.data });
  return getAssetDetail(db, row.id);
}

/** Replace: stores the new file under a new key and adds a version; the earlier files are kept. */
export async function replaceAsset(db: SupabaseClient, assetId: string, body: unknown, contentType: string, query: Record<string, string | undefined>, env: Env = process.env) {
  const a = await assertAssetAccess(db, assetId);
  if (!mediaConfigured(env)) throw new AssetNotReadyError("Media storage isn't set up on the server yet.");
  const kind = sniffAsset(body as Buffer, contentType);
  if (kind.type !== a.type) throw new AssetValidationError(`This asset is ${a.type === "image" ? "an image" : a.type}; replace it with the same kind of file.`);
  const bytes = body as Buffer;
  const key = `${a.org_id}/${a.project_id}/assets/${randomUUID()}.${kind.ext}`;
  const checksum = createHash("sha256").update(bytes).digest("hex");
  if (checksum === a.checksum) throw new AssetConflictError("That file is identical to the current version.");
  await putMedia(key, bytes, kind.media_type, env);
  await repo.addVersion(db, { assetId, path: key, checksum, metadata: fileMetadata(kind.media_type, bytes.length, query), note: String(query.note ?? "").slice(0, 500) });
  return getAssetDetail(db, assetId);
}

export async function editAsset(db: SupabaseClient, assetId: string, payload: unknown) {
  await assertAssetAccess(db, assetId);
  const p = UpdateAssetInputSchema.safeParse(payload);
  if (!p.success) throw new AssetValidationError(p.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; "));
  await repo.updateAsset(db, assetId, p.data);
  return getAssetDetail(db, assetId);
}

/**
 * Deletes an asset for good (owner request 2026-09-30). `confirm` is needed when it is in use anywhere (the detail view
 * lists exactly where first); a recording on Audio Studio clips is refused with the scenes named. Then every version's
 * file is removed from the private bucket; a file that can't be removed is reported, never silently kept as "deleted".
 */
export async function deleteAsset(db: SupabaseClient, assetId: string, payload: unknown, env: Env = process.env) {
  await assertAssetAccess(db, assetId);
  const confirm = !!(payload && typeof payload === "object" && (payload as Row).confirm === true);
  const r = await repo.deleteAsset(db, assetId, confirm);
  const paths = (r.storage_paths ?? []).filter(Boolean);
  let left = 0;
  if (paths.length && mediaConfigured(env)) {
    for (const p of paths) await deleteMedia(p, env).catch(() => void left++);
  }
  return { deleted: true, name: r.name, files_removed: mediaConfigured(env) ? paths.length - left : 0, files_left: mediaConfigured(env) ? left : paths.length };
}

export async function linkAsset(db: SupabaseClient, assetId: string, payload: unknown) {
  await assertAssetAccess(db, assetId);
  const p = AssetLinkInputSchema.safeParse(payload);
  if (!p.success) throw new AssetValidationError("Choose a scene or character in this project.");
  await repo.setLink(db, assetId, p.data.object_type, p.data.object_id, p.data.linked);
  return getAssetDetail(db, assetId);
}

/** The bytes of the current version, or an earlier one with ?version=N (history is never lost). */
export async function readAssetVersionContent(db: SupabaseClient, assetId: string, version: number | null, env: Env = process.env) {
  const a = await assertAssetAccess(db, assetId);
  let path = a.storage_path as string | null, mediaType = a.metadata?.media_type as string | undefined;
  if (version !== null && version !== (a.current_version ?? 1)) {
    const v = await repo.getVersion(db, assetId, version);
    if (!v) throw new AssetNotFoundError(`Version ${version} doesn't exist.`);
    path = v.storage_path;
    mediaType = v.metadata?.media_type;
  }
  if (!path) throw new AssetNotReadyError("This asset has no stored file.");
  const m = await getMedia(path, env);
  const ext = path.split(".").pop() ?? "bin";
  return { bytes: Buffer.from(m.bytes), contentType: mediaType ?? m.contentType, filename: `${String(a.name).replace(/[^\w .-]+/g, "_").slice(0, 120)}${version ? `_v${version}` : ""}.${ext}` };
}

function fileMetadata(media_type: string, size: number, q: Record<string, string | undefined>) {
  const num = (v?: string) => (v && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
  return { media_type, size_bytes: size, duration_seconds: num(q.duration), sample_rate: num(q.sample_rate), channels: num(q.channels), width: num(q.width), height: num(q.height) };
}
function cleanAssetName(name: unknown) {
  const n = String(name ?? "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 200);
  if (!n) throw new AssetValidationError("Give the asset a name.");
  return n;
}
