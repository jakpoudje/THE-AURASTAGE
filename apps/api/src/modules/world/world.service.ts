// apps/api/src/modules/world/world.service.ts — Locations & Props (migration 0028).
// Canonical owner of Location and Prop (SRS: Scene/Asset domain). Reads the approved script (Scriptwriter) and character
// names (Casting) — never writes them. worldExtractionEngine finds places and props with evidence; the person confirms,
// names, describes, adds or archives them. Reference views come from worldLookEngine and an image backend from the
// Provider Gateway, made in the generation worker; files are registered by the Assets domain (rule 4).
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ScreenplayElementSchema } from "@aurastage/contracts";
import { propContinuityEngine, sceneBoundaryEngine, worldExtraction, worldLook } from "@aurastage/engines";
import { stillBackends, stillBackendStatuses } from "../../providers";
import { readProjectSettings } from "../settings/settings.read";
import { mapDbError, WorldNotFoundError, WorldNotReadyError, WorldValidationError } from "./world.errors";

type Env = Record<string, string | undefined>;
type Row = Record<string, any>;
type Kind = "location" | "prop";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TABLE: Record<Kind, string> = { location: "locations", prop: "props" };

async function many(q: PromiseLike<{ data: unknown; error: any }>) {
  const { data, error } = await q;
  if (error) throw mapDbError(error);
  return (data ?? []) as Row[];
}
async function rpc<T>(db: SupabaseClient, fn: string, args: Row) {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw mapDbError(error);
  return data as T;
}
function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const p = schema.safeParse(body ?? {});
  if (!p.success) throw new WorldValidationError(p.error.issues, p.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; "));
  return p.data;
}
const kindOf = (k: string): Kind => {
  if (k !== "location" && k !== "prop") throw new WorldNotFoundError("Not found");
  return k;
};
async function assertProject(db: SupabaseClient, projectId: string) {
  if (!UUID.test(projectId)) throw new WorldNotFoundError("Project not found");
  const p = await many(db.from("projects").select("id").eq("id", projectId).limit(1));
  if (!p.length) throw new WorldNotFoundError("Project not found");
}

async function approvedScript(db: SupabaseClient, projectId: string) {
  const s = (await many(db.from("scripts").select("id, approved_version_id").eq("project_id", projectId).limit(1)))[0];
  if (!s?.approved_version_id) return null;
  const v = (await many(db.from("script_versions").select("id, version_number, elements").eq("id", s.approved_version_id).limit(1)))[0];
  return v ? (v as { id: string; version_number: number; elements: unknown[] }) : null;
}

/** What the approved script says right now (pure apart from the reads). */
export async function extractFromScript(db: SupabaseClient, projectId: string) {
  const version = await approvedScript(db, projectId);
  if (!version) return null;
  const elements = z.array(ScreenplayElementSchema).parse(version.elements);
  const { scenes } = sceneBoundaryEngine({ elements });
  const [chars, aliases] = await Promise.all([
    many(db.from("characters").select("name").eq("project_id", projectId)),
    many(db.from("character_aliases").select("alias").eq("project_id", projectId)),
  ]);
  const out = worldExtraction.worldExtractionEngine({ elements, scenes, character_names: [...chars.map((c) => c.name), ...aliases.map((a) => a.alias)].filter(Boolean) });
  return { version, out };
}

const dto = (kind: Kind, r: Row, apps: Row[], thumbs: Map<string, string>) => ({
  id: r.id, kind, name: r.name, key: r.key, description: r.description, status: r.status, source: r.source, revision: r.revision,
  archived: !!r.archived_at, missing_from_script: !!r.missing_since_version_id,
  ...(kind === "location" ? { int_ext: r.int_ext, times_of_day: r.times_of_day, areas: r.areas } : { category: r.category, descriptors: r.descriptors, confidence: r.confidence, reason: r.reason }),
  scenes: apps.filter((a) => a.object_type === kind && a.object_id === r.id).sort((a, b) => a.scene_number - b.scene_number)
    .map((a) => ({ scene_id: a.scene_id, scene_number: a.scene_number, line: a.line, evidence: a.evidence, source: a.source })),
  thumbnail_asset_id: thumbs.get(`${kind}:${r.id}`) ?? null,
});

