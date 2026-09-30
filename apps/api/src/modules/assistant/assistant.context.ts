// Context Engine (directive §18): only the objects a request is about, read with the user's own access (RLS), each
// with its canonical id and the version it was read at (rows' updated_at). Read-only across domains (rule 4).
import type { SupabaseClient } from "@supabase/supabase-js";
import { readProjectSettings } from "../settings/settings.read";
import { trimContext, type AssistantRequest, type ContextBundle, type ContextItem, type Intent } from "@aurastage/aura-intelligence";

type Row = Record<string, any>;
async function rows(q: PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<Row[]> {
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Row[];
}
const item = (type: ContextItem["ref"]["type"], r: Row, label: string, data: Row): ContextItem =>
  ({ ref: { type, id: r.id, version: r.updated_at ?? r.created_at ?? null, label }, data });

export async function buildContext(db: SupabaseClient, req: AssistantRequest, intent: Intent, opts: { full?: boolean } = {}): Promise<ContextBundle> {
  const P = req.project_id;
  const [projectRows, scenes, chars, looks, dna, places, props] = await Promise.all([
    rows(db.from("projects").select("id, title, type, genre, subgenre, tone, setting, time_period, logline, target_runtime_minutes, updated_at").eq("id", P)),
    rows(db.from("scenes").select("id, number, heading, int_ext, location, time_of_day, status, element_start, element_end, source_version_id, updated_at").eq("project_id", P).eq("status", "active").order("number", { ascending: true }).limit(200)),
    rows(db.from("characters").select("id, name, role, status, age, gender, nationality, accent, languages, occupation, description, personality, backstory, motivation, fears, strengths, weaknesses, arc, merged_into, updated_at").eq("project_id", P).is("merged_into", null).limit(opts.full ? 250 : 100)),
    rows(db.from("wardrobe_looks").select("id, character_id, name, description, updated_at").eq("project_id", P).limit(300)),
    rows(db.from("scene_dna").select("id, scene_id, status, purpose, stakes, mood, weather, atmosphere, lighting_intent, sound_intent, story_time, camera_energy, wardrobe, notes, continuity_notes, on_screen_text, updated_at").eq("project_id", P)),
    // Locations & Props (owned by the world module; read-only here).
    rows(db.from("locations").select("id, name, description, int_ext, times_of_day, areas, status, updated_at").eq("project_id", P).is("archived_at", null).order("name", { ascending: true }).limit(80)),
    rows(db.from("props").select("id, name, description, category, status, updated_at").eq("project_id", P).is("archived_at", null).order("name", { ascending: true }).limit(80)),
  ]);
  const project = projectRows[0];
  if (!project) throw Object.assign(new Error("Project not found"), { code: "AURA-AI-404" });

  // The scene the request is about: the focus object, a "scene N" mention, or the focus shot/line's scene.
  let focusScene: Row | undefined = req.object?.type === "scene" ? scenes.find((s) => s.id === req.object!.id) : undefined;
  const num = req.text.match(/\bscene\s+(\d+)\b/i)?.[1];
  if (!focusScene && num) focusScene = scenes.find((s) => String(s.number) === num);
  let shots: Row[] = [];
  let lines: Row[] = [];
  let tracks: Row[] = [];
  let action = "";
  if (req.object?.type === "shot") {
    const s = await rows(db.from("shots").select("scene_id").eq("id", req.object.id));
    focusScene = scenes.find((x) => x.id === s[0]?.scene_id) ?? focusScene;
  }
  if (req.object?.type === "dialogue_line") {
    const l = await rows(db.from("dialogue_lines").select("scene_id").eq("id", req.object.id));
    focusScene = scenes.find((x) => x.id === l[0]?.scene_id) ?? focusScene;
  }
  if (focusScene) {
    // The scene's action as written in the script (read-only), so the whole scene can be understood in one pass.
    if (focusScene.source_version_id) {
      const v = await rows(db.from("script_versions").select("elements").eq("id", focusScene.source_version_id));
      action = ((v[0]?.elements ?? []) as Row[]).filter((e) => e.index >= focusScene!.element_start && e.index <= focusScene!.element_end && e.type === "action")
        .map((e) => String(e.text)).join("\n").slice(0, 3000);
    }
    // The scene's Audio Studio tracks (read-only here), so a mix request can be turned into track changes.
    const sess = await rows(db.from("audio_sessions").select("id").eq("scene_id", focusScene.id).limit(1));
    if (sess[0]) tracks = await rows(db.from("audio_tracks").select("id, name, family, gain_db, pan, mute, solo, ordinal").eq("session_id", sess[0].id).order("ordinal", { ascending: true }).limit(40));
    [shots, lines] = await Promise.all([
      rows(db.from("shots").select("id, scene_id, ordinal, purpose, size, angle, movement, description, character_ids, updated_at").eq("scene_id", focusScene.id).order("ordinal", { ascending: true }).limit(60)),
      rows(db.from("dialogue_lines").select("id, scene_id, ordinal, speaker_name, character_id, text, parenthetical, intention, subtext, emotion, intensity, notes, status, updated_at").eq("scene_id", focusScene.id).eq("status", "active").order("ordinal", { ascending: true }).limit(opts.full ? 200 : 80)),
    ]);
  }

  const items: ContextItem[] = [
    item("project", project, project.title, { title: project.title, type: project.type, genre: project.genre, subgenre: project.subgenre, tone: project.tone, setting: project.setting,
      time_period: project.time_period, logline: project.logline, target_runtime_minutes: project.target_runtime_minutes }),
  ];
  // With a focus scene, the scenes right before and after come too (continuity: what must match across the cut).
  const fi = focusScene ? scenes.indexOf(focusScene) : -1;
  const around = focusScene ? [scenes[fi - 1], focusScene, scenes[fi + 1]].filter(Boolean) as Row[] : scenes.slice(0, 30);
  for (const s of around) {
    const d = dna.find((x) => x.scene_id === s.id);
    // A scene's version is its Scene DNA's (what the tools change), falling back to the scene row.
    items.push(item("scene", { ...s, updated_at: d?.updated_at ?? s.updated_at }, `Scene ${s.number}`, { number: s.number, heading: s.heading, time_of_day: s.time_of_day,
      ...(s === focusScene && action ? { action } : {}),
      ...(focusScene && s !== focusScene ? { relation: scenes.indexOf(s) < fi ? "previous scene" : "next scene" } : {}),
      dna: d ? { purpose: d.purpose, stakes: d.stakes, mood: d.mood, weather: d.weather, atmosphere: d.atmosphere, lighting_intent: d.lighting_intent, sound_intent: d.sound_intent, story_time: d.story_time,
        camera_energy: d.camera_energy, notes: d.notes, continuity_notes: d.continuity_notes, on_screen_text: d.on_screen_text, status: d.status } : null }));
  }
  for (const c of chars) {
    items.push(item("character", c, c.name, { name: c.name, role: c.role, age: c.age, gender: c.gender, nationality: c.nationality, accent: c.accent, languages: c.languages, occupation: c.occupation, description: c.description,
      personality: c.personality, backstory: c.backstory, motivation: c.motivation, fears: c.fears, strengths: c.strengths, weaknesses: c.weaknesses, arc: c.arc,
      looks: looks.filter((l) => l.character_id === c.id).map((l) => ({ id: l.id, name: l.name })) }));
  }
  for (const l of lines) items.push(item("dialogue_line", l, `${l.speaker_name} line ${l.ordinal}`, { speaker: l.speaker_name, character_id: l.character_id, text: l.text, parenthetical: l.parenthetical, intention: l.intention, subtext: l.subtext, emotion: l.emotion, intensity: l.intensity, notes: l.notes ?? null }));
  // Project Settings the assistant may change (never the spending settings).
  const st = await readProjectSettings(db, P);
  const { generation: _spend, ...editable } = st.settings;
  items.push(item("settings", { id: P, updated_at: st.updated_at }, "Project Settings", editable));
  for (const l of places) items.push(item("location", l, l.name, { name: l.name, description: l.description, int_ext: l.int_ext, times_of_day: l.times_of_day, areas: l.areas, status: l.status }));
  for (const pr of props) items.push(item("prop", pr, pr.name, { name: pr.name, description: pr.description, category: pr.category, status: pr.status }));
  for (const t of tracks) items.push(item("audio_track", t, `${t.name} track`, { name: t.name, family: t.family, gain_db: Number(t.gain_db), pan: Number(t.pan), mute: t.mute, solo: t.solo }));
  // The cut (Editorial, read-only here): picture clips with their transitions, versioned by the timeline's revision.
  const rel = relevantTypes(req);
  if (rel.includes("timeline_clip")) {
    const tl = (await rows(db.from("timelines").select("id, revision").eq("project_id", P).limit(1)))[0];
    const clips = tl ? await rows(db.from("timeline_clips").select("id, label, track, kind, record_in, duration, scene_id, transition").eq("timeline_id", tl.id).eq("track", "V1").order("record_in", { ascending: true }).limit(80)) : [];
    const sceneNo = new Map(scenes.map((s) => [s.id, s.number]));
    clips.forEach((c, i) => items.push(item("timeline_clip", { id: c.id, updated_at: tl.revision }, `Clip ${i + 1}: ${c.label}`, {
      position: i + 1, label: c.label, kind: c.kind, scene: sceneNo.get(c.scene_id) ?? null, starts_at_frame: c.record_in, frames: c.duration, transition: c.transition })));
  }
  // The Assets Library (read-only here): a file's details, never its bytes.
  if (rel.includes("asset")) {
    const assets = await rows(db.from("assets").select("id, name, type, category, description, tags, updated_at").eq("project_id", P).is("archived_at", null).order("updated_at", { ascending: false }).limit(60));
    for (const a of assets) items.push(item("asset", a, a.name, { name: a.name, type: a.type, category: a.category, description: a.description, tags: a.tags }));
  }
  for (const s of shots) items.push(item("shot", s, `Shot ${s.ordinal}`, { ordinal: s.ordinal, purpose: s.purpose, size: s.size, angle: s.angle, movement: s.movement, description: s.description }));

  const bundle: ContextBundle = {
    project: { id: P, title: project.title, genre: project.genre ?? null, tone: project.tone ?? null },
    module: req.module,
    focus: focusScene ? { type: "scene", id: focusScene.id, version: dna.find((x) => x.scene_id === focusScene!.id)?.updated_at ?? focusScene.updated_at ?? null, label: `Scene ${focusScene.number}` } : req.object,
    items,
  };
  // The built-in engines read everything (a whole cast, every line of a scene); a paid model gets a trimmed budget.
  return opts.full ? { ...bundle, items: items.slice(0, 600) } : trimContext(bundle, intent.mentions, rel);
}

/** Object types the request is about (places and props; project settings), which then rank above the rest of the cast. */
function relevantTypes(req: AssistantRequest): ContextItem["ref"]["type"][] {
  const out: ContextItem["ref"]["type"][] = [];
  if (req.object?.type === "location" || req.object?.type === "prop" || /\b(locations?|places?|props?|vehicles?|set dressing|the set)\b/i.test(req.text)) out.push("location", "prop");
  if (req.module === "editorial" || req.object?.type === "timeline" || /\b(transitions?|fades?|fade (in|out|up|to black|from black)|dissolves?|cross-?fade|the cut|timeline|clips?)\b/i.test(req.text)) out.push("timeline_clip");
  if (req.module === "assets" || req.object?.type === "asset" || /\b(assets?|library|tags?|tagged|files?|upload(ed|s)?)\b/i.test(req.text)) out.push("asset");
  if (req.module === "settings" || /\b(settings?|aspect ratio|loudness|visual style|palette|deliverables?|credits|director|producer|company|copyright|title card|opening title|theme music|composer)\b/i.test(req.text)) out.push("settings");
  return out;
}

/** The current version of a tool's target, read the same way the context read it (for the stale check). */
export async function currentVersion(db: SupabaseClient, projectId: string, t: { type: string; id: string }): Promise<string | null> {
  const one = async (table: string, col: string, id: string) => (await rows(db.from(table).select("updated_at").eq(col, id).limit(1)))[0]?.updated_at ?? null;
  switch (t.type) {
    case "project": return one("projects", "id", projectId);
    case "character": return one("characters", "id", t.id);
    case "dialogue_line": return one("dialogue_lines", "id", t.id);
    case "shot": return one("shots", "id", t.id);
    case "location": return one("locations", "id", t.id);
    case "prop": return one("props", "id", t.id);
    case "settings": return (await readProjectSettings(db, projectId)).updated_at;
    case "asset": return one("assets", "id", t.id);
    case "timeline_clip": {
      // A clip is versioned by its timeline's revision (every edit re-saves the cut).
      const c = (await rows(db.from("timeline_clips").select("timeline_id").eq("id", t.id).limit(1)))[0];
      return c ? (await rows(db.from("timelines").select("revision").eq("id", c.timeline_id).limit(1)))[0]?.revision ?? null : null;
    }
    case "scene": return (await one("scene_dna", "scene_id", t.id)) ?? one("scenes", "id", t.id);
    default: return null;
  }
}
