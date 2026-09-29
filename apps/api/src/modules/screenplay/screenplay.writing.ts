// apps/api/src/modules/screenplay/screenplay.writing.ts — AuraScript (migration 0030). Scriptwriter owns the writing jobs.
// The API builds each task from canonical data (the Project's story fields, the accepted story development, the
// writer-edited outline, the current script version) and freezes it into the job; the generation worker asks the
// reasoning backend and checks the answer (scriptWritingEngine). Results never change anything on their own: story
// fields are applied field by field when the writer accepts them, and scripts / rewritten scenes open as a NEW draft
// version through the normal save path (base-version checked), which the writer approves as usual (rules 10–11).
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { continuityCheckEngine, sceneBoundaryEngine, scriptWriting, storyDevelopment } from "@aurastage/engines";
import { reasoningProvider } from "../../providers";
import { editProject } from "../projects/projects.service";
import { assertProjectAccess } from "./screenplay.permissions";
import * as repo from "./screenplay.repository";
import { saveScriptVersion } from "./screenplay.service";
import { toScriptVersionDTO } from "./screenplay.mapper";
import { ScriptConflictError, ScriptNotFoundError, ScriptValidationError } from "./screenplay.validator";
import { ScriptForbiddenError } from "./screenplay.permissions";
import { colForbiddenMessage } from "../../infrastructure/permissions";

type Row = Record<string, any>;
type Env = Record<string, string | undefined>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ScriptNotReadyError extends Error { code = "AURA-SCR-412"; }
export class ScriptBusyError extends Error { code = "AURA-SCR-429"; }

function mapErr(error: { message?: string; code?: string }): Error {
  const msg = error.message ?? "", text = msg.replace(/^AURA-[A-Z]+-\d+:\s*/, "");
  if (msg.startsWith("AURA-SCR-409")) return new ScriptConflictError(text || undefined);
  if (msg.startsWith("AURA-SCR-429")) return new ScriptBusyError(text);
  if (msg.startsWith("AURA-SCR-404")) return new ScriptNotFoundError(text);
  if (msg.startsWith("AURA-SCR-400")) return new ScriptValidationError([], text);
  if (msg.startsWith("AURA-COL-403") || error.code === "42501") return new ScriptForbiddenError(colForbiddenMessage(error));
  return Object.assign(new Error(msg || "Database error"), { cause: error });
}
async function rpc<T>(db: SupabaseClient, fn: string, args: Row) {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw mapErr(error);
  return data as T;
}
async function rows(q: PromiseLike<{ data: unknown; error: any }>) {
  const { data, error } = await q;
  if (error) throw mapErr(error);
  return (data ?? []) as Row[];
}
function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const p = schema.safeParse(body ?? {});
  if (!p.success) throw new ScriptValidationError(p.error.issues, p.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; "));
  return p.data;
}

const PROJECT_FIELDS = "id, org_id, title, type, logline, synopsis, genre, subgenre, tone, setting, time_period, target_runtime_minutes";
async function project(db: SupabaseClient, projectId: string) {
  await assertProjectAccess(db, projectId);
  const p = (await rows(db.from("projects").select(PROJECT_FIELDS).eq("id", projectId).limit(1)))[0];
  if (!p) throw new ScriptNotFoundError("Project not found");
  return p;
}
async function generation(db: SupabaseClient, id: string) {
  if (!UUID.test(id)) throw new ScriptNotFoundError("Writing result not found");
  const g = (await rows(db.from("script_generations").select("*").eq("id", id).limit(1)))[0];
  if (!g) throw new ScriptNotFoundError("Writing result not found");
  return g;
}

