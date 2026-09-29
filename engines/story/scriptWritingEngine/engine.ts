// engines/story/scriptWritingEngine — AuraScript: from the accepted story to a scene outline, from the outline to a full
// screenplay (written in batches of scenes so any length fits), and scene-level rewrites (improve, expand, rephrase,
// condense, sharpen dialogue, write a new scene). The model call happens in the generation worker through the Provider
// Gateway (rules 7–8); this engine owns the prompts and checks every answer deterministically before the writer sees it.
// Nothing here writes anything: the writer opens the result as a new draft version and approves it themselves.
import { screenplayFormatEngine } from "../screenplayFormatEngine";
import {
  OutlineInputSchema, OutlineOutputSchema, RewriteInputSchema, RewriteOutputSchema, StoryContextSchema, WriteScenesInputSchema, WriteScenesOutputSchema,
  type OutlineOutput, type OutlineScene, type RewriteInput, type RewriteOutput, type StoryContext, type WriteScenesInput, type WriteScenesOutput, type WritingCheck,
} from "./schemas";
import { ENGINE_VERSION } from "./version";

const CRAFT = `Write in standard screenplay (Fountain) format:
- Scene heading on its own line: INT. or EXT. (or INT./EXT.), the place in capitals, " - ", the time of day. Example: INT. TUNDE'S FLAT - NIGHT
- Action in present tense, lean and visual: only what the camera sees and hears. Introduce each character in CAPITALS the first time they appear, with their age in brackets, e.g. AMARA BELLO (32).
- Character cue in capitals on its own line, dialogue below it; parentheticals sparingly, in brackets on their own line.
- Transitions (CUT TO:) only where they matter.
Voice: every character sounds like themselves — their age, class, region and history. Subtext over statement. No speeches that explain the plot.
Keep names, relationships, ages and facts consistent with the story bible. Never introduce real, famous people.`;

const bible = (s: StoryContext) => {
  const b = StoryContextSchema.parse(s);
  const v = (k: string, x: unknown) => (x === null || x === undefined || x === "" ? null : `${k}: ${x}`);
  return [
    "STORY BIBLE",
    v("Title", b.title), v("Format", b.type.replace(/_/g, " ")), v("Logline", b.logline), v("Genre", b.genre), v("Tone", b.tone),
    v("Setting", b.setting), v("Period", b.time_period), v("Target runtime (minutes)", b.target_runtime_minutes),
    b.synopsis ? `Synopsis:\n${b.synopsis}` : null,
    b.characters.length ? `Characters:\n${b.characters.map((c) => `- ${c.name} (${c.role}${c.age !== null ? `, ${c.age}` : ""}): ${c.description}${c.want ? ` Wants: ${c.want}.` : ""}${c.need ? ` Needs: ${c.need}.` : ""}${c.arc ? ` Arc: ${c.arc}` : ""}`).join("\n")}` : null,
    b.beats.length ? `Beats:\n${b.beats.map((x) => `- Act ${x.act}, ~minute ${x.approx_minute}: ${x.title} — ${x.summary}`).join("\n")}` : null,
  ].filter(Boolean).join("\n");
};
const outlineLine = (o: OutlineScene) => `${o.number}. ${o.int_ext}. ${o.location} - ${o.time_of_day} (~${o.est_minutes} min) [${o.beat}] ${o.summary}${o.characters.length ? ` Characters: ${o.characters.join(", ")}.` : ""}`;

