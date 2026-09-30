// engines/editorial/assemblyTimelineEngine
// Builds the first assembly: every scene with an approved shot plan, in scene
// order, cut from the approved takes over the plan's story time, with the
// scene's approved mix on A1 lined up with its picture.
import { NEUTRAL_GRADE, NO_TRANSITION } from "@aurastage/contracts";
import { SLUG_MISSING_COVERAGE } from "./rules";
import { validateAssemblyInput } from "./validator";
import { ENGINE_VERSION } from "./version";
import type { EngineClip } from "../timeline";
import type { AssemblyOutput } from "./output.schema";

export function assemblyTimelineEngine(raw: unknown): AssemblyOutput {
  const { fps, scenes } = validateAssemblyInput(raw);
  const F = (s: number) => Math.round(s * fps);
  const clips: EngineClip[] = [];
  const rationale: string[] = [];
  let cursor = 0;
  const base = { id: null, grade: { ...NEUTRAL_GRADE }, transition: { ...NO_TRANSITION }, take_id: null, audio_session_version_id: null, shot_id: null, asset_id: null, gain_db: 0 } as const;

  for (const sc of [...scenes].sort((a, b) => a.number - b.number)) {
    const shots = sc.shots.filter((s) => s.story_end > s.story_start).map((s) => ({ ...s, a: F(s.story_start), b: F(s.story_end) }));
    const length = Math.max(F(sc.audio?.scene_seconds ?? 0), ...shots.map((s) => s.b), 0);
    if (length === 0) continue;
    const points = [...new Set([0, length, ...shots.flatMap((s) => [s.a, s.b])])].filter((p) => p <= length).sort((x, y) => x - y);
    // Choose a shot for each interval, then merge neighbours with the same choice.
    const pieces: { a: number; b: number; shot: (typeof shots)[number] | null }[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const active = shots.filter((s) => s.a <= a && s.b >= b).sort((x, y) => y.a - x.a || y.ordinal - x.ordinal);
      const shot = active[0] ?? null;
      const last = pieces[pieces.length - 1];
      if (last && last.b === a && last.shot?.shot_id === shot?.shot_id) last.b = b;
      else pieces.push({ a, b, shot });
    }
    for (const p of pieces) {
      const record_in = cursor + p.a;
      if (!p.shot) {
        clips.push({ ...base, track: "V1", kind: "slug", record_in, duration: p.b - p.a, source_in: 0, source_frames: null, scene_id: sc.scene_id, label: `Scene ${sc.number} — ${SLUG_MISSING_COVERAGE}` });
        rationale.push(`Scene ${sc.number} ${p.a}-${p.b}f: no shot covers this story time — offline slug.`);
        continue;
      }
      const s = p.shot;
      const name = `Scene ${sc.number} · Shot ${s.ordinal}${s.size ? ` (${s.size})` : ""}`;
      const offset = p.a - s.a;
      if (!s.take) {
        clips.push({ ...base, track: "V1", kind: "slug", record_in, duration: p.b - p.a, source_in: offset, source_frames: null, scene_id: sc.scene_id, shot_id: s.shot_id, label: `${name} — no approved take` });
        rationale.push(`${name}: no approved take yet — offline slug keeps its place.`);
        continue;
      }
      const srcFrames = s.take.duration_seconds === null ? null : F(s.take.duration_seconds);
      const usable = srcFrames === null ? p.b - p.a : Math.max(0, Math.min(p.b - p.a, srcFrames - offset));
      if (usable > 0) {
        clips.push({ ...base, track: "V1", kind: "take", record_in, duration: usable, source_in: srcFrames === null ? 0 : offset, source_frames: srcFrames, scene_id: sc.scene_id, shot_id: s.shot_id, take_id: s.take.take_id, label: name });
        rationale.push(`${name}: story time ${(p.a / fps).toFixed(2)}–${(p.b / fps).toFixed(2)}s${offset ? " (returns to this shot after a tighter one)" : ""}.`);
      }
      if (usable < p.b - p.a) {
        clips.push({ ...base, track: "V1", kind: "slug", record_in: record_in + usable, duration: p.b - p.a - usable, source_in: 0, source_frames: null, scene_id: sc.scene_id, shot_id: s.shot_id, label: `${name} — take too short` });
        rationale.push(`${name}: the approved take is shorter than the shot — the rest is an offline slug.`);
      }
    }
    if (sc.audio) {
      const d = F(sc.audio.scene_seconds);
      clips.push({ ...base, track: "A1", kind: "audio_mix", record_in: cursor, duration: Math.min(d, length), source_in: 0, source_frames: d, scene_id: sc.scene_id, audio_session_version_id: sc.audio.audio_session_version_id, label: `Scene ${sc.number} mix v${sc.audio.version_number}` });
    }
    cursor += length;
  }
  return { clips, rationale, duration_frames: cursor, engine_version: ENGINE_VERSION };
}
