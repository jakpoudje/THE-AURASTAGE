// Tool Registry implementations (directive §4). Each tool changes production data ONLY through the owning domain's
// service function — the same path a manual edit takes — so the permission gate (gate_write), validation, versioning,
// audit and downstream review flags apply unchanged (rules 4, 10, 11). Tools never touch tables directly.
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ToolRegistry, type ToolDefinition } from "@aurastage/aura-intelligence";
import { ClipTransitionSchema, ProjectSettingsSchema, UpdateAssetInputSchema, UpdateCharacterInputSchema, UpdateDialogueLineInputSchema, UpdateSceneDnaInputSchema, UpdateShotInputSchema } from "@aurastage/contracts";
import { editProject } from "../../projects/projects.service";
import { editCharacter, saveLook } from "../../characters/characters.service";
import { updateDialogueLine } from "../../dialogue/dialogue.service";
import { updateSceneDna } from "../../scene-dna/sceneDna.service";
import { updateShot } from "../../shots/shots.service";
import { updateWorldItem } from "../../world/world.service";
import { saveSettings } from "../../settings/settings.service";
import { updateTrack } from "../../audio/audio.service";
import { readProjectSettings } from "../../settings/settings.read";
import { editTimeline } from "../../editorial/editorial.service";
import { editAsset } from "../../assets/assets.service";

type Row = Record<string, any>;
export interface ToolCtx { projectId: string; orgId: string }
export interface Snapshot { object: { type: string; id: string; label: string }; fields: Row }
export interface ToolImpl<I> {
  def: ToolDefinition<I>;
  /** Current values of exactly the fields this call would change (for the before → after view and undo). */
  before(db: SupabaseClient, input: I, ctx: ToolCtx): Promise<Snapshot>;
  /** The change itself, through the domain service. Returns the fields as saved. */
  apply(db: SupabaseClient, input: I, ctx: ToolCtx): Promise<Snapshot>;
  /** What the changed fields will read after applying (for the before → after view). */
  after(input: I): Row;
  /** Reads the changed fields as they are now, the same way after apply (default: before()). Used by undo's check. */
  current?(db: SupabaseClient, input: I, applied: Snapshot, ctx: ToolCtx): Promise<Snapshot>;
  /** Puts the "before" values back through the same domain service (undo). `applied` is what apply() returned. */
  undo(db: SupabaseClient, input: I, before: Snapshot, applied: Snapshot, ctx: ToolCtx): Promise<Snapshot>;
  /** The object whose version the context recorded (stale check before applying). */
  target(input: I): { type: string; id: string };
}

async function one(db: SupabaseClient, table: string, cols: string, id: string, col = "id"): Promise<Row> {
  const { data, error } = await db.from(table).select(cols).eq(col, id).maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error(`That ${table.replace(/_/g, " ").replace(/s$/, "")} no longer exists.`), { code: "AURA-AI-404" });
  return data as unknown as Row;
}
const pick = (r: Row, keys: string[]) => Object.fromEntries(keys.map((k) => [k, r[k] ?? null]));