// ---- Outline -------------------------------------------------------------------------------------------------------
export const OUTLINE_SYSTEM = `You are the story editor inside The AuraStage, a film production studio. You turn an agreed story into a
scene-by-scene outline the writer can edit before the script is written.
Every scene has a clear dramatic purpose, moves the story or a character, and ends differently from how it began.
Return places as reusable canonical names in capitals (the same place always has exactly the same name).
Scene lengths (est_minutes) must add up to the target runtime (one screenplay page is about one minute).
Every beat in the bible is covered, in order; every main character appears. Number scenes from 1 with no gaps.
Return only the requested JSON.`;
export function outlineRequest(raw: { story: StoryContext; request?: string }) {
  const input = OutlineInputSchema.parse(raw);
  const runtime = input.story.target_runtime_minutes;
  return {
    system: OUTLINE_SYSTEM,
    prompt: [bible(input.story), runtime ? `Aim for about ${Math.max(3, Math.round(runtime / 2))} scenes totalling ${runtime} minutes.` : "", input.request ? `The writer's request: ${input.request}` : ""].filter(Boolean).join("\n\n"),
    schema: OutlineOutputSchema, engine_version: ENGINE_VERSION, max_tokens: 32000,
  };
}
export function checkOutline(rawStory: StoryContext, out: OutlineOutput): WritingCheck[] {
  const story = StoryContextSchema.parse(rawStory);
  const nums = out.scenes.map((s) => s.number);
  const contiguous = nums.every((n, i) => n === i + 1);
  const total = Math.round(out.scenes.reduce((a, s) => a + s.est_minutes, 0));
  const runtime = story.target_runtime_minutes;
  const mains = story.characters.filter((c) => /protagonist|antagonist|lead/i.test(c.role));
  const appears = (name: string) => out.scenes.some((s) => s.characters.some((c) => c.toLowerCase().includes(name.split(/\s+/)[0].toLowerCase())));
  const missing = mains.filter((c) => !appears(c.name)).map((c) => c.name);
  const beatsCovered = story.beats.filter((b) => out.scenes.some((s) => s.beat.toLowerCase() === b.title.toLowerCase())).length;
  const locs = new Map<string, number>();
  for (const s of out.scenes) locs.set(s.location.toUpperCase(), (locs.get(s.location.toUpperCase()) ?? 0) + 1);
  return [
    { id: "numbered", ok: contiguous, label: "Scenes are numbered 1…n in order", evidence: contiguous ? `${nums.length} scenes` : `Numbers: ${nums.slice(0, 12).join(", ")}…` },
    { id: "runtime", ok: !runtime || Math.abs(total - runtime) <= Math.max(3, runtime * 0.15), label: "Scene lengths add up to the target runtime", evidence: runtime ? `${total} of ${runtime} minutes` : `${total} minutes (no target set)` },
    { id: "mains", ok: missing.length === 0, label: "Every main character appears", evidence: missing.length ? `Missing: ${missing.join(", ")}` : mains.length ? mains.map((c) => c.name).join(", ") : "No main characters in the bible" },
    { id: "beats", ok: !story.beats.length || beatsCovered === story.beats.length, label: "Every story beat is covered", evidence: `${beatsCovered} of ${story.beats.length} beats` },
    { id: "headings", ok: out.scenes.every((s) => /^[A-Z0-9'&.,\- /]+$/.test(s.location)), label: "Places are written as canonical names in capitals", evidence: `${locs.size} places, ${[...locs.values()].filter((n) => n > 1).length} used more than once` },
  ];
}

// ---- Writing scenes ------------------------------------------------------------------------------------------------
export const WRITE_SYSTEM = `You are the screenwriter inside The AuraStage, a film production studio. You write the scenes you are
given from an agreed outline, as finished screenplay pages. Follow the outline scene for scene (heading, who is in it,
what happens) — you may sharpen and dramatise, not change the story. Carry on seamlessly from the previous scene.
${CRAFT}
Return only the requested JSON: one entry per scene asked for, with its number and the full Fountain text of that scene
starting with its scene heading.`;
export function writeScenesRequest(raw: WriteScenesInput) {
  const input = WriteScenesInputSchema.parse(raw);
  const want = input.outline.filter((o) => input.numbers.includes(o.number));
  const est = want.reduce((a, s) => a + s.est_minutes, 0);
  return {
    system: WRITE_SYSTEM,
    prompt: [
      bible(input.story),
      `FULL OUTLINE\n${input.outline.map(outlineLine).join("\n")}`,
      input.previous_tail ? `THE PREVIOUS SCENE ENDS:\n${input.previous_tail}` : "This batch starts the screenplay.",
      `WRITE SCENES ${input.numbers.join(", ")} now (about ${Math.round(est)} pages in total; one page ≈ one minute ≈ 55 lines).`,
      input.request ? `The writer's request for the script: ${input.request}` : "",
    ].filter(Boolean).join("\n\n"),
    schema: WriteScenesOutputSchema, engine_version: ENGINE_VERSION, max_tokens: 48000,
  };
}
const headingOf = (fountain: string) => fountain.trim().split("\n")[0].trim();
const wordsOf = (s: string) => (s.match(/[\p{L}\p{N}'’-]+/gu) ?? []).length;
export function checkScenes(raw: WriteScenesInput, out: WriteScenesOutput): WritingCheck[] {
  const input = WriteScenesInputSchema.parse(raw);
  const want = input.outline.filter((o) => input.numbers.includes(o.number));
  const got = new Map(out.scenes.map((s) => [s.number, s]));
  const missing = want.filter((o) => !got.has(o.number)).map((o) => o.number);
  const bad: string[] = [], shortOnes: string[] = [], strangers = new Set<string>();
  const known = input.story.characters.flatMap((c) => [c.name.toUpperCase(), c.name.split(/\s+/)[0].toUpperCase()]);
  for (const o of want) {
    const s = got.get(o.number);
    if (!s) continue;
    const h = headingOf(s.fountain).toUpperCase();
    if (!/^(INT|EXT|INT\.?\/EXT|I\/E)[. ]/.test(h) || !h.includes(o.location.toUpperCase())) bad.push(`${o.number}: "${headingOf(s.fountain).slice(0, 60)}"`);
    const els = screenplayFormatEngine({ source_text: s.fountain }).elements;
    // Word count against the outline's minutes (about 180 words a minute of screen time).
    if (wordsOf(s.fountain) < o.est_minutes * 60) shortOnes.push(`${o.number} (${wordsOf(s.fountain)} words for ~${o.est_minutes} min)`);
    for (const e of els) if (e.type === "character" && e.speaker && known.length && !known.some((k) => e.speaker!.toUpperCase().includes(k))) strangers.add(e.speaker);
  }
  return [
    { id: "all_written", ok: missing.length === 0, label: "Every scene asked for was written", evidence: missing.length ? `Missing: ${missing.join(", ")}` : `${out.scenes.length} scenes` },
    { id: "headings", ok: bad.length === 0, label: "Each scene starts with its outline heading", evidence: bad.length ? bad.join("; ") : "All match" },
    { id: "length", ok: shortOnes.length === 0, label: "Scenes are long enough for their planned minutes", evidence: shortOnes.length ? `Short: ${shortOnes.join(", ")}` : "All fit" },
    { id: "cast", ok: strangers.size === 0, label: "Only characters from the story bible speak", evidence: strangers.size ? `New speakers: ${[...strangers].join(", ")} — check them in Casting` : "All known" },
  ];
}
/** Joins written scenes (in outline order) into one screenplay. */
export function assembleScript(title: string, scenes: { number: number; fountain: string }[]) {
  return [`Title: ${title}`, "", ...[...scenes].sort((a, b) => a.number - b.number).map((s) => s.fountain.trim() + "\n")].join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
/** Batches of scenes for the writer: up to `maxScenes` or `maxMinutes` of screen time each. */
export function writingBatches(outline: OutlineScene[], maxScenes = 5, maxMinutes = 12) {
  const out: number[][] = [];
  let cur: number[] = [], mins = 0;
  for (const s of [...outline].sort((a, b) => a.number - b.number)) {
    if (cur.length && (cur.length >= maxScenes || mins + s.est_minutes > maxMinutes)) { out.push(cur); cur = []; mins = 0; }
    cur.push(s.number); mins += s.est_minutes;
  }
  if (cur.length) out.push(cur);
  return out;
}

// ---- Rewriting one scene -------------------------------------------------------------------------------------------
const MODE_TEXT: Record<RewriteInput["mode"], string> = {
  improve: "Improve this scene: sharper conflict, clearer intention, stronger images and dialogue, same story events.",
  expand: "Expand this scene: let the moments breathe — more behaviour, reactions and exchanges — without adding new plot.",
  rephrase: "Rephrase this scene: same beats and meaning, fresh wording in action and dialogue.",
  condense: "Condense this scene: cut to the essential beats, keep every plot point and the scene's ending.",
  dialogue: "Sharpen the dialogue: more subtext, distinct voices for each character, fewer on-the-nose lines. Keep the action.",
  new_scene: "Write a new scene to go between the scenes given as BEFORE and AFTER, following the instruction.",
};
export const REWRITE_SYSTEM = `You are the script doctor inside The AuraStage, a film production studio. You rework one scene at the
writer's request and return the whole scene, ready to drop into the screenplay. Keep the scene heading unless asked to
change it. Stay consistent with the story bible and with the scenes before and after.
${CRAFT}
Return only the requested JSON: the full scene in Fountain, and a short list of what you changed.`;
export function rewriteRequest(raw: RewriteInput) {
  const input = RewriteInputSchema.parse(raw);
  return {
    system: REWRITE_SYSTEM,
    prompt: [bible(input.story), MODE_TEXT[input.mode], input.instruction ? `The writer's instruction: ${input.instruction}` : "",
      input.before ? `BEFORE (the scene before, for continuity):\n${input.before}` : "", input.scene_text ? `THE SCENE:\n${input.scene_text}` : "",
      input.after ? `AFTER (the scene after, for continuity):\n${input.after}` : ""].filter(Boolean).join("\n\n"),
    schema: RewriteOutputSchema, engine_version: ENGINE_VERSION, max_tokens: 24000,
  };
}
export function checkRewrite(raw: RewriteInput, out: RewriteOutput): WritingCheck[] {
  const input = RewriteInputSchema.parse(raw);
  const h0 = input.scene_text ? headingOf(input.scene_text).toUpperCase() : null, h1 = headingOf(out.fountain).toUpperCase();
  const w0 = wordsOf(input.scene_text), w1 = wordsOf(out.fountain);
  const els = screenplayFormatEngine({ source_text: out.fountain }).elements;
  const lengthOk = input.mode === "expand" ? w1 > w0 : input.mode === "condense" ? w1 < w0 : true;
  return [
    { id: "heading", ok: /^(INT|EXT|INT\.?\/EXT|I\/E)[. ]/.test(h1) && (!h0 || h0 === h1 || /heading|location|time/i.test(input.instruction)), label: "Keeps a proper scene heading", evidence: h1.slice(0, 80) },
    { id: "format", ok: els.some((e) => e.type === "action"), label: "Reads as a screenplay scene", evidence: `${els.length} elements` },
    { id: "length", ok: lengthOk, label: input.mode === "expand" ? "Longer than before" : input.mode === "condense" ? "Shorter than before" : "Length", evidence: w0 ? `${w0} → ${w1} words` : `${w1} words` },
  ];
}

export const scriptWriting = { outlineRequest, checkOutline, writeScenesRequest, checkScenes, rewriteRequest, checkRewrite, assembleScript, writingBatches, version: ENGINE_VERSION };