export async function getWorldWorkspace(db: SupabaseClient, projectId: string) {
  await assertProject(db, projectId);
  const [locs, props, apps, refs, sync, script] = await Promise.all([
    many(db.from("locations").select("*").eq("project_id", projectId).order("created_at", { ascending: true })),
    many(db.from("props").select("*").eq("project_id", projectId).order("created_at", { ascending: true })),
    many(db.from("world_appearances").select("object_type, object_id, scene_id, scene_number, line, evidence, source").eq("project_id", projectId)),
    many(db.from("world_reference_images").select("object_type, object_id, view_key, asset_id, completed_at").eq("project_id", projectId).eq("status", "succeeded").not("asset_id", "is", null).order("completed_at", { ascending: false }).limit(1000)),
    many(db.from("jobs").select("input_snapshot, output_refs, engine_version, completed_at").eq("project_id", projectId).eq("engine_id", "world.worldExtractionEngine").eq("status", "completed").order("completed_at", { ascending: false }).limit(1)),
    many(db.from("scripts").select("approved_version_id").eq("project_id", projectId).limit(1)),
  ]);
  // Thumbnail: the latest establishing (location) or hero (prop) view, else any view.
  const thumbs = new Map<string, string>(), preferred = new Set<string>();
  for (const r of refs) {
    const k = `${r.object_type}:${r.object_id}`, p = /^(establishing|hero)/.test(r.view_key);
    if (!thumbs.has(k) || (p && !preferred.has(k))) { thumbs.set(k, r.asset_id); if (p) preferred.add(k); }
  }
  const approved = script[0]?.approved_version_id ?? null;
  const synced = sync[0]?.input_snapshot?.script_version_id ?? null;
  // Set dressing and prop continuity (free, built-in): each prop's state scene by scene, and where a later scene may forget it.
  const continuity = propContinuityEngine({
    props: props.filter((r) => !r.archived_at).map((r) => ({
      id: r.id as string, name: String(r.name),
      appearances: apps.filter((a) => a.object_type === "prop" && a.object_id === r.id).map((a) => ({ scene_number: Number(a.scene_number), evidence: String(a.evidence ?? "").slice(0, 4000) })),
    })),
  });
  return {
    continuity,
    locations: locs.map((r) => dto("location", r, apps, thumbs)),
    props: props.map((r) => dto("prop", r, apps, thumbs)),
    sync: {
      state: !approved ? "no_script" : !synced ? "never" : synced === approved ? "current" : "stale",
      synced_version_id: synced, synced_at: sync[0]?.completed_at ?? null, engine_version: sync[0]?.engine_version ?? null, summary: sync[0]?.output_refs ?? null,
    },
  };
}

export async function syncWorld(db: SupabaseClient, projectId: string) {
  await assertProject(db, projectId);
  const r = await extractFromScript(db, projectId);
  if (!r) throw new WorldNotReadyError("Approve the script in Scriptwriter first — locations and props are found in the approved version.");
  const summary = await rpc<Row>(db, "sync_world", {
    p_project: projectId, p_version: r.version.id, p_engine_version: r.out.engine_version,
    p_locations: r.out.locations, p_props: r.out.props.map((p) => ({ ...p })),
  });
  return { ...summary, script_version_number: r.version.version_number };
}

const SaveInput = z.object({
  revision: z.number().int().positive().optional(),
  name: z.string().trim().min(1, "Give it a name").max(160).optional(),
  description: z.string().max(2000).optional(),
  category: z.enum(["prop", "vehicle"]).optional(),
  status: z.enum(["detected", "confirmed"]).optional(),
  archived: z.boolean().optional(),
  int_ext: z.array(z.enum(["INT", "EXT"])).max(2).optional(),
}).strict();

export async function createWorldItem(db: SupabaseClient, projectId: string, kindRaw: string, body: unknown) {
  const kind = kindOf(kindRaw);
  await assertProject(db, projectId);
  const b = parse(SaveInput, body);
  if (!b.name) throw new WorldValidationError([], "Give it a name");
  const { revision: _r, ...patch } = b;
  return rpc<Row>(db, "save_world_item", { p_project: projectId, p_type: kind, p_id: null, p_revision: null, p_patch: patch });
}

async function item(db: SupabaseClient, kind: Kind, id: string) {
  if (!UUID.test(id)) throw new WorldNotFoundError(`${kind === "location" ? "Location" : "Prop"} not found`);
  const r = (await many(db.from(TABLE[kind]).select("*").eq("id", id).limit(1)))[0];
  if (!r) throw new WorldNotFoundError(`${kind === "location" ? "Location" : "Prop"} not found`);
  return r;
}

