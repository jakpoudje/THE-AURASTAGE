// engines/editorial/editorialQCEngine
// Timeline checks with evidence and exact timecodes. Blocking checks gate Picture Lock.
import { end, onTrack, overlaps, timecode } from "../timeline";
import { FLASH_FRAME_MAX, RUNTIME_TOLERANCE } from "./rules";
import { validateEditorialQCInput } from "./validator";
import { ENGINE_VERSION } from "./version";
import type { EditorialQCOutput, QCCheck } from "./output.schema";

export function editorialQCEngine(raw: unknown): EditorialQCOutput {
  const { fps, clips, scenes, issues, target_runtime_minutes } = validateEditorialQCInput(raw);
  const tc = (f: number) => timecode(f, fps);
  const where = (clip_id: string | null, frame: number, note: string) => ({ clip_id, frame, timecode: tc(frame), note });
  const v1 = onTrack(clips, "V1"), a1 = onTrack(clips, "A1");
  const duration = Math.max(0, ...clips.map(end));
  const checks: QCCheck[] = [];
  const add = (c: QCCheck) => checks.push(c);
  const list = (n: number, what: string) => `${n} ${what}${n === 1 ? "" : "s"}`;

  const pictures = v1.filter((c) => c.kind === "take");
  add({ id: "has_picture", label: "The timeline has picture", ok: pictures.length > 0, blocking: true, evidence: pictures.length ? list(pictures.length, "picture clip") : "No approved takes on V1 yet", at: [] });

  const slugs = v1.filter((c) => c.kind === "slug");
  add({
    id: "no_offline", label: "No offline media (every shot has an approved take)", ok: slugs.length === 0, blocking: true,
    evidence: slugs.length ? `${list(slugs.length, "offline slug")}: ${slugs.slice(0, 3).map((s) => s.label).join("; ")}${slugs.length > 3 ? "…" : ""}` : "All picture is online",
    at: slugs.map((s) => where(s.id, s.record_in, s.label)),
  });

  const byClip = new Map(clips.map((c) => [c.id, c]));
  add({
    id: "sources_current", label: "Every clip uses the currently approved take or mix", ok: issues.length === 0, blocking: true,
    evidence: issues.length ? `${list(issues.length, "clip")} out of date: ${issues.slice(0, 2).map((i) => i.message).join("; ")}${issues.length > 2 ? "…" : ""}` : "All sources are current",
    at: issues.map((i) => where(i.clip_id, byClip.get(i.clip_id)?.record_in ?? 0, i.message)),
  });

  const ov = overlaps(clips);
  add({ id: "no_overlaps", label: "No overlapping clips", ok: ov.length === 0, blocking: true, evidence: ov.length ? list(ov.length, "overlap") : "Clean", at: ov.map(([, b]) => where(b.id, b.record_in, `${b.label} overlaps the clip before it`)) });

  const flashes = v1.filter((c) => c.duration <= FLASH_FRAME_MAX);
  add({
    id: "no_flash_frames", label: `No flash frames (picture clips of ${FLASH_FRAME_MAX} frames or less)`, ok: flashes.length === 0, blocking: false,
    evidence: flashes.length ? list(flashes.length, "flash frame") : "None", at: flashes.map((c) => where(c.id, c.record_in, `${c.label}: ${c.duration} frames`)),
  });

  const gaps: { a: number; b: number }[] = [];
  let t = 0;
  for (const c of v1) {
    if (c.record_in > t) gaps.push({ a: t, b: c.record_in });
    t = Math.max(t, end(c));
  }
  add({
    id: "no_gaps", label: "No gaps in the picture (black)", ok: gaps.length === 0, blocking: false,
    evidence: gaps.length ? `${list(gaps.length, "gap")}, ${gaps.reduce((s, g) => s + g.b - g.a, 0)} frames of black` : "Continuous",
    at: gaps.map((g) => where(null, g.a, `${g.b - g.a} frames of black`)),
  });

  // Sync: each scene's mix should start where the scene's picture starts and last as long.
  const sync: QCCheck["at"] = [];
  const missing: QCCheck["at"] = [];
  const name = new Map(scenes.map((s) => [s.scene_id, `Scene ${s.number}`]));
  const sceneIds = [...new Set(v1.map((c) => c.scene_id).filter((x): x is string => !!x))];
  for (const sid of sceneIds) {
    const pic = v1.filter((c) => c.scene_id === sid);
    const pa = Math.min(...pic.map((c) => c.record_in)), pb = Math.max(...pic.map(end));
    const mixes = a1.filter((c) => c.scene_id === sid);
    if (!mixes.length) {
      missing.push(where(null, pa, `${name.get(sid) ?? "A scene"} has no approved mix on A1`));
      continue;
    }
    const ma = Math.min(...mixes.map((c) => c.record_in)), mb = Math.max(...mixes.map(end));
    if (ma !== pa || mb !== pb) {
      const off = ma - pa;
      sync.push(where(mixes[0].id, ma, `${name.get(sid) ?? "Scene"}: sound ${off === 0 ? "starts in sync" : `${off > 0 ? "late" : "early"} by ${Math.abs(off)} frames`}, ${mb - ma === pb - pa ? "same length" : `${Math.abs(mb - ma - (pb - pa))} frames ${mb - ma > pb - pa ? "longer" : "shorter"} than the picture`}`));
    }
  }
  add({ id: "audio_sync", label: "Scene sound is in sync with the picture", ok: sync.length === 0, blocking: false, evidence: sync.length ? `${list(sync.length, "scene")} out of sync` : "In sync", at: sync });
  add({ id: "scenes_have_audio", label: "Every scene has its approved mix", ok: missing.length === 0, blocking: false, evidence: missing.length ? `${list(missing.length, "scene")} without sound` : "All scenes have sound", at: missing });

  if (target_runtime_minutes) {
    const mins = duration / fps / 60;
    const ok = Math.abs(mins - target_runtime_minutes) <= target_runtime_minutes * RUNTIME_TOLERANCE;
    add({ id: "runtime", label: `Runtime within 10 % of the ${target_runtime_minutes}-minute target`, ok, blocking: false, evidence: `Cut runs ${tc(duration)} (${mins.toFixed(1)} min)`, at: [] });
  }
  return { checks, ready_for_lock: checks.filter((c) => c.blocking).every((c) => c.ok), duration_frames: duration, engine_version: ENGINE_VERSION };
}
