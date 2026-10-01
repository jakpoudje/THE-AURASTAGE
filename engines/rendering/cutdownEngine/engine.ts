// engines/rendering/cutdownEngine
// Social cut-downs and the trailer assistant (BUILD_PLAN §8 item 13). Cuts a short piece from the locked picture — never
// new footage — by choosing windows of the cut and laying them end to end. Every clip on every track (picture, inserts,
// scene mixes, music) inside a window comes along, re-timed, so picture and sound stay in sync.
//   • social (15–60 s): a hook (the strongest moment first), then the strongest moments in story order, a title card at
//     the end ("Watch <title>").
//   • trailer (60–180 s): the trailer shape — setup from the opening (quieter, longer windows), an escalation montage
//     (short, intense windows), a climax tease (the strongest moment, cut short), then the title card. Text cards between
//     sections come from the logline.
// How strong a moment is comes from the scene: Scene DNA mood and the dialogue's intensity (passed in per scene).
import { z } from "zod";
import { ENGINE_VERSION } from "./version";

const Clip = z.object({
  id: z.string(), track: z.enum(["V1", "V2", "A1", "A2"]), kind: z.string(), record_in: z.number().int().min(0), duration: z.number().int().min(1),
  source_in: z.number().int().min(0), scene_id: z.string().nullable(),
}).passthrough();
export const CutdownInputSchema = z.object({
  kind: z.enum(["social", "trailer"]),
  seconds: z.number().int().min(6).max(300),
  fps: z.number().int().min(1).max(120).default(24),
  clips: z.array(Clip).max(20000),
  /** Per scene: its number and how intense it is (0–10, from Scene DNA mood and the dialogue). */
  scenes: z.array(z.object({ scene_id: z.string(), number: z.number().int(), intensity: z.number().min(0).max(10).default(5) })).max(2000),
  title: z.string().max(200),
  logline: z.string().max(500).nullable().default(null),
});
export type CutdownInput = z.input<typeof CutdownInputSchema>;
type C = z.infer<typeof Clip>;
export interface CutdownOutput {
  clips: C[];
  windows: { from: number; to: number; scene_number: number | null; section: string; why: string }[];
  cards: { record_in: number; duration: number; text: string; position: "center" | "lower_third" }[];
  frames: number;
  engine_version: string;
}

/** A stable UUID-shaped id for a piece of a clip (the same cut gives the same ids). */
function pieceId(src: string): string {
  const h = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b].map((seed) => { let x = seed >>> 0; for (const ch of src) { x ^= ch.charCodeAt(0); x = Math.imul(x, 16777619) >>> 0; } return x.toString(16).padStart(8, "0"); }).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
/** Phrases from the logline for the trailer's text cards ("When her brother vanishes" / "she must expose the truth"). */
function phrases(logline: string | null): string[] {
  if (!logline) return [];
  return logline.replace(/\s+/g, " ").split(/\s*(?:,|—|–| - |;|\bbut\b|\buntil\b)\s*/i).map((p) => p.trim().replace(/[.]$/, "")).filter((p) => p.length >= 8 && p.length <= 70).slice(0, 3);
}

