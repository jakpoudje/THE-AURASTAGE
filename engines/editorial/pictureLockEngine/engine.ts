// engines/editorial/pictureLockEngine
// What would breaking the Picture Lock touch? Compares the locked cut with the
// proposed one, scene by scene.
import type { PictureImpact } from "@aurastage/contracts";
import { end, onTrack, timecode, type EngineClip } from "../timeline";
import { MOVE_AFFECTS, RECUT_AFFECTS } from "./rules";
import { validatePictureLockInput } from "./validator";
import { ENGINE_VERSION } from "./version";
import type { PictureLockOutput } from "./output.schema";

type Span = { start: number; length: number; cut: string };
function spans(clips: EngineClip[]) {
  const m = new Map<string | null, Span>();
  for (const c of onTrack(clips, "V1")) {
    const s = m.get(c.scene_id);
    const cut = `${c.kind}:${c.take_id ?? c.shot_id}:${c.source_in}:${c.duration}:${JSON.stringify(c.grade)}`;
    if (!s) m.set(c.scene_id, { start: c.record_in, length: c.duration, cut });
    else m.set(c.scene_id, { start: Math.min(s.start, c.record_in), length: Math.max(s.start + s.length, end(c)) - Math.min(s.start, c.record_in), cut: `${s.cut}|${c.record_in - s.start}:${cut}` });
  }
  return m;
}

export function pictureLockEngine(raw: unknown): PictureLockOutput {
  const { fps, locked, proposed, scenes } = validatePictureLockInput(raw);
  const a = spans(locked), b = spans(proposed);
  const name = (id: string | null) => {
    const s = scenes.find((x) => x.scene_id === id);
    return s ? `Scene ${s.number} — ${s.heading}` : "Unassigned picture";
  };
  const impact: PictureImpact[] = [];
  for (const id of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(id), y = b.get(id);
    if (x && !y) impact.push({ scene_id: id, label: name(id), change: "removed", evidence: "No longer in the cut", affects: RECUT_AFFECTS });
    else if (!x && y) impact.push({ scene_id: id, label: name(id), change: "added", evidence: `New at ${timecode(y.start, fps)}`, affects: RECUT_AFFECTS });
    else if (x && y) {
      if (x.cut !== y.cut) impact.push({ scene_id: id, label: name(id), change: x.length !== y.length ? "retimed" : "recut", evidence: `${x.length} → ${y.length} frames`, affects: RECUT_AFFECTS });
      else if (x.start !== y.start) impact.push({ scene_id: id, label: name(id), change: "moved", evidence: `Starts ${timecode(x.start, fps)} → ${timecode(y.start, fps)}`, affects: MOVE_AFFECTS });
    }
  }
  const audioChanged = JSON.stringify(onTrack(locked, "A1").map((c) => [c.audio_session_version_id, c.record_in, c.duration, c.source_in])) !== JSON.stringify(onTrack(proposed, "A1").map((c) => [c.audio_session_version_id, c.record_in, c.duration, c.source_in]));
  if (audioChanged && !impact.length) impact.push({ scene_id: null, label: "Sound track (A1)", change: "recut", evidence: "Scene mixes changed", affects: ["Renders & deliveries"] });
  // Inserts over the picture (V2) and music (A2) are part of the locked cut too.
  const layer = (clips: EngineClip[], t: "V2" | "A2") => JSON.stringify(onTrack(clips, t).map((c) => [c.take_id ?? c.asset_id, c.record_in, c.duration, c.source_in, c.gain_db]));
  if (layer(locked, "V2") !== layer(proposed, "V2")) impact.push({ scene_id: null, label: "Inserts over the picture (V2)", change: "recut", evidence: `${onTrack(locked, "V2").length} → ${onTrack(proposed, "V2").length} insert(s)`, affects: ["Renders & deliveries"] });
  if (layer(locked, "A2") !== layer(proposed, "A2")) impact.push({ scene_id: null, label: "Music track (A2)", change: "recut", evidence: `${onTrack(locked, "A2").length} → ${onTrack(proposed, "A2").length} music clip(s)`, affects: ["Renders & deliveries"] });
  return { changed: impact.length > 0, impact, engine_version: ENGINE_VERSION };
}