const STORY_FIELDS = ["title", "logline", "genre", "subgenre", "tone", "setting", "time_period", "target_runtime_minutes"] as const;
const updateStory: ToolImpl<{ changes: Row }> = {
  def: {
    name: "updateStory", module: "script", action: "edit", target: "project",
    description: "Change the project's story setup: title, logline, genre, subgenre, tone, setting, time period, target runtime.",
    input: z.object({ changes: z.object({ title: z.string().min(1).max(200), logline: z.string().max(500), genre: z.string().max(100), subgenre: z.string().max(100), tone: z.string().max(100),
      setting: z.string().max(200), time_period: z.string().max(100), target_runtime_minutes: z.number().int().min(1).max(600) }).partial().strict()
      .refine((c) => Object.keys(c).length > 0, "Nothing to change") }).strict(),
    impact: ["Scriptwriter story setup", "Dashboard"], undo: "inverse",
  },
  target: () => ({ type: "project", id: "" }), // the request's project
  async before(db, input, ctx) {
    const p = await one(db, "projects", "id, title, " + STORY_FIELDS.join(", "), ctx.projectId);
    return { object: { type: "project", id: p.id, label: p.title }, fields: pick(p, Object.keys(input.changes)) };
  },
  async apply(db, input, ctx) {
    const p = (await editProject(db, ctx.projectId, input.changes, ctx.orgId)) as Row;
    return { object: { type: "project", id: ctx.projectId, label: p.title }, fields: pick(p, Object.keys(input.changes)) };
  },
  after: (i) => i.changes,
  // Story fields can't be emptied back to "not set", so an empty text value is restored instead (numbers stay as changed).
  undo(db, _i, b, _a, ctx) {
    const changes = Object.fromEntries(Object.entries(b.fields).flatMap(([k, v]) => (v !== null ? [[k, v]] : k === "target_runtime_minutes" ? [] : [[k, ""]])));
    return Object.keys(changes).length ? this.apply(db, { changes }, ctx) : this.before(db, { changes: b.fields }, ctx);
  },
};

const CharacterChanges = UpdateCharacterInputSchema.omit({ status: true, name: true, kind: true, role: true }).strict().refine((c) => Object.keys(c).length > 0, "Nothing to change");
const updateCharacter: ToolImpl<{ character_id: string; changes: Row }> = {
  def: {
    name: "updateCharacter", module: "casting", action: "edit", target: "character",
    description: "Change a character's profile: age, gender, nationality, accent, languages, occupation, description, personality, backstory, motivation, fears, strengths, weaknesses, arc. Never renames or approves. Accent and languages come from the story (where they are from, where they live), never from a name.",
    input: z.object({ character_id: z.string().uuid(), changes: CharacterChanges }).strict(),
    impact: ["Scene DNA (locked scenes with this character are flagged for review)", "Visual Generation prompts"], undo: "inverse",
  },
  target: (i) => ({ type: "character", id: i.character_id }),
  async before(db, input) {
    const c = await one(db, "characters", "*", input.character_id);
    return { object: { type: "character", id: c.id, label: c.name }, fields: pick(c, Object.keys(input.changes)) };
  },
  async apply(db, input) {
    const c = (await editCharacter(db, input.character_id, input.changes)) as Row;
    return { object: { type: "character", id: c.id, label: c.name }, fields: pick(c, Object.keys(input.changes)) };
  },
  after: (i) => i.changes,
  undo(db, i, b, _a, ctx) { return this.apply(db, { character_id: i.character_id, changes: b.fields }, ctx); },
};

