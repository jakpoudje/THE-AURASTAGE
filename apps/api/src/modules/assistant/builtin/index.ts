// Built-in story intelligence for Ask AuraStage (owner, 2026-09-30: "all the empty fields across each page should be
// filled by the engines we built, based on story intelligence — we just need a click… only generation through a third
// party should cost money"). A deterministic planner: it reads the script and the project (./evidence.ts), runs the
// domain engines (characterProfile, wardrobeSuggestion, dialoguePerformance, sceneDnaFill, worldDescribe) and returns
// an ordinary Plan of tool calls. The plan goes through the same preview (before → after), permission and staleness
// checks, apply and undo as any other suggestion. It only fills EMPTY fields, and it is free: no provider is called.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssistantRequest, BuiltinTask, ContextBundle, Plan } from "@aurastage/aura-intelligence";
import { characterProfileEngine, dialoguePerformanceEngine, sceneDnaFillEngine, storySetupEngine, wardrobeSuggestionEngine, worldDescribeEngine } from "@aurastage/engines";
import { loadEvidence, mentionsOf, type Evidence } from "./evidence";
export { buildEvidence } from "./evidence";
import { phrasePlan } from "./phrases";

/** 1.0.0: one-click fills for characters, the whole cast, a scene's lines and Scene DNA sections, locations and props. */
export const BUILTIN_PLANNER_VERSION = "1.0.0";
export const BUILTIN_PROVIDER = "aurastage";
export const BUILTIN_MODEL = `story-intelligence-${BUILTIN_PLANNER_VERSION}`;

type Row = Record<string, any>;
type Call = Plan["calls"][number];
const blank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);
const call = (tool: string, input: unknown, reason: string): Call => ({ tool, input_json: JSON.stringify(input), reason: reason.slice(0, 400) });
const PROFILE_FIELDS = ["age", "gender", "nationality", "occupation", "description", "physicality", "accent", "languages", "personality", "backstory", "motivation", "fears", "strengths", "weaknesses", "arc"] as const;
const OVERVIEW = ["purpose", "stakes", "story_time", "mood"] as const;
const VISUAL = ["weather", "atmosphere", "lighting_intent", "sound_intent", "camera_energy"] as const;
const CONTINUITY = ["continuity_notes"] as const;