/** The story bible for writing: Project fields + the accepted story development (its characters and beats). */
function storyOf(p: Row, dev: Row | null, castFallback: Row[]) {
  const out = dev?.output ?? null;
  const characters = out?.characters?.length
    ? out.characters.map((c: Row) => ({ name: c.name, role: c.role, age: c.age ?? null, description: c.description ?? "", want: c.want ?? "", need: c.need ?? "", arc: c.arc ?? "" }))
    : castFallback.map((c) => ({ name: c.name, role: c.role ?? "supporting", age: Number.parseInt(c.age, 10) || null, description: c.description ?? "", want: "", need: "", arc: "" }));
  return {
    title: p.title, type: p.type ?? "feature_film", logline: p.logline ?? out?.logline ?? null, synopsis: p.synopsis ?? out?.synopsis ?? null,
    genre: p.genre ?? null, tone: p.tone ?? null, setting: p.setting ?? null, time_period: p.time_period ?? null, target_runtime_minutes: p.target_runtime_minutes ?? null,
    characters: characters.slice(0, 40), beats: (out?.beats ?? []).slice(0, 60),
  };
}
/** The story development a record was built from, following the chain (an edited outline → the model's outline → the development). */
async function developmentOf(db: SupabaseClient, id: string | null): Promise<Row | null> {
  for (let i = 0, cur = id; cur && i < 6; i++) {
    const g = await generation(db, cur).catch(() => null);
    if (!g) return null;
    if (g.kind === "develop_story") return g.status === "succeeded" ? g : null;
    cur = g.parent_id;
  }
  return null;
}
/**
 * The story every step uses (one set of characters across Project Setup, Story Development, Outline and Script): the
 * newest story the writer applied to Project Setup or wrote/edited themselves; if there is none yet, the newest
 * finished story development.
 */
async function latestDevelopment(db: SupabaseClient, projectId: string) {
  const all = await rows(db.from("script_generations").select("*").eq("project_id", projectId).eq("kind", "develop_story").eq("status", "succeeded").order("created_at", { ascending: false }).limit(20));
  return all.find((g) => g.source === "user" || g.accepted) ?? all[0] ?? null;
}
/** Names already decided: the current story's characters, then Casting's (canonical once the script is approved). */
function decidedCharacters(dev: Row | null, cast: Row[]) {
  const out: Row[] = [];
  const seen = new Set<string>();
  const add = (c: Row, source: string) => {
    const k = String(c.name ?? "").trim().toLowerCase();
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push({ name: String(c.name).trim().slice(0, 80), role: c.role ? String(c.role).slice(0, 40) : null, description: c.description ? String(c.description).slice(0, 800) : null, source });
  };
  for (const c of (dev?.output?.characters ?? []) as Row[]) add(c, dev?.source === "user" ? "writer" : "story");
  for (const c of cast) add(c, "casting");
  return out.slice(0, 40);
}

/** Scenes of a screenplay text by heading line: [start line, end line] (1-based, inclusive). */
function sceneSpans(sourceText: string, elements: unknown[]) {
  const lines = sourceText.replace(/\r\n?/g, "\n").split("\n");
  const { scenes } = sceneBoundaryEngine({ elements: elements as never });
  return { lines, spans: scenes.map((s, i) => ({ number: s.number, heading: s.heading, start: s.heading_line, end: (scenes[i + 1]?.heading_line ?? lines.length + 1) - 1 })) };
}
const textOf = (lines: string[], a: number, b: number) => lines.slice(a - 1, b).join("\n").trim();

const RequestInput = z.object({
  kind: z.enum(["develop_story", "outline", "write_script", "rewrite_scene"]),
  request: z.string().max(2000).default(""),
  parent_id: z.string().uuid().nullable().default(null),
  /** For rewrite_scene: which scene and how. For a new scene, `number` is the scene it goes after (0 = at the start). */
  scene: z.object({ mode: z.enum(scriptWriting.REWRITE_MODES), number: z.number().int().min(0).max(400), instruction: z.string().max(2000).default("") }).optional(),
}).strict();