export async function updateWorldItem(db: SupabaseClient, kindRaw: string, id: string, body: unknown) {
  const kind = kindOf(kindRaw);
  const b = parse(SaveInput, body);
  if (!b.revision) throw new WorldValidationError([], "revision: send the revision you are editing");
  const r = await item(db, kind, id);
  const { revision, ...patch } = b;
  return rpc<Row>(db, "save_world_item", { p_project: r.project_id, p_type: kind, p_id: id, p_revision: revision, p_patch: patch });
}

// ---- Reference views ----------------------------------------------------------------------------------------------
async function lookFor(db: SupabaseClient, kind: Kind, id: string, views?: string[]) {
  const r = await item(db, kind, id);
  const style = (await readProjectSettings(db, r.project_id)).settings.style?.look ?? null;
  const out = worldLook.worldLookEngine({
    kind, style: style || null, views,
    item: { name: r.name, description: r.description || null, category: kind === "prop" ? r.category : null, int_ext: r.int_ext ?? [], times_of_day: r.times_of_day ?? [], areas: r.areas ?? [] },
  });
  return { r, out };
}

export async function getWorldLook(db: SupabaseClient, kindRaw: string, id: string, env: Env = process.env) {
  const kind = kindOf(kindRaw);
  const { r, out } = await lookFor(db, kind, id);
  const refs = await many(db.from("world_reference_images")
    .select("id, view_key, status, asset_id, error, provider, execution, identity_hash, created_at, completed_at")
    .eq("object_type", kind).eq("object_id", id).order("created_at", { ascending: false }).limit(300));
  const views = out.views.map((v) => {
    const hist = refs.filter((x) => x.view_key === v.key);
    const latest = hist[0] ?? null, lastGood = hist.find((x) => x.status === "succeeded" && x.asset_id) ?? null;
    return {
      ...v,
      latest: latest && { id: latest.id, status: latest.status, error: latest.error, provider: latest.provider, execution: latest.execution, created_at: latest.created_at },
      // Made from an older description / style: flagged for review, kept (rule 11).
      image: lastGood && { reference_id: lastGood.id, asset_id: lastGood.asset_id, provider: lastGood.provider, execution: lastGood.execution, created_at: lastGood.completed_at, stale: lastGood.identity_hash !== out.identity_hash },
      versions: hist.filter((x) => x.status === "succeeded" && x.asset_id).length,
    };
  });
  return {
    item: { id: r.id, kind, name: r.name, project_id: r.project_id },
    identity: out.identity, identity_hash: out.identity_hash, missing: out.missing, negative: out.negative, engine_version: out.engine_version,
    views, backends: stillBackends(env), backend_statuses: stillBackendStatuses(env),
  };
}

const GenerateInput = z.object({ views: z.array(z.string().regex(/^[a-z_]{2,20}(:[A-Z]{2,12})?$/)).min(1).max(40).optional(), provider: z.string().max(60).optional() }).strict();

export async function generateWorldLook(db: SupabaseClient, kindRaw: string, id: string, body: unknown, env: Env = process.env) {
  const kind = kindOf(kindRaw);
  const b = parse(GenerateInput, body);
  const { r, out } = await lookFor(db, kind, id, b.views);
  const views = b.views ? out.views : out.views.filter((v) => v.in_default_set);
  if (!views.length) throw new WorldValidationError([], "None of those views exist for this item.");
  const backends = stillBackends(env);
  // Built in (free) unless the person picks a connected paid backend: nothing spends money by default.
  const be = b.provider ? backends.find((x) => x.id === b.provider) : backends.find((x) => x.execution === "native");
  if (!be) throw new WorldValidationError([], b.provider ? `${b.provider} isn't connected on the server.` : "No image generator is available.");
  const requested: Row[] = [];
  for (const v of views) {
    const sketch = kind === "location"
      ? { kind, title: r.name, subtitle: v.label, view: v.view, time: v.time, int_ext: r.int_ext ?? [], lines: [out.identity] }
      : { kind, title: r.name, subtitle: v.label, view: v.view, category: r.category, lines: [out.identity] };
    const row = await rpc<Row>(db, "request_world_reference", {
      p_type: kind, p_id: id, p_view: v.key, p_aspect: v.aspect_ratio, p_prompt: v.prompt, p_negative: out.negative, p_identity_hash: out.identity_hash,
      p_provider: be.id, p_model: be.model, p_execution: be.execution, p_seed: Math.floor(Math.random() * 2 ** 31), p_sketch: sketch, p_engine_version: out.engine_version,
    });
    requested.push({ id: row.id, key: v.key, status: row.status, provider: be.id });
  }
  return { requested, provider: be.id, identity_hash: out.identity_hash };
}