/** The one-click fill a request is, from the page's task or the page's standard wording. */
export function taskOf(req: Pick<AssistantRequest, "text" | "object"> & { task?: BuiltinTask | null }): BuiltinTask | null {
  if (req.task) return req.task;
  const t = req.text;
  if (/\bdevelop\b[^.]*\b(every|all|whole cast|each)\b[^.]*\bprofiles?\b/i.test(t)) return "develop_cast";
  if (/\b(every|all) scenes?'?s? (?:Scene )?DNA\b|\bScene DNA (?:of|for) every scene\b/i.test(t)) return "fill_all_scene_dna";
  if (/\bevery (?:spoken )?line in the (?:film|script)\b/i.test(t)) return "annotate_all_lines";
  if (/\bdevelop\b[^.]*\bprofile\b/i.test(t)) return "develop_character";
  if (/\bfill the Scene Overview\b/i.test(t)) return "fill_scene_overview";
  if (/\bfill Visual & Sound\b/i.test(t)) return "fill_visual_sound";
  if (/\bfill the Performance\b|\bannotate\b|\bone pass\b|\bevery (?:spoken )?line\b/i.test(t)) return "annotate_scene";
  if (/\bcontinuity notes\b/i.test(t)) return "fill_continuity";
  if (/\bdescribe\s+the\s+(location|prop)\s+["“]/i.test(t)) return "describe_world";
  if (/\bdescribe every (?:location|place)\b/i.test(t)) return "describe_all_world";
  if (/\bfill (?:the )?story setup\b/i.test(t)) return "fill_story";
  if (/\bfill (?:the )?(?:project )?settings\b/i.test(t)) return "fill_settings";
  return null;
}

interface Out { calls: Call[]; done: string[]; not_possible: string[]; questions: string[] }

export async function builtinPlan(db: SupabaseClient, req: AssistantRequest, context: ContextBundle, tools: string[]): Promise<Plan> {
  const task = taskOf(req);
  if (!task) return phraseBuiltin(req, context, tools);
  return planFromEvidence(await loadEvidence(db, req.project_id), req, context, task);
}

/** Anything that isn't a one-click fill: the built-in phrase planner (time of day, weather, mood, age, wardrobe, camera, mix, transitions…). */
export function phraseBuiltin(req: Pick<AssistantRequest, "text" | "module" | "object">, context: ContextBundle, tools: string[]): Plan {
  const p = phrasePlan({ request: { text: req.text, module: req.module, object: req.object }, context: context as never, tools });
  return { ...p, summary: p.calls.length ? p.summary : "AuraStage's built-in intelligence couldn't turn that into a change. Try the one-click fills on the page, or refine it with Claude (paid).", operation: p.operation as Plan["operation"], not_possible: p.not_possible.map((x) => x.replace(/The development test planner|the built-in test planner|The test planner|the test planner/g, "AuraStage's built-in intelligence").replace(/Connect Claude for full understanding\./, "Refine with Claude (paid) for anything else.")).slice(0, 10), questions: p.questions.slice(0, 5), calls: p.calls.slice(0, 250) };
}

/** The plan for a one-click fill, from evidence already read (pure: no database, no provider). */
export function planFromEvidence(ev: Evidence, req: AssistantRequest, context: ContextBundle, task: BuiltinTask): Plan {
  const items = context.items;
  const byType = (t: string) => items.filter((i) => i.ref.type === t);
  const out: Out = { calls: [], done: [], not_possible: [], questions: [] };
  const scene = focusScene(context, req);

  switch (task) {
    case "develop_character": {
      const ch = req.object?.type === "character" ? byType("character").find((i) => i.ref.id === req.object!.id) : (req.text.match(/\b[A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*/g) ?? []).map((n) => byType("character").find((c) => c.ref.label.toLowerCase() === n.toLowerCase() || c.ref.label.toLowerCase().split(/\s+/).includes(n.toLowerCase()))).find(Boolean);
      if (!ch) out.questions.push("Which character? Open them in Casting and ask again.");
      else developCharacter(ev, ch, out);
      break;
    }
    case "develop_cast": {
      const cast = byType("character");
      for (const ch of cast) developCharacter(ev, ch, out, true);
      const unsaid = cast.filter((c) => blank((c.data as Row).gender) && !out.calls.some((x) => x.tool === "updateCharacter" && JSON.parse(x.input_json).character_id === c.ref.id && JSON.parse(x.input_json).changes.gender));
      if (unsaid.length) out.not_possible.push(`Gender isn't stated in the script for ${unsaid.slice(0, 6).map((c) => c.ref.label).join(", ")}${unsaid.length > 6 ? ` and ${unsaid.length - 6} more` : ""} — AuraStage never guesses it from a name; set it by hand if it matters.`);
      if (!out.calls.length) out.not_possible.push("Every character's profile is already filled in — nothing is left for the engines to add.");
      else out.done.unshift(`fill the empty profile fields of ${new Set(out.calls.map((c) => JSON.parse(c.input_json).character_id)).size} character(s) from the script`);
      break;
    }
    case "describe_world": {
      const m = req.text.match(/\bdescribe\s+the\s+(location|prop)\s+["“]([^"”]+)["”]/i);
      const kind = (req.object?.type === "location" || req.object?.type === "prop" ? req.object.type : m?.[1]?.toLowerCase()) as "location" | "prop" | undefined;
      const it = kind ? byType(kind).find((i) => (req.object?.id ? i.ref.id === req.object.id : i.ref.label.toLowerCase() === m?.[2]?.trim().toLowerCase())) : undefined;
      if (!it || !kind) out.questions.push("Which location or prop? Pick it in Locations & Props and ask again.");
      else describeWorld(ev, kind, it, out);
      break;
    }
    case "describe_all_world": {
      for (const kind of ["location", "prop"] as const) for (const it of byType(kind)) {
        if (!blank((it.data as Row).description) || out.calls.length >= 240) continue;
        describeWorld(ev, kind, it, { ...out, done: [] });
      }
      if (out.calls.length) out.done.push(`describe ${out.calls.length} location(s) and prop(s) from what the script says about them`);
      else out.not_possible.push("Every location and prop already has a description.");
      break;
    }
    case "fill_story": {
      const project = byType("project")[0];
      const d = (project?.data ?? {}) as Row;
      const s = storyFrom(ev, items);
      const changes: Row = {};
      for (const k of ["genre", "tone", "setting", "time_period", "logline"] as const) if (blank(d[k]) && s.story[k]) changes[k] = s.story[k];
      if (Object.keys(changes).length) {
        out.calls.push(call("updateStory", { changes }, `Story setup: ${Object.keys(changes).join(", ")} — from ${Object.keys(changes).map((k) => s.evidence[k]).filter(Boolean).slice(0, 2).join("; ")}`));
        out.done.push(`fill the story setup (${Object.keys(changes).join(", ").replace(/_/g, " ")}) from the script`);
      } else out.not_possible.push("The story setup is already filled in.");
      if (blank(d.logline) && !changes.logline) out.not_possible.push("A logline needs the lead's motivation — develop the cast in Casting first, then fill this again.");
      break;
    }
    case "fill_settings": {
      const st = (byType("settings")[0]?.data ?? {}) as Row;
      const s = storyFrom(ev, items);
      const ch: Record<string, Row> = {};
      const put = (sec: string, k: string, v: unknown) => ((ch[sec] ??= {})[k] = v);
      if (blank(st.style?.look) && s.settings.look) put("style", "look", s.settings.look);
      if (blank(st.style?.palette) && s.settings.palette) put("style", "palette", s.settings.palette);
      if (blank(st.production?.country) && s.settings.country) put("production", "country", s.settings.country);
      if (st.production?.year == null && s.settings.year) put("production", "year", s.settings.year);
      if (blank(st.titles?.opening_subtitle) && s.settings.opening_subtitle) put("titles", "opening_subtitle", s.settings.opening_subtitle);
      if (Object.keys(ch).length) {
        out.calls.push(call("updateSettings", { changes: ch }, `Project Settings from the story: ${Object.entries(ch).flatMap(([a, f]) => Object.keys(f).map((k) => `${a}.${k}`)).join(", ")}`));
        out.done.push(`fill Project Settings from the story (${Object.values(ch).flatMap((f) => Object.keys(f)).join(", ").replace(/_/g, " ")})`);
      } else out.not_possible.push("Project Settings are already filled in from the story.");
      out.not_possible.push("Names for the credits (director, producer, company, writer, composer) are yours to enter — AuraStage never invents people.");
      break;
    }
    case "fill_all_scene_dna":
    case "annotate_all_lines": {
      // The whole film, scene by scene, until the batch is full; press again for the rest (only empty fields each time).
      const scenes = byType("scene").sort((a, b) => Number((a.data as Row).number) - Number((b.data as Row).number));
      const LIMIT = 240;
      let done = 0, from: string | null = null, to: string | null = null, left = 0;
      for (const sc of scenes) {
        const before = out.calls.length;
        const sub: Out = { calls: [], done: [], not_possible: [], questions: [] };
        if (task === "annotate_all_lines") annotate(ev, sc, sub, true, true);
        else fillDna(ev, sc, [...OVERVIEW, ...VISUAL, ...CONTINUITY], annotate(ev, sc, sub, false), sub);
        if (!sub.calls.length) continue;
        if (out.calls.length + sub.calls.length > LIMIT) { left++; continue; }
        out.calls.push(...sub.calls);
        if (out.calls.length > before) { done++; from ??= sc.ref.label; to = sc.ref.label; }
      }
      if (done) out.done.push(task === "annotate_all_lines" ? `fill the performance of every empty line in ${done} scene(s) (${from}${to !== from ? ` to ${to}` : ""})` : `fill the empty Scene DNA of ${done} scene(s) (${from}${to !== from ? ` to ${to}` : ""})`);
      if (left) out.not_possible.push(`${left} more scene(s) still have empty fields — apply this, then press the button again to continue (a batch holds up to 250 changes).`);
      if (!out.calls.length) out.not_possible.push(task === "annotate_all_lines" ? "Every spoken line already has its performance filled in." : "Every scene's DNA is already filled in.");
      break;
    }
    default: {
      if (!scene) { out.questions.push("Which scene? Open it in Scene DNA or Dialogue Intelligence and ask again."); break; }
      const reads = task === "annotate_scene" || task === "fill_scene" || task === "fill_scene_overview" || task === "fill_visual_sound" ? annotate(ev, scene, out, task === "annotate_scene" || task === "fill_scene") : new Map();
      const fields = task === "fill_scene_overview" ? OVERVIEW : task === "fill_visual_sound" ? VISUAL : task === "fill_continuity" ? CONTINUITY : task === "fill_scene" ? [...OVERVIEW, ...VISUAL, ...CONTINUITY] : [];
      if (fields.length) fillDna(ev, scene, fields as readonly string[], reads, out);
      if (!out.calls.length) out.not_possible.push(`Everything in ${scene.ref.label} that this fills is already written — change a field by hand, or clear it and ask again.`);
    }
  }
  const calls = out.calls.slice(0, 250);
  return {
    summary: (calls.length ? `I'd ${out.done.join("; ")}. Built in and free — from the script, nothing invented.` : "There's nothing empty left for the built-in engines to fill here.").slice(0, 600),
    operation: calls[0] ? ({ updateSceneDNA: "MODIFY_SCENE", assignSceneWardrobe: "MODIFY_SCENE", updateCharacter: "MODIFY_CHARACTER", changeWardrobe: "CHANGE_WARDROBE", modifyDialogue: "MODIFY_DIALOGUE", updateLocationOrProp: "MODIFY_WORLD", updateStory: "UPDATE_STORY", updateSettings: "UPDATE_SETTINGS" } as Record<string, Plan["operation"]>)[calls[0].tool] ?? "UNSUPPORTED" : "UNSUPPORTED",
    calls, not_possible: out.not_possible.slice(0, 10).map((x) => x.slice(0, 300)), questions: out.questions.slice(0, 5).map((x) => x.slice(0, 300)),
  };
}

function storyFrom(ev: Evidence, items: ContextBundle["items"]) {
  const d = (items.find((i) => i.ref.type === "project")?.data ?? {}) as Row;
  const count = new Map<string, number>();
  for (const l of ev.lines) if (l.character_id) count.set(l.character_id, (count.get(l.character_id) ?? 0) + 1);
  const chars = items.filter((i) => i.ref.type === "character");
  const leads = chars.map((c) => ({ c, n: count.get(c.ref.id) ?? 0, lead: (c.data as Row).role === "lead" }))
    .sort((a, b) => Number(b.lead) - Number(a.lead) || b.n - a.n).slice(0, 3)
    .map(({ c }) => ({ name: c.ref.label, occupation: ((c.data as Row).occupation ?? null) as string | null, motivation: ((c.data as Row).motivation ?? null) as string | null }));
  const reads = performance(ev);
  return storySetupEngine({
    title: d.title ?? null, headings: ev.scenes.map((x) => String(x.heading ?? "")).slice(0, 2000), action: ev.action.map((a) => a.text.slice(0, 4000)).slice(0, 20000),
    emotions: ev.lines.map((l) => String(l.emotion ?? reads.get(l.id)?.emotion ?? "")).slice(0, 50000), leads,
    existing: { genre: d.genre ?? null, tone: d.tone ?? null, setting: d.setting ?? null, time_period: d.time_period ?? null }, year_now: new Date().getUTCFullYear(),
  });
}

function focusScene(context: ContextBundle, req: AssistantRequest) {
  const scenes = context.items.filter((i) => i.ref.type === "scene");
  const num = req.text.match(/\bscene\s+(\d+)\b/i)?.[1];
  return (context.focus?.type === "scene" ? scenes.find((s) => s.ref.id === context.focus!.id) : undefined)
    ?? (num ? scenes.find((s) => String((s.data as Row).number) === num) : undefined)
    ?? (scenes.length === 1 ? scenes[0] : undefined);
}

/** Every line's performance as written, or as dialoguePerformanceEngine reads it when nobody has annotated it yet. */
const readCache = new WeakMap<Evidence, Map<string, { emotion: string; intensity: number; intention: string }>>();
function performance(ev: Evidence) {
  let m = readCache.get(ev);
  if (m) return m;
  m = new Map();
  const byScene = new Map<string, Row[]>();
  for (const l of ev.lines) byScene.set(l.scene_id, [...(byScene.get(l.scene_id) ?? []), l]);
  for (const ls of byScene.values()) {
    const r = dialoguePerformanceEngine({ lines: ls.map((l) => ({ id: l.id, speaker: String(l.speaker_name ?? ""), character_id: l.character_id ?? null, text: String(l.text).slice(0, 4000), parenthetical: l.parenthetical ? String(l.parenthetical).slice(0, 400) : null })) });
    for (const x of r.lines) m.set(x.id, x);
  }
  readCache.set(ev, m);
  return m;
}

function developCharacter(ev: Evidence, ch: ContextBundle["items"][number], out: Out, quiet = false) {
  const d = ch.data as Row;
  const prof = ev.characters[ch.ref.id] ?? { introduction: null, age: null, accent: null };
  const sceneNo = new Map(ev.scenes.map((s) => [s.id, s.number]));
  const apps = ev.appearances.filter((a) => a.character_id === ch.ref.id).map((a) => a.scene_number as number);
  const lines = ev.lines.filter((l) => l.character_id === ch.ref.id);
  const sceneNums = [...new Set([...apps, ...lines.map((l) => sceneNo.get(l.scene_id) as number)])].filter((n) => n !== undefined).sort((a, b) => a - b);
  const mentions = mentionsOf(ev, ch.ref.label);
  const others = new Map(ev.lines.map((l) => [l.character_id, l.speaker_name]));
  const nameOf = (id: string) => (others.get(id) as string | undefined) ?? "another character";
  const rels = ev.relationships.filter((r) => r.character_a === ch.ref.id || r.character_b === ch.ref.id)
    .map((r) => ({ other: nameOf(r.character_a === ch.ref.id ? r.character_b : r.character_a), type: String(r.relationship ?? "related"), description: r.description ?? null }));
  const p = characterProfileEngine({
    character: { name: ch.ref.label, role: d.role ?? null, occupation: d.occupation ?? null, age: d.age ?? null },
    introduction: prof.introduction, intro_age: prof.age,
    lines: lines.map((l) => {
      const r = performance(ev).get(l.id);
      return { scene: (sceneNo.get(l.scene_id) as number) ?? 0, text: String(l.text).slice(0, 4000), emotion: (l.emotion ?? r?.emotion ?? null) as never, intensity: l.intensity ?? r?.intensity ?? null, intention: l.intention ?? r?.intention ?? null };
    }),
    mentions, scenes: sceneNums.map((n) => ({ number: n, heading: String(ev.scenes.find((s) => s.number === n)?.heading ?? "") })), total_scenes: ev.scenes.length,
    relationships: rels, accent: prof.accent ? { accent: prof.accent.accent, languages: prof.accent.languages, evidence: prof.accent.evidence.slice(0, 10).map((x) => x.slice(0, 300)) } : null,
    project: { logline: ev.project.logline ?? null, genre: ev.project.genre ?? null, setting: ev.project.setting ?? null, time_period: ev.project.time_period ?? null },
  });
  const changes: Row = {};
  for (const k of PROFILE_FIELDS) if (blank(d[k]) && p.fields[k]) changes[k] = p.fields[k];
  // Never guessed: gender only when the script's own words say it (never from a name).
  if (!quiet && blank(d.gender) && !changes.gender) out.not_possible.push(`${ch.ref.label}'s gender isn't stated in the script — set it by hand if it matters.`);
  if (Object.keys(changes).length) {
    out.calls.push(call("updateCharacter", { character_id: ch.ref.id, changes }, `${ch.ref.label}: ${Object.keys(changes).join(", ")} — from ${[...new Set(Object.keys(changes).map((k) => p.evidence[k]).filter(Boolean))].slice(0, 2).join("; ")}`));
    if (!quiet) out.done.push(`fill ${ch.ref.label}'s ${Object.keys(changes).length} empty field(s) from the script`);
  }
  // A first wardrobe look when they have none (Scene DNA asks for one for everyone on screen).
  if (!((d.looks as unknown[] | undefined)?.length) && !ev.looks.some((l) => l.character_id === ch.ref.id)) {
    const w = wardrobeSuggestionEngine({ character: { name: ch.ref.label, occupation: (changes.occupation ?? d.occupation ?? null) as string | null, age: (changes.age ?? d.age ?? null) as string | null, gender: (changes.gender ?? d.gender ?? null) as string | null, description: (changes.description ?? d.description ?? null) as string | null },
      mentions: [prof.introduction ?? "", ...mentions.filter((m) => new RegExp(`^${ch.ref.label.split(" ")[0]}\\b`, "i").test(m.text)).map((m) => m.text)].filter(Boolean),
      project: { setting: ev.project.setting ?? null, time_period: ev.project.time_period ?? null, genre: ev.project.genre ?? null } });
    out.calls.push(call("changeWardrobe", { character_id: ch.ref.id, look_id: null, name: w.look.name, description: w.look.description, scene_id: null }, `${ch.ref.label}'s first wardrobe look — from ${w.evidence}`));
    if (!quiet) out.done.push(`give ${ch.ref.label} a first wardrobe look (${w.look.name})`);
  }
  if (!quiet && !out.calls.length) out.not_possible.push(`${ch.ref.label}'s profile is already filled in and they have a wardrobe look.`);
}

function annotate(ev: Evidence, scene: ContextBundle["items"][number], out: Out, write: boolean, quietEmpty = false) {
  const sceneLines = ev.lines.filter((l) => l.scene_id === scene.ref.id);
  const dna = ((scene.data as Row).dna ?? {}) as Row;
  const r = dialoguePerformanceEngine({ scene: { heading: String((scene.data as Row).heading ?? ""), mood: (dna.mood ?? []) as string[] },
    lines: sceneLines.map((l) => ({ id: l.id, speaker: String(l.speaker_name ?? ""), character_id: l.character_id ?? null, text: String(l.text).slice(0, 4000), parenthetical: l.parenthetical ? String(l.parenthetical).slice(0, 400) : null })) });
  const reads = new Map(r.lines.map((x) => [x.id, x]));
  if (!write) return reads;
  let n = 0;
  for (const l of sceneLines) {
    const x = reads.get(l.id)!;
    const changes: Row = {};
    if (blank(l.emotion)) changes.emotion = x.emotion;
    if (l.intensity === null || l.intensity === undefined) changes.intensity = x.intensity;
    if (blank(l.intention)) changes.intention = x.intention;
    if (blank(l.subtext)) changes.subtext = x.subtext;
    if (blank(l.notes)) changes.notes = `Delivery: ${x.delivery}`;
    if (!Object.keys(changes).length) continue;
    out.calls.push(call("modifyDialogue", { line_id: l.id, changes }, `${l.speaker_name} line ${l.ordinal}: ${x.emotion}, ${x.intensity}/10 — ${x.evidence}`));
    n++;
  }
  if (n) out.done.push(`give ${n} line(s) of ${scene.ref.label} their emotion, intensity, intention, subtext and delivery`);
  else if (sceneLines.length === 0 && !quietEmpty) out.not_possible.push(`${scene.ref.label} has no spoken lines to annotate.`);
  return reads;
}

function fillDna(ev: Evidence, scene: ContextBundle["items"][number], fields: readonly string[], reads: Map<string, { emotion: string; intensity: number }>, out: Out) {
  const s = ev.scenes.find((x) => x.id === scene.ref.id);
  if (!s) { out.not_possible.push(`${scene.ref.label} isn't in the approved script.`); return; }
  const i = ev.scenes.indexOf(s);
  const prev = ev.scenes[i - 1], next = ev.scenes[i + 1];
  const namesIn = (sceneId: string) => [...new Set([
    ...ev.appearances.filter((a) => a.scene_id === sceneId).map((a) => a.character_id as string),
    ...ev.lines.filter((l) => l.scene_id === sceneId).map((l) => l.character_id as string),
  ])].map((id) => ev.lines.find((l) => l.character_id === id)?.speaker_name ?? null).filter(Boolean) as string[];
  const neighbour = (x: Row | undefined) => (x ? { number: x.number, heading: x.heading, int_ext: x.int_ext ?? null, location: x.location ?? null, time_of_day: x.time_of_day ?? null, characters: namesIn(x.id) } : null);
  const lines = ev.lines.filter((l) => l.scene_id === s.id).map((l) => {
    const r = reads.get(l.id);
    return { speaker: String(l.speaker_name ?? ""), text: String(l.text).slice(0, 4000), emotion: l.emotion ?? r?.emotion ?? null, intensity: l.intensity ?? r?.intensity ?? null };
  });
  const f = sceneDnaFillEngine({
    scene: { number: s.number, heading: s.heading, int_ext: s.int_ext ?? null, location: s.location ?? null, time_of_day: s.time_of_day ?? null, estimated_seconds: s.estimated_seconds ?? null, action: ev.actionOf(s.id).slice(0, 400).map((a) => a.slice(0, 4000)) },
    lines, characters: namesIn(s.id), previous: neighbour(prev), next: neighbour(next), is_first: i === 0, is_last: i === ev.scenes.length - 1,
    project: { title: ev.project.title ?? null, logline: ev.project.logline ?? null, genre: ev.project.genre ?? null, tone: ev.project.tone ?? null, setting: ev.project.setting ?? null, time_period: ev.project.time_period ?? null },
  });
  const dna = ((scene.data as Row).dna ?? {}) as Row;
  // Visual: which look each on-screen character wears here, from the looks Casting has (only where none is chosen).
  if (fields.includes("lighting_intent") && dna.wardrobe !== undefined) {
    const worn = (dna.wardrobe ?? {}) as Row;
    const onScreen = [...new Set([...ev.appearances.filter((a) => a.scene_id === s.id).map((a) => a.character_id as string), ...ev.lines.filter((l) => l.scene_id === s.id).map((l) => l.character_id as string)])].filter(Boolean);
    const words = `${s.heading} ${ev.actionOf(s.id).join(" ")}`.toLowerCase();
    const pick: Record<string, string> = {};
    for (const cid of onScreen) {
      if (worn[cid]) continue;
      const looks = ev.looks.filter((l) => l.character_id === cid);
      if (!looks.length) continue;
      const score = (l: Row) => String(`${l.name} ${l.description ?? ""}`).toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3 && words.includes(w)).length;
      pick[cid] = [...looks].sort((a, b) => score(b) - score(a))[0].id;
    }
    if (Object.keys(pick).length) {
      out.calls.push(call("assignSceneWardrobe", { scene_id: scene.ref.id, wardrobe: pick }, `${scene.ref.label}: the look each on-screen character wears (${Object.keys(pick).length}) — from Casting's looks and the scene's words`));
      out.done.push(`choose the wardrobe look for ${Object.keys(pick).length} character(s) in ${scene.ref.label}`);
    }
  }
  const changes: Row = {};
  for (const k of fields) if (blank(dna[k])) changes[k] = (f.fields as Row)[k];
  if (!Object.keys(changes).length) return;
  out.calls.push(call("updateSceneDNA", { scene_id: scene.ref.id, changes }, `Scene DNA for ${scene.ref.label}: ${Object.keys(changes).join(", ")} — from ${[...new Set(Object.keys(changes).map((k) => f.evidence[k]).filter(Boolean))].slice(0, 2).join("; ")}`));
  out.done.push(`fill ${scene.ref.label}'s Scene DNA (${Object.keys(changes).map((k) => k.replace(/_/g, " ")).join(", ")}) from the script`);
}

function describeWorld(ev: Evidence, kind: "location" | "prop", it: ContextBundle["items"][number], out: Out) {
  const d = it.data as Row;
  if (!blank(d.description)) { out.not_possible.push(`${it.ref.label} already has a description — edit it by hand, or clear it and ask again.`); return; }
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const here = kind === "location" ? ev.scenes.filter((s) => norm(String(s.location ?? "")).includes(norm(it.ref.label)) || norm(it.ref.label).includes(norm(String(s.location ?? "")) || "\u0000")) : [];
  const mentions = kind === "location"
    ? [...here.flatMap((s) => ev.action.filter((a) => a.scene === s.number).slice(0, 2)), ...mentionsOf(ev, it.ref.label, 10)].slice(0, 12)
    : mentionsOf(ev, it.ref.label, 12);
  const w = worldDescribeEngine({ kind, name: it.ref.label, int_ext: (d.int_ext ?? []) as string[], times_of_day: (d.times_of_day ?? []) as string[], areas: (d.areas ?? []) as string[], category: d.category ?? null,
    mentions: mentions.map((m) => ({ scene: m.scene, text: m.text.slice(0, 2000) })), project: { setting: ev.project.setting ?? null, time_period: ev.project.time_period ?? null } });
  out.calls.push(call("updateLocationOrProp", { kind, id: it.ref.id, changes: { description: w.description } }, `${it.ref.label}: described from ${w.evidence}`));
  out.done.push(`describe ${it.ref.label} from what the script says about it`);
}