export function cutdownEngine(raw: CutdownInput): CutdownOutput {
  const i = CutdownInputSchema.parse(raw);
  const fps = i.fps;
  const v1 = i.clips.filter((c) => c.track === "V1").sort((a, b) => a.record_in - b.record_in);
  const cutEnd = Math.max(0, ...i.clips.map((c) => c.record_in + c.duration));
  const sceneOf = new Map(i.scenes.map((s) => [s.scene_id, s]));
  // Stretches of picture per scene in cut order.
  const spans: { scene_id: string | null; from: number; to: number; number: number | null; intensity: number }[] = [];
  for (const c of v1) {
    const last = spans[spans.length - 1];
    if (last && last.scene_id === c.scene_id && c.record_in <= last.to + 1) { last.to = Math.max(last.to, c.record_in + c.duration); continue; }
    const s = c.scene_id ? sceneOf.get(c.scene_id) : undefined;
    spans.push({ scene_id: c.scene_id, from: c.record_in, to: c.record_in + c.duration, number: s?.number ?? null, intensity: s?.intensity ?? 5 });
  }
  const target = i.seconds * fps;
  const cardLen = Math.round(2.5 * fps);
  const windows: CutdownOutput["windows"] = [];
  const take = (sp: typeof spans[number], len: number, where: "middle" | "start" | "end", section: string, why: string) => {
    const L = Math.max(Math.round(fps * 0.8), Math.min(len, sp.to - sp.from));
    const from = where === "start" ? sp.from : where === "end" ? sp.to - L : sp.from + Math.floor((sp.to - sp.from - L) / 2);
    windows.push({ from, to: from + L, scene_number: sp.number, section, why });
  };
  if (!spans.length) return { clips: [], windows: [], cards: [], frames: 0, engine_version: ENGINE_VERSION };
  const byStrength = [...spans].sort((a, b) => b.intensity - a.intensity || (b.to - b.from) - (a.to - a.from));
  if (i.kind === "social") {
    const body = target - cardLen;
    const hook = byStrength[0];
    const n = Math.max(2, Math.min(spans.length, Math.round(i.seconds / 5)));
    const per = Math.round(body / n);
    take(hook, per, "middle", "hook", `the strongest moment first (scene ${hook.number ?? "?"}, intensity ${hook.intensity})`);
    const rest = byStrength.filter((s) => s !== hook).slice(0, n - 1).sort((a, b) => a.from - b.from);
    for (const s of rest) take(s, per, "middle", "moments", `one of the strongest scenes (intensity ${s.intensity}), in story order`);
  } else {
    const body = target - cardLen;
    const setupN = Math.max(1, Math.round(spans.length * 0.25)), setup = spans.slice(0, setupN);
    const setupLen = Math.round(body * 0.3), montageLen = Math.round(body * 0.45), teaseLen = body - setupLen - montageLen;
    for (const s of setup) take(s, Math.round(setupLen / setup.length), "start", "setup", `the world and the people (scene ${s.number ?? "?"})`);
    const climax = byStrength[0];
    const montage = byStrength.filter((s) => !setup.includes(s) && s !== climax).slice(0, Math.max(3, Math.round(montageLen / (1.6 * fps)))).sort((a, b) => a.from - b.from);
    const mLen = montage.length ? Math.max(Math.round(fps * 0.8), Math.round(montageLen / montage.length)) : 0;
    for (const s of montage) take(s, mLen, "middle", "escalation", `escalation montage — intensity ${s.intensity}`);
    take(climax, teaseLen, "middle", "climax tease", `the climax, cut short — no spoilers past the turn (scene ${climax.number ?? "?"})`);
  }
  // Lay the windows end to end and bring every track along, re-timed (picture and sound stay in sync).
  const out: C[] = [];
  const cards: CutdownOutput["cards"] = [];
  let cursor = 0;
  const lines = phrases(i.logline);
  let lastSection = "";
  windows.forEach((w, wi) => {
    if (i.kind === "trailer" && w.section !== lastSection && lines.length && wi > 0) {
      const text = lines.shift();
      if (text) cards.push({ record_in: cursor, duration: Math.min(Math.round(2 * fps), w.to - w.from), text: text.toUpperCase(), position: "center" });
    }
    lastSection = w.section;
    for (const c of i.clips) {
      const a = Math.max(c.record_in, w.from), b = Math.min(c.record_in + c.duration, w.to);
      if (b <= a) continue;
      out.push({ ...c, id: pieceId(`${c.id}~${wi}`), record_in: cursor + (a - w.from), duration: b - a, source_in: c.source_in + (a - c.record_in),
        ...(c.track === "V1" && (c as Record<string, unknown>).transition ? { transition: { in: "cut", out: "cut", frames: 12 } } : {}) });
    }
    cursor += w.to - w.from;
  });
  // The title card closes it.
  cards.push({ record_in: cursor - Math.min(cursor, cardLen), duration: Math.min(cursor, cardLen), text: i.kind === "trailer" ? i.title.toUpperCase() : `Watch ${i.title}`, position: "center" });
  return { clips: out, windows, cards, frames: cursor, engine_version: ENGINE_VERSION };
}