const changeWardrobe: ToolImpl<{ character_id: string; look_id: string | null; name: string; description: string; scene_id: string | null }> = {
  def: {
    name: "changeWardrobe", module: "casting", action: "edit", target: "wardrobe_look",
    description: "Create (look_id null) or edit a character's wardrobe look; with scene_id, also make it the look worn in that scene (Scene DNA).",
    input: z.object({ character_id: z.string().uuid(), look_id: z.string().uuid().nullable(), name: z.string().trim().min(1).max(80), description: z.string().max(2000), scene_id: z.string().uuid().nullable() }).strict(),
    impact: ["Scene DNA wardrobe for the scene", "Storyboard & Visual Generation prompts"], undo: "inverse",
  },
  target: (i) => ({ type: "character", id: i.character_id }),
  async before(db, input) {
    const c = await one(db, "characters", "id, name", input.character_id);
    const look = input.look_id ? await one(db, "wardrobe_looks", "id, name, description", input.look_id) : null;
    const dna = input.scene_id ? (await db.from("scene_dna").select("wardrobe").eq("scene_id", input.scene_id).maybeSingle()).data as Row | null : null;
    return { object: { type: "character", id: c.id, label: c.name },
      fields: { look: look ? { id: look.id, name: look.name, description: look.description } : null, scene_wardrobe: input.scene_id ? (dna?.wardrobe?.[input.character_id] ?? null) : undefined } };
  },
  async apply(db, input, ctx) {
    const look = (await saveLook(db, input.character_id, { ...(input.look_id ? { id: input.look_id } : {}), name: input.name, description: input.description })) as Row;
    if (input.scene_id) {
      const dna = (await db.from("scene_dna").select("wardrobe").eq("scene_id", input.scene_id).maybeSingle()).data as Row | null;
      await updateSceneDna(db, ctx.projectId, input.scene_id, { wardrobe: { ...(dna?.wardrobe ?? {}), [input.character_id]: look.id } });
    }
    return { object: { type: "wardrobe_look", id: look.id, label: look.name }, fields: { look: { id: look.id, name: look.name, description: look.description }, scene_wardrobe: input.scene_id ? look.id : undefined } };
  },
  current(db, i, a, ctx) { return this.before(db, { ...i, look_id: (a.fields.look as Row).id }, ctx); },
  after: (i) => ({ look: { id: i.look_id, name: i.name, description: i.description }, scene_wardrobe: i.scene_id ? "this look" : undefined }),
  // Undo restores the previous look text and the scene's previous choice. A look created by the change is kept in
  // Casting (never deleted, rule 11) — it just stops being worn in that scene.
  async undo(db, i, b, a, ctx) {
    const prev = b.fields.look as Row | null;
    const look = prev ? ((await saveLook(db, i.character_id, { id: prev.id, name: prev.name, description: prev.description ?? "" })) as Row) : (a.fields.look as Row);
    if (i.scene_id) {
      const dna = (await db.from("scene_dna").select("wardrobe").eq("scene_id", i.scene_id).maybeSingle()).data as Row | null;
      const wardrobe: Row = { ...(dna?.wardrobe ?? {}) };
      if (b.fields.scene_wardrobe) wardrobe[i.character_id] = b.fields.scene_wardrobe;
      else delete wardrobe[i.character_id];
      await updateSceneDna(db, ctx.projectId, i.scene_id, { wardrobe });
    }
    return { object: { type: "wardrobe_look", id: look.id, label: look.name }, fields: { look: { id: look.id, name: look.name, description: look.description }, scene_wardrobe: i.scene_id ? (b.fields.scene_wardrobe ?? null) : undefined } };
  },
};

const DialogueChanges = UpdateDialogueLineInputSchema.innerType().omit({ approval: true, acknowledge_review: true }).strict().refine((c) => Object.keys(c).length > 0, "Nothing to change");
const modifyDialogue: ToolImpl<{ line_id: string; changes: Row }> = {
  def: {
    name: "modifyDialogue", module: "dialogue", action: "edit", target: "dialogue_line",
    description: "Change a line's performance annotations: intention, subtext, emotion, intensity (0-10), notes. The words themselves come from the approved script and can't be changed here.",
    input: z.object({ line_id: z.string().uuid(), changes: DialogueChanges }).strict(),
    impact: ["Scene DNA (the scene's dialogue evidence)", "Audio Studio voice direction"], undo: "inverse",
  },
  target: (i) => ({ type: "dialogue_line", id: i.line_id }),
  async before(db, input) {
    const l = await one(db, "dialogue_lines", "*", input.line_id);
    return { object: { type: "dialogue_line", id: l.id, label: `${l.speaker_name}: "${String(l.text).slice(0, 50)}"` }, fields: pick(l, Object.keys(input.changes)) };
  },
  async apply(db, input) {
    const l = (await updateDialogueLine(db, input.line_id, input.changes)) as Row;
    return { object: { type: "dialogue_line", id: l.id, label: `${l.speaker_name}: "${String(l.text).slice(0, 50)}"` }, fields: pick(l, Object.keys(input.changes)) };
  },
  after: (i) => i.changes,
  undo(db, i, b, _a, ctx) { return this.apply(db, { line_id: i.line_id, changes: b.fields }, ctx); },
};