export async function requestWriting(db: SupabaseClient, projectId: string, body: unknown, env: Env = process.env) {
  const b = parse(RequestInput, body);
  const p = await project(db, projectId);
  if (!reasoningProvider(env, { allowTest: true })) throw new ScriptNotReadyError("No writing backend is available on the server.");
  const cast = await rows(db.from("characters").select("name, role, age, description").eq("project_id", projectId).is("merged_into", null).limit(40));
  let input: Row, parent: string | null = b.parent_id ?? null, base: string | null = null, engineVersion: string = scriptWriting.ENGINE_VERSION;
  if (b.kind === "develop_story") {
    input = { brief: { title: p.title, type: p.type ?? "feature_film", logline: p.logline, synopsis: p.synopsis, genre: p.genre, subgenre: p.subgenre, tone: p.tone, setting: p.setting,
      time_period: p.time_period, target_runtime_minutes: p.target_runtime_minutes, request: b.request,
      characters: decidedCharacters(await latestDevelopment(db, projectId), cast) } };
    engineVersion = storyDevelopment.ENGINE_VERSION;
  } else if (b.kind === "outline") {
    const dev = parent ? await generation(db, parent) : await latestDevelopment(db, projectId);
    if (dev && (dev.kind !== "develop_story" || dev.status !== "succeeded")) throw new ScriptNotReadyError("Build the outline from a finished story development.");
    parent = dev?.id ?? null;
    input = { story: storyOf(p, dev, cast), request: b.request };
  } else if (b.kind === "write_script") {
    if (!parent) throw new ScriptNotReadyError("Choose the outline to write from.");
    const ol = await generation(db, parent);
    if (ol.kind !== "outline" || ol.status !== "succeeded" || !ol.output?.scenes?.length) throw new ScriptNotReadyError("Write the script from a finished outline.");
    input = { story: storyOf(p, await developmentOf(db, ol.parent_id), cast), outline: ol.output.scenes, request: b.request };
  } else {
    if (!b.scene) throw new ScriptValidationError([], "scene: say which scene and how to rework it");
    const script = await repo.getScriptByProject(db, projectId);
    const v = script?.current_version_id ? toScriptVersionDTO(await repo.getVersion(db, script.current_version_id)) : null;
    if (!v) throw new ScriptNotReadyError("Write or import a script first — there's no scene to rework yet.");
    const { lines, spans } = sceneSpans(v.source_text, v.elements);
    const i = spans.findIndex((s) => s.number === b.scene!.number);
    if (b.scene.mode !== "new_scene" && i < 0) throw new ScriptValidationError([], `There's no scene ${b.scene.number} in the current version.`);
    const at = b.scene.mode === "new_scene" ? spans.findIndex((s) => s.number === b.scene!.number) : i;
    const around = (k: number) => (k >= 0 && k < spans.length ? textOf(lines, spans[k].start, spans[k].end).slice(0, 3500) : "");
    base = v.id;
    input = {
      story: storyOf(p, await latestDevelopment(db, projectId), cast), mode: b.scene.mode, instruction: b.scene.instruction || b.request,
      scene_text: b.scene.mode === "new_scene" ? "" : around(i), before: b.scene.mode === "new_scene" ? around(at) : around(i - 1), after: b.scene.mode === "new_scene" ? around(at + 1) : around(i + 1),
      scene_number: b.scene.number,
    };
  }
  const g = await rpc<Row>(db, "request_script_generation", { p_project: projectId, p_kind: b.kind, p_parent: parent, p_request: b.request, p_input: input,
    p_base_version: base, p_engine_version: engineVersion, p_source: "model", p_output: null });
  return dto(g);
}

const dto = (g: Row) => ({
  id: g.id, kind: g.kind, parent_id: g.parent_id, request: g.request, source: g.source, status: g.status, progress: g.progress ?? {}, output: g.output ?? null,
  checks: g.checks ?? [], provider: g.provider ?? null, model: g.model ?? null, test_output: g.test_output ?? null, error: g.error ?? null,
  base_version_id: g.base_version_id ?? null, result_version_id: g.result_version_id ?? null, accepted: g.accepted ?? null,
  scene: g.kind === "rewrite_scene" ? { number: g.input?.scene_number ?? null, mode: g.input?.mode ?? null, before_text: g.input?.scene_text ?? "" } : undefined,
  created_at: g.created_at, completed_at: g.completed_at,
});

