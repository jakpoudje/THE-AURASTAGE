// engines/story/continuityCheckEngine — "Continuity Check" in Scriptwriter (UI_REFERENCE §3 AI Tools). Reads the typed
// screenplay elements and reports what a script supervisor would flag, each with the scene and line it comes from:
// characters who speak before they are introduced, near-identical names for what may be one person, a place that
// changes from interior to exterior between consecutive scenes, "CONTINUOUS" scenes that jump in time, dialogue
// without a speaker, scenes with no action, and very long speeches. It never edits anything.
import { sceneBoundaryEngine } from "../sceneBoundaryEngine";
import { ENGINE_VERSION } from "./version";

interface El { index: number; type: string; text: string; line: number; speaker?: string }
export interface ContinuityFinding { id: string; severity: "warning" | "info"; scene_number: number | null; line: number; message: string }

const norm = (n: string) => n.toUpperCase().replace(/\s*\(.*?\)\s*/g, " ").replace(/[^A-Z' ]/g, " ").replace(/\s+/g, " ").trim();
function lev(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

export function continuityCheckEngine(input: { elements: El[] }) {
  const els = input.elements;
  const { scenes } = sceneBoundaryEngine({ elements: els as never });
  const sceneOf = (i: number) => scenes.find((s) => i >= s.element_start && i <= s.element_end)?.number ?? null;
  const findings: ContinuityFinding[] = [];
  const add = (f: Omit<ContinuityFinding, "scene_number"> & { at: number }) => findings.push({ id: f.id, severity: f.severity, line: f.line, message: f.message, scene_number: sceneOf(f.at) });

  // Speakers and where they are first introduced in action (CAPITALS) or first speak.
  const firstSpeech = new Map<string, El>(), introduced = new Map<string, number>();
  for (const e of els) {
    if (e.type === "action") for (const m of e.text.matchAll(/\b([A-Z][A-Z'’.-]+(?:\s+[A-Z][A-Z'’.-]+){0,2})\b/g)) { const k = norm(m[1]); if (!introduced.has(k)) introduced.set(k, e.index); }
    if (e.type === "character") {
      const k = norm(e.speaker ?? e.text);
      if (k && !firstSpeech.has(k)) firstSpeech.set(k, e);
    }
  }
  for (const [name, e] of firstSpeech) {
    const intro = [...introduced.entries()].find(([k]) => k === name || k.split(" ")[0] === name.split(" ")[0])?.[1];
    if (intro === undefined || intro > e.index)
      add({ id: "speaks_before_intro", severity: "info", line: e.line, at: e.index, message: `${name} speaks before being introduced in the action (introduce them in CAPITALS with their age the first time they appear).` });
  }
  // Near-identical speaker names.
  const names = [...firstSpeech.keys()];
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const [a, b] = [names[i], names[j]];
    const short = a.length < 4 || b.length < 4;
    if (!short && (lev(a, b) <= 1 || (a.split(" ").pop() === b.split(" ").pop() && a.split(" ").length !== b.split(" ").length)))
      add({ id: "similar_names", severity: "warning", line: firstSpeech.get(b)!.line, at: firstSpeech.get(b)!.index, message: `"${a}" and "${b}" look like the same person under two names — use one name (or merge them in Casting).` });
  }
  // Consecutive scenes: same place switching INT/EXT, and CONTINUOUS scenes that jump in time of day.
  for (let k = 1; k < scenes.length; k++) {
    const p = scenes[k - 1], s = scenes[k];
    const heading = els[s.element_start];
    if (p.location && p.location === s.location && p.int_ext !== s.int_ext && p.int_ext !== "INT/EXT" && s.int_ext !== "INT/EXT")
      add({ id: "int_ext_switch", severity: "info", line: heading?.line ?? 1, at: s.element_start, message: `Scene ${s.number} is ${s.int_ext} at ${s.location}, straight after ${p.int_ext} in scene ${p.number} — intended?` });
    if (/CONTINUOUS/i.test(s.heading) && p.time_of_day && s.time_of_day && !/CONTINUOUS/i.test(s.time_of_day) && p.time_of_day !== s.time_of_day)
      add({ id: "continuous_time_jump", severity: "warning", line: heading?.line ?? 1, at: s.element_start, message: `Scene ${s.number} is CONTINUOUS but the time changes from ${p.time_of_day} to ${s.time_of_day}.` });
  }
  // Scene-level shape.
  for (const s of scenes) {
    const body = els.slice(s.element_start + 1, s.element_end + 1);
    if (!body.some((e) => e.type === "action")) add({ id: "no_action", severity: "info", line: els[s.element_start]?.line ?? 1, at: s.element_start, message: `Scene ${s.number} has no action lines — the reader can't see where we are.` });
  }
  for (const e of els) {
    if (e.type === "dialogue") {
      const prev = els[e.index - 1];
      if (!prev || !["character", "parenthetical", "dialogue"].includes(prev.type)) add({ id: "orphan_dialogue", severity: "warning", line: e.line, at: e.index, message: "Dialogue without a character cue above it." });
      const w = (e.text.match(/\S+/g) ?? []).length;
      if (w > 160) add({ id: "long_speech", severity: "info", line: e.line, at: e.index, message: `A ${w}-word speech — consider breaking it up or cutting.` });
    }
  }
  findings.sort((a, b) => a.line - b.line);
  return { findings, summary: { warnings: findings.filter((f) => f.severity === "warning").length, notes: findings.filter((f) => f.severity === "info").length, scenes: scenes.length }, engine_version: ENGINE_VERSION };
}