const SceneChanges = UpdateSceneDnaInputSchema.omit({ wardrobe: true }).strict().refine((c) => Object.keys(c).length > 0, "Nothing to change");
const updateSceneDNA: ToolImpl<{ scene_id: string; changes: Row }> = {
  def: {
    name: "updateSceneDNA", module: "scene_dna", action: "edit", target: "scene",
    description: "Change a scene's blueprint: purpose, stakes, story_time, mood (list), weather, atmosphere, lighting_intent, sound_intent, camera_energy (calm|measured|dynamic|frenetic), silent_scene, notes, on_screen_text (a caption burned in over the start of the scene in the finished film, e.g. \"LAGOS — 1995\"; changing only it keeps a locked scene locked), on_screen_position (lower_third|top|center).",
    input: z.object({ scene_id: z.string().uuid(), changes: SceneChanges }).strict(),
    impact: ["Storyboard & Shots (plans from the locked version are flagged)", "Visual Generation prompts", "Audio Studio sound intent"], undo: "inverse",
  },
  target: (i) => ({ type: "scene", id: i.scene_id }),
  async before(db, input) {
    const s = await one(db, "scenes", "id, number", input.scene_id);
    const d = (await db.from("scene_dna").select("*").eq("scene_id", input.scene_id).maybeSingle()).data as Row | null;
    return { object: { type: "scene", id: s.id, label: `Scene ${s.number}` }, fields: pick(d ?? {}, Object.keys(input.changes)) };
  },
  async apply(db, input, ctx) {
    await updateSceneDna(db, ctx.projectId, input.scene_id, input.changes);
    const s = await one(db, "scenes", "id, number", input.scene_id);
    const d = (await db.from("scene_dna").select("*").eq("scene_id", input.scene_id).maybeSingle()).data as Row | null;
    return { object: { type: "scene", id: s.id, label: `Scene ${s.number}` }, fields: pick(d ?? {}, Object.keys(input.changes)) };
  },
  after: (i) => i.changes,
  undo(db, i, b, _a, ctx) {
    const changes = Object.fromEntries(Object.entries(b.fields).map(([k, v]) => [k, v ?? (k === "mood" ? [] : k === "silent_scene" ? false : null)]));
    return this.apply(db, { scene_id: i.scene_id, changes }, ctx);
  },
};

const ShotChanges = UpdateShotInputSchema.pick({ size: true, angle: true, movement: true, support: true, focus: true, lens_mm: true, duration_seconds: true, description: true, composition: true, lighting: true, transition_in: true, notes: true })
  .strict().refine((c) => Object.keys(c).length > 0, "Nothing to change");
const modifyShot: ToolImpl<{ shot_id: string; changes: Row }> = {
  def: {
    name: "modifyShot", module: "shots", action: "edit", target: "shot",
    description: "Change one shot's cinematography: size (EWS|WS|FULL|MWS|COWBOY|MS|MCU|CU|ECU|TWO_SHOT|OTS|POV|INSERT…), angle, movement (static|push_in|pull_out|dolly|handheld|…), support, focus, lens_mm, duration_seconds, description, composition, lighting, transition_in, notes.",
    input: z.object({ shot_id: z.string().uuid(), changes: ShotChanges }).strict(),
    impact: ["The shot plan returns to draft until re-approved", "Visual Generation (compiled prompts for this shot)", "Editorial timing"], undo: "inverse",
  },
  target: (i) => ({ type: "shot", id: i.shot_id }),
  async before(db, input) {
    const s = await one(db, "shots", "*", input.shot_id);
    return { object: { type: "shot", id: s.id, label: `Shot ${s.ordinal}` }, fields: pick(s, Object.keys(input.changes)) };
  },
  async apply(db, input) {
    const s = (await updateShot(db, input.shot_id, input.changes)) as Row;
    return { object: { type: "shot", id: s.id, label: `Shot ${s.ordinal}` }, fields: pick(s, Object.keys(input.changes)) };
  },
  after: (i) => i.changes,
  undo(db, i, b, _a, ctx) { return this.apply(db, { shot_id: i.shot_id, changes: b.fields }, ctx); },
};