export async function listWriting(db: SupabaseClient, projectId: string, env: Env = process.env) {
  await assertProjectAccess(db, projectId);
  const list = await rows(db.from("script_generations").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(40));
  const r = reasoningProvider(env, { allowTest: true });
  const current = await latestDevelopment(db, projectId);
  return { writer: r ? { id: r.id, name: r.name, test_output: r.execution === "test" } : null, results: list.map(dto), current_story_id: current?.id ?? null };
}
export async function getWriting(db: SupabaseClient, id: string) {
  return dto(await generation(db, id));
}

// ---- Using results ------------------------------------------------------------------------------------------------
const STORY_KEYS = ["title", "logline", "synopsis", "genre", "tone", "setting", "time_period"] as const;
// No fields = "use this story" without changing Project Setup (it becomes the current story Outline and Script use).
const ApplyStoryInput = z.object({ fields: z.array(z.enum(STORY_KEYS)), title: z.string().max(200).optional() }).strict();

/** Applies the chosen story fields to the Project (through the Projects service, so its rules and gate apply). */
export async function applyStory(db: SupabaseClient, id: string, body: unknown) {
  const b = parse(ApplyStoryInput, body);
  const g = await generation(db, id);
  if (g.kind !== "develop_story" || g.status !== "succeeded") throw new ScriptNotReadyError("Only a finished story development can be applied.");
  const p = await project(db, g.project_id);
  const o = g.output as Row;
  const changes: Row = {};
  for (const f of b.fields) {
    if (f === "title") changes.title = b.title ?? o.title_options?.[0];
    else if (o[f] !== undefined) changes[f] = o[f];
  }
  if (changes.genre) changes.genre = String(changes.genre).slice(0, 100);
  const updated = Object.keys(changes).length ? await editProject(db, g.project_id, changes, p.org_id) : p;
  await rpc(db, "mark_script_generation", { p_id: id, p_accepted: { fields: b.fields, at: new Date().toISOString() }, p_result_version: null });
  return { applied: Object.keys(changes), project: updated };
}

const SaveStoryInput = z.object({ parent_id: z.string().uuid().nullable().default(null), story: storyDevelopment.StoryDevelopmentOutputSchema }).strict();
/**
 * The writer's own story (typed from scratch or an edited proposal): saved as its own record and from then on the
 * current story every step uses (outline, script, rewrites and the names kept by later developments).
 */
export async function saveStory(db: SupabaseClient, projectId: string, body: unknown) {
  const b = parse(SaveStoryInput, body);
  const p = await project(db, projectId);
  const brief = { title: p.title, type: p.type ?? "feature_film", logline: p.logline, synopsis: p.synopsis, genre: p.genre, tone: p.tone, setting: p.setting,
    time_period: p.time_period, target_runtime_minutes: p.target_runtime_minutes, request: "" };
  const g = await rpc<Row>(db, "request_script_generation", { p_project: projectId, p_kind: "develop_story", p_parent: b.parent_id, p_request: "", p_input: { brief, edited: true },
    p_base_version: null, p_engine_version: storyDevelopment.ENGINE_VERSION, p_source: "user", p_output: b.story });
  return { ...dto(g), checks: storyDevelopment.checkStoryDevelopment(brief, b.story) };
}

const SaveOutlineInput = z.object({ parent_id: z.string().uuid().nullable().default(null), scenes: z.array(scriptWriting.OutlineSceneSchema).min(1).max(400) }).strict();
/** A writer-edited outline is its own record (the model's stays as it was). */
export async function saveOutline(db: SupabaseClient, projectId: string, body: unknown) {
  const b = parse(SaveOutlineInput, body);
  const p = await project(db, projectId);
  const scenes = b.scenes.map((s, i) => ({ ...s, number: i + 1, location: s.location.toUpperCase() }));
  const story = storyOf(p, await developmentOf(db, b.parent_id ?? null), []);
  const output = { scenes, notes: ["Edited by the writer."] };
  const g = await rpc<Row>(db, "request_script_generation", { p_project: projectId, p_kind: "outline", p_parent: b.parent_id, p_request: "", p_input: { story, edited: true },
    p_base_version: null, p_engine_version: scriptWriting.ENGINE_VERSION, p_source: "user", p_output: output });
  return { ...dto(g), checks: scriptWriting.checkOutline(story, output) };
}

const OpenDraftInput = z.object({ base_version_id: z.string().uuid().nullable() }).strict();
/**
 * Opens a written script, or a reworked / new scene spliced into the current version, as a NEW draft version (the
 * normal save path checks the base version, so nobody's newer work is overwritten).
 */
export async function openAsDraft(db: SupabaseClient, id: string, body: unknown) {
  const b = parse(OpenDraftInput, body);
  const g = await generation(db, id);
  if (g.status !== "succeeded" || !g.output) throw new ScriptNotReadyError("That writing job hasn't finished.");
  let source: string, note: string;
  const by = g.test_output ? "the AuraStage test writer (TEST OUTPUT)" : `${g.provider ?? "the writer"}${g.model ? ` (${g.model})` : ""}`;
  if (g.kind === "write_script") {
    const p = await project(db, g.project_id);
    source = scriptWriting.assembleScript(p.title, g.output.scenes ?? []);
    note = `AuraScript: full script written by ${by} from the outline`;
  } else if (g.kind === "rewrite_scene") {
    if (b.base_version_id !== g.base_version_id) throw new ScriptConflictError("The script changed after this scene was reworked — ask again from the current version.");
    const v = toScriptVersionDTO(await repo.getVersion(db, g.base_version_id));
    const { lines, spans } = sceneSpans(v.source_text, v.elements);
    const n = g.input.scene_number as number, text = String(g.output.fountain).trim();
    if (g.input.mode === "new_scene") {
      const after = spans.find((s) => s.number === n);
      const at = after ? after.end : 0; // new scene at the start when there's nothing before it
      source = [...lines.slice(0, at), "", text, "", ...lines.slice(at)].join("\n").replace(/\n{3,}/g, "\n\n");
      note = `AuraScript: new scene after scene ${n} by ${by}`;
    } else {
      const s = spans.find((x) => x.number === n);
      if (!s) throw new ScriptValidationError([], `Scene ${n} isn't in that version any more.`);
      source = [...lines.slice(0, s.start - 1), text, "", ...lines.slice(s.end)].join("\n").replace(/\n{3,}/g, "\n\n");
      const did: Record<string, string> = { improve: "improved", expand: "expanded", rephrase: "rephrased", condense: "condensed", dialogue: "dialogue sharpened" };
      note = `AuraScript: scene ${n} ${did[g.input.mode] ?? "reworked"} by ${by}`;
    }
  } else throw new ScriptValidationError([], "Only a written script or a reworked scene opens as a draft.");
  const version = await saveScriptVersion(db, g.project_id, { source_text: source, base_version_id: b.base_version_id, note: note.slice(0, 500) });
  await rpc(db, "mark_script_generation", { p_id: id, p_accepted: null, p_result_version: version.id });
  return { version };
}

/** Continuity check of the current version (deterministic, instant). */
export async function checkContinuity(db: SupabaseClient, projectId: string) {
  await assertProjectAccess(db, projectId);
  const script = await repo.getScriptByProject(db, projectId);
  if (!script?.current_version_id) throw new ScriptNotReadyError("Write or import a script first.");
  const v = toScriptVersionDTO(await repo.getVersion(db, script.current_version_id));
  return { version_id: v.id, version_number: v.version_number, ...continuityCheckEngine({ elements: v.elements }) };
}