// Locations & Props (owner request: "AI helps with any stage"). Goes through the world module's own save (gate_write
// scene_dna:edit, revision check, audit); the reference views made from the old description are then flagged, never replaced.
const WorldChanges = z.object({
  name: z.string().trim().min(1).max(160), description: z.string().max(2000), category: z.enum(["prop", "vehicle"]), status: z.literal("confirmed"),
}).partial().strict().refine((c) => Object.keys(c).length > 0, "Nothing to change");
const updateLocationOrProp: ToolImpl<{ kind: "location" | "prop"; id: string; changes: Row }> = {
  def: {
    name: "updateLocationOrProp", module: "scene_dna", action: "edit", target: "location",
    description: "Describe, rename or confirm a location or prop from Locations & Props: kind (location|prop), id, changes { name, description (what it looks like: materials, age, colour, condition, light), category (prop|vehicle, props only), status: \"confirmed\" }. Never archives.",
    input: z.object({ kind: z.enum(["location", "prop"]), id: z.string().uuid(), changes: WorldChanges }).strict()
      .refine((i) => i.kind === "prop" || !("category" in i.changes), "Only props have a category"),
    impact: ["Locations & Props (reference views made from the old description are marked for a refresh)", "Scene DNA and Visual Generation prompts that use this place or prop"], undo: "inverse",
  },
  target: (i) => ({ type: i.kind, id: i.id }),
  async before(db, input) {
    const r = await one(db, input.kind === "location" ? "locations" : "props", "*", input.id);
    return { object: { type: input.kind, id: r.id, label: r.name }, fields: pick(r, Object.keys(input.changes)) };
  },
  async apply(db, input) {
    // The world module refuses a stale save by revision; the assistant's own stale check (updated_at) already ran.
    const cur = await one(db, input.kind === "location" ? "locations" : "props", "revision", input.id);
    const r = (await updateWorldItem(db, input.kind, input.id, { revision: cur.revision, ...input.changes })) as Row;
    return { object: { type: input.kind, id: input.id, label: r.name }, fields: pick(r, Object.keys(input.changes)) };
  },
  after: (i) => i.changes,
  // A confirmed item stays confirmed (the world module has no "unconfirm"); the other fields go back as they were.
  undo(db, i, b, _a, ctx) {
    const changes = Object.fromEntries(Object.entries(b.fields).filter(([k, v]) => k !== "status" && v !== null));
    return Object.keys(changes).length ? this.apply(db, { ...i, changes }, ctx) : this.before(db, i, ctx);
  },
};

// Project Settings (format, visual style, deliverables, credit names, titles & credits) through the settings module's own
// save (gate settings:edit, revision check, new settings version). Spending settings (generation: default paid providers,
// the monthly paid-take cap) are deliberately not offered: the assistant never raises what can be spent.
const SETTINGS_SECTIONS = ["technical", "style", "delivery", "production", "titles"] as const;
type Section = (typeof SETTINGS_SECTIONS)[number];
const section = (k: Section) => (ProjectSettingsSchema.shape[k] as unknown as { removeDefault(): z.AnyZodObject }).removeDefault().partial().strict();
const SettingsChanges = z.object(Object.fromEntries(SETTINGS_SECTIONS.map((k) => [k, section(k)])) as Record<Section, ReturnType<typeof section>>)
  .partial().strict().refine((c) => Object.values(c).some((v) => v && Object.keys(v).length > 0), "Nothing to change");
const flat = (c: Row) => Object.fromEntries(Object.entries(c).flatMap(([s, f]) => Object.entries((f ?? {}) as Row).map(([k, v]) => [`${s}.${k}`, v])));
const nest = (f: Row) => Object.entries(f).reduce<Row>((o, [p, v]) => { const [s, k] = p.split("."); (o[s] ??= {})[k] = v; return o; }, {});
const updateSettings: ToolImpl<{ changes: Row }> = {
  def: {
    name: "updateSettings", module: "settings", action: "edit", target: "settings",
    description: "Change Project Settings: technical {aspect_ratio 16:9|2.39:1|1.85:1|9:16|1:1|4:5, loudness_standard}, style {look (the film's visual style, added to every shot prompt), palette [#rrggbb]}, delivery {required_profiles}, production {director, producer, company, country, year, copyright, writer, composer, thanks}, titles {opening_title true/false, opening_seconds 2–15, opening_subtitle, end_credits true/false, credits_speed slow|medium|fast, music none|theme}. Never changes spending settings.",
    input: z.object({ changes: SettingsChanges }).strict(),
    impact: ["Project Settings (a new settings version)", "Visual Generation prompts (a style change flags compiled prompts for review)", "Export & Deliver (titles, credits, required deliverables)"], undo: "inverse",
  },
  target: () => ({ type: "settings", id: "" }), // the request's project
  async before(db, input, ctx) {
    const cur = (await readProjectSettings(db, ctx.projectId)).settings as Row;
    return { object: { type: "settings", id: ctx.projectId, label: "Project Settings" }, fields: Object.fromEntries(Object.keys(flat(input.changes)).map((p) => { const [s, k] = p.split("."); return [p, cur[s]?.[k] ?? null]; })) };
  },
  async apply(db, input, ctx) {
    const cur = await readProjectSettings(db, ctx.projectId);
    const merged = Object.fromEntries(Object.entries(cur.settings as Row).map(([s, v]) => [s, { ...(v as Row), ...((input.changes as Row)[s] ?? {}) }]));
    await saveSettings(db, ctx.projectId, { base_revision: cur.revision, settings: merged });
    return this.before(db, input, ctx);
  },
  after: (i) => flat(i.changes),
  undo(db, _i, b, _a, ctx) { return this.apply(db, { changes: nest(b.fields) }, ctx); },
};

// Audio Studio: one track of a scene's mix (level, pan, mute, solo) through the audio module's own save (gate audio:edit).
// The mix then needs a fresh loudness measurement before approval, exactly as for a change made by hand.
const TrackChanges = z.object({ gain_db: z.number().min(-60).max(12), pan: z.number().min(-1).max(1), mute: z.boolean(), solo: z.boolean() })
  .partial().strict().refine((c) => Object.keys(c).length > 0, "Nothing to change");
const TRACK_FIELDS = ["gain_db", "pan", "mute", "solo"];
const adjustAudioTrack: ToolImpl<{ track_id: string; changes: Row }> = {
  def: {
    name: "adjustAudioTrack", module: "audio", action: "edit", target: "audio_track",
    description: "Change one track of a scene's Audio Studio mix: gain_db (-60 to +12; e.g. -6 is clearly quieter), pan (-1 left to 1 right), mute, solo. Families: DX dialogue, ADR, VO, FOLEY, FX, WALLA, BG ambience, MX/SCORE music.",
    input: z.object({ track_id: z.string().uuid(), changes: TrackChanges }).strict(),
    impact: ["Audio Studio (the scene's mix needs a fresh loudness measurement before approval)", "Editorial & Export (the approved mix they use is flagged for review)"], undo: "inverse",
  },
  target: (i) => ({ type: "audio_track", id: i.track_id }),
  async before(db, input) {
    const t = await one(db, "audio_tracks", "id, name, gain_db, pan, mute, solo", input.track_id);
    return { object: { type: "audio_track", id: t.id, label: `${t.name} track` }, fields: Object.fromEntries(Object.keys(input.changes).map((k) => [k, k === "gain_db" || k === "pan" ? Number(t[k]) : t[k]])) };
  },
  async apply(db, input, ctx) {
    await updateTrack(db, input.track_id, input.changes);
    return this.before(db, input, ctx);
  },
  after: (i) => i.changes,
  undo(db, i, b, _a, ctx) { return this.apply(db, { track_id: i.track_id, changes: Object.fromEntries(Object.entries(b.fields).filter(([k]) => TRACK_FIELDS.includes(k))) }, ctx); },
};

// Editorial: a shot's transition on the cut (dissolve, fade from/to black) through the editorial module's own edit
// (gate editorial:edit, the timeline's revision, the edit engine's checks). A locked picture is refused as it is by hand.
const setClipTransition: ToolImpl<{ clip_id: string; transition: Row }> = {
  def: {
    name: "setClipTransition", module: "editorial", action: "edit", target: "timeline_clip",
    description: "Set how one picture clip on the Editorial timeline (V1) starts and ends: transition { in: cut|dissolve|fade_from_black, out: cut|fade_to_black, frames: 2–96 (24 frames = 1 second) }. The clip must be long enough for the frames used.",
    input: z.object({ clip_id: z.string().uuid(), transition: ClipTransitionSchema }).strict(),
    impact: ["Editorial & Timeline (a new edit; a locked picture refuses it until the lock is broken)", "Export & Deliver (renders made from the next Picture Lock)"], undo: "inverse",
  },
  target: (i) => ({ type: "timeline_clip", id: i.clip_id }),
  async before(db, input) {
    const c = await one(db, "timeline_clips", "id, label, track, transition", input.clip_id);
    return { object: { type: "timeline_clip", id: c.id, label: c.label }, fields: { transition: c.transition ?? { in: "cut", out: "cut", frames: 12 } } };
  },
  async apply(db, input, ctx) {
    const c = await one(db, "timeline_clips", "timeline_id", input.clip_id);
    const t = await one(db, "timelines", "revision", c.timeline_id);
    await editTimeline(db, ctx.projectId, { base_revision: t.revision, operation: { op: "transition", clip_id: input.clip_id, transition: input.transition } });
    return this.before(db, input, ctx);
  },
  after: (i) => ({ transition: i.transition }),
  undo(db, i, b, _a, ctx) { return this.apply(db, { clip_id: i.clip_id, transition: b.fields.transition }, ctx); },
};

// Assets Library: a file's name, category, description and tags through the assets module's own save (gate assets:edit).
// Never archives or replaces a file; its bytes and versions are untouched.
const AssetChanges = UpdateAssetInputSchema.innerType().omit({ archived: true }).strict().refine((c) => Object.keys(c).length > 0, "Nothing to change");
const updateAssetDetails: ToolImpl<{ asset_id: string; changes: Row }> = {
  def: {
    name: "updateAssetDetails", module: "assets", action: "edit", target: "asset",
    description: "Rename, describe, categorise or tag one file in the Assets Library: changes { name, category, description, tags [up to 30 short tags] }. Never archives or replaces the file.",
    input: z.object({ asset_id: z.string().uuid(), changes: AssetChanges }).strict(),
    impact: ["Assets Library (the file's details; its versions and where it is used are unchanged)"], undo: "inverse",
  },
  target: (i) => ({ type: "asset", id: i.asset_id }),
  async before(db, input) {
    const a = await one(db, "assets", "id, name, category, description, tags", input.asset_id);
    return { object: { type: "asset", id: a.id, label: a.name }, fields: pick(a, Object.keys(input.changes)) };
  },
  async apply(db, input, ctx) {
    await editAsset(db, input.asset_id, input.changes);
    return this.before(db, input, ctx);
  },
  after: (i) => i.changes,
  undo(db, i, b, _a, ctx) {
    const changes = Object.fromEntries(Object.entries(b.fields).map(([k, v]) => [k, v ?? (k === "tags" ? [] : k === "description" ? "" : v)]).filter(([, v]) => v !== null));
    return this.apply(db, { asset_id: i.asset_id, changes }, ctx);
  },
};

const IMPLS: ToolImpl<any>[] = [updateStory, updateCharacter, changeWardrobe, modifyDialogue, updateSceneDNA, modifyShot, updateLocationOrProp, updateSettings, adjustAudioTrack, setClipTransition, updateAssetDetails];
export const toolRegistry = IMPLS.reduce((r, t) => r.register(t.def), new ToolRegistry());
export const toolImpl = (name: string) => IMPLS.find((t) => t.def.name === name);
