// engines/rendering/renderManifestEngine
// Compiles the immutable RenderManifest for one deliverable from a Picture Lock
// version: gap-free picture segments (approved takes or black), the scene mixes
// on A1 with their recordings, subtitle cues and the EDL, plus the exact source
// ids it was derived from (rule 10).
import { AudioFamilySchema, SessionMixSchema, TrackFxSchema } from "@aurastage/contracts";
import { edlExportEngine } from "../../editorial/edlExportEngine";
import { subtitleTimelineEngine } from "../subtitleTimelineEngine";
import { ENGINE_VERSION as SUB_V } from "../subtitleTimelineEngine/version";
import { ENGINE_VERSION as MIX_V } from "../timelineAudioMixEngine/version";
import { NEEDS_AUDIO, NEEDS_PICTURE } from "./rules";
import { validateRenderManifestInput } from "./validator";
import { ENGINE_VERSION, MANIFEST_SCHEMA } from "./version";
import type { PictureSegment, RenderManifest, RenderManifestOutput } from "./output.schema";

/** How long on-screen text stays up at the start of its scene (seconds). */
export const CAPTION_SECONDS = 4;

export function renderManifestEngine(raw: unknown): RenderManifestOutput {
  const i = validateRenderManifestInput(raw);
  const missing: string[] = [];
  const v1 = i.clips.filter((c) => c.track === "V1").sort((a, b) => a.record_in - b.record_in);
  const a1 = i.clips.filter((c) => c.track === "A1").sort((a, b) => a.record_in - b.record_in);
  const duration = Math.max(0, ...i.clips.map((c) => c.record_in + c.duration));

  // Picture: approved takes, black in gaps.
  const picture: PictureSegment[] = [];
  let t = 0;
  const black = (from: number, to: number) => picture.push({ kind: "black", record_in: from, duration: to - from, source_in: 0, take_id: null, storage_key: null, media_type: null, capability: null, grade: null, label: "Black" });
  for (const c of v1) {
    if (c.record_in > t) black(t, c.record_in);
    if (c.kind !== "take" || !c.take_id) missing.push(`${c.label}: offline — no approved take`);
    else {
      const tk = i.takes[c.take_id];
      if (!tk?.storage_key) missing.push(`${c.label}: the take's media file is missing`);
      // A dissolve straight after black (a gap, or the very start) is a fade up from black — the same frames on screen.
      const tr = c.transition ?? { in: "cut", out: "cut", frames: 12 };
      const prev = picture.at(-1);
      const t0 = tr.in === "dissolve" && (!prev || prev.kind === "black" || prev.record_in + prev.duration !== c.record_in) ? { ...tr, in: "fade_from_black" as const } : tr;
      // A clip trimmed shorter than its transition gets a shorter one (never longer than the clip allows).
      const ends = (t0.in !== "cut" ? 1 : 0) + (t0.out !== "cut" ? 1 : 0);
      const transition = ends ? { ...t0, frames: Math.max(1, Math.min(t0.frames, Math.floor(c.duration / ends))) } : t0;
      picture.push({ kind: "take", record_in: c.record_in, duration: c.duration, source_in: c.source_in, take_id: c.take_id, storage_key: tk?.storage_key ?? null, media_type: tk?.media_type ?? null, capability: tk?.capability ?? null, grade: c.grade, label: c.label,
        ...(transition.in !== "cut" || transition.out !== "cut" ? { transition } : {}) });
    }
    t = Math.max(t, c.record_in + c.duration);
  }
  if (duration > t) black(t, duration);

  // Inserts over the picture (V2, manifest ≥ 1.7.0): while one lasts it is the picture; V1 carries on underneath,
  // so its source keeps running and the cut after the insert is unchanged.
  const v2 = i.clips.filter((c) => c.track === "V2").sort((a, b) => a.record_in - b.record_in);
  for (const c of v2) {
    const tk = c.take_id ? i.takes[c.take_id] : undefined;
    if (c.kind !== "take" || !c.take_id) { missing.push(`${c.label}: the insert has no approved take`); continue; }
    if (!tk?.storage_key) { missing.push(`${c.label}: the insert's media file is missing`); continue; }
    const a = c.record_in, b = c.record_in + c.duration;
    const next: PictureSegment[] = [];
    for (const seg of picture) {
      const e = seg.record_in + seg.duration;
      if (e <= a || seg.record_in >= b) { next.push(seg); continue; }
      if (seg.record_in < a) next.push({ ...seg, duration: a - seg.record_in, ...(seg.transition ? { transition: { ...seg.transition, out: "cut" as const } } : {}) });
      if (e > b) next.push({ ...seg, record_in: b, duration: e - b, source_in: seg.source_in + (b - seg.record_in), ...(seg.transition ? { transition: { ...seg.transition, in: "cut" as const } } : {}) });
    }
    next.push({ kind: "take", record_in: a, duration: c.duration, source_in: c.source_in, take_id: c.take_id, storage_key: tk.storage_key, media_type: tk.media_type ?? null, capability: tk.capability ?? null, grade: c.grade, label: `Insert: ${c.label}` });
    picture.splice(0, picture.length, ...next.sort((x, y) => x.record_in - y.record_in));
  }

  // Sound: the approved scene mixes, real recordings only.
  const mixes: RenderManifest["mixes"] = {};
  const assets: RenderManifest["assets"] = {};
  const audio: RenderManifest["audio"] = [];
  for (const c of a1) {
    const id = c.audio_session_version_id;
    const m = id ? i.mixes[id] : undefined;
    if (!id || !m) {
      missing.push(`${c.label}: the approved mix is missing`);
      continue;
    }
    audio.push({ record_in: c.record_in, duration: c.duration, source_in: c.source_in, mix_version_id: id, label: c.label });
    if (mixes[id]) continue;
    mixes[id] = {
      seconds: m.seconds,
      // Channel strips and routing travel with the mix, so the render sounds like the approved Audio Studio mix.
      tracks: m.tracks.map((tr) => ({ id: tr.id, family: AudioFamilySchema.parse(tr.family), gain_db: Number(tr.gain_db), pan: Number(tr.pan), mute: tr.mute, solo: tr.solo,
        fx: TrackFxSchema.parse((tr as { fx?: unknown }).fx ?? {}) })),
      clips: m.clips
        .filter((cl) => cl.kind === "asset" && cl.asset_id)
        .map((cl) => ({
          track_id: cl.track_id, asset_id: cl.asset_id!, start_seconds: Number(cl.start_seconds), duration_seconds: Number(cl.duration_seconds), offset_seconds: Number(cl.offset_seconds),
          gain_db: Number(cl.gain_db), fade_in_seconds: Number(cl.fade_in_seconds), fade_out_seconds: Number(cl.fade_out_seconds),
        })),
      mix: SessionMixSchema.parse(m.mix ?? {}),
    };
    for (const cl of mixes[id].clips) {
      const a = i.assets[cl.asset_id];
      if (!a?.storage_key) missing.push(`${c.label}: a recording's file is missing`);
      else assets[cl.asset_id] = { storage_key: a.storage_key, media_type: a.media_type };
    }
  }

  // Music across scenes (A2, manifest ≥ 1.7.0): audio files from the Assets Library, each at its own level.
  const music: RenderManifest["music"] = [];
  for (const c of i.clips.filter((x) => x.track === "A2").sort((a, b) => a.record_in - b.record_in)) {
    const a = c.asset_id ? i.assets[c.asset_id] : undefined;
    if (!c.asset_id || !a?.storage_key) { missing.push(`${c.label}: the music file is missing`); continue; }
    assets[c.asset_id] = { storage_key: a.storage_key, media_type: a.media_type };
    music.push({ record_in: c.record_in, duration: c.duration, source_in: c.source_in, asset_id: c.asset_id, gain_db: c.gain_db ?? 0, label: c.label });
  }

  // Titles (video deliverables only): the opening card pushes the whole cut later; the credit roll follows it.
  const p0 = i.profile;
  const titled = !!p0.video && !!i.titles && (!!i.titles.opening || !!i.titles.end_credits);
  const offset = titled ? i.titles!.opening?.frames ?? 0 : 0;
  const cutEnd = duration;
  if (offset) {
    for (const s of picture) s.record_in += offset;
    for (const a of audio) a.record_in += offset;
    for (const x of music) x.record_in += offset;
    picture.unshift({ kind: "title", record_in: 0, duration: offset, source_in: 0, take_id: null, storage_key: null, media_type: "image/svg+xml", capability: null, grade: null, label: "Opening title", svg: i.titles!.opening!.svg });
  }
  const roll = titled ? i.titles!.end_credits : null;
  if (roll) picture.push({ kind: "credits", record_in: offset + cutEnd, duration: roll.frames, source_in: 0, take_id: null, storage_key: null, media_type: "image/svg+xml", capability: null, grade: null, label: "End credits", svg: roll.svg, image_height: roll.image_height });
  // On-screen text (video deliverables): over the first CAPTION_SECONDS of each scene's first stretch of picture in
  // the cut (or the whole stretch when shorter), shifted with the opening card like everything else.
  const overlays: RenderManifest["overlays"] = [];
  if (p0.video) {
    const seen = new Set<string>();
    for (let k = 0; k < v1.length; k++) {
      const c = v1[k], cap = c.scene_id ? i.captions[c.scene_id] : undefined;
      if (!c.scene_id || !cap || seen.has(c.scene_id)) continue;
      seen.add(c.scene_id);
      let end = c.record_in + c.duration;
      for (let n = k + 1; n < v1.length && v1[n].scene_id === c.scene_id && v1[n].record_in <= end; n++) end = Math.max(end, v1[n].record_in + v1[n].duration);
      overlays.push({ record_in: c.record_in + offset, duration: Math.min(end - c.record_in, CAPTION_SECONDS * i.fps), text: cap.text, position: cap.position, scene_id: c.scene_id });
    }
  }
  const automation = offset ? { A1: i.automation.A1.map((pt) => ({ ...pt, frame: pt.frame + offset })) } : i.automation;
  const totalFrames = offset + cutEnd + (roll?.frames ?? 0);

  // Subtitles from the dialogue actually heard in the cut.
  const dialogue: Record<string, { dialogue: { line_id: string; start_seconds: number; duration_seconds: number }[] }> = {};
  for (const [id, m] of Object.entries(i.mixes))
    dialogue[id] = {
      dialogue: m.clips
        .filter((cl) => typeof cl.source?.dialogue_line_id === "string" && Number(cl.duration_seconds) > 0)
        .map((cl) => ({ line_id: String(cl.source!.dialogue_line_id), start_seconds: Number(cl.start_seconds), duration_seconds: Number(cl.duration_seconds) })),
    };
  const subtitles = subtitleTimelineEngine({ fps: i.fps, audio: audio.map(({ label, ...a }) => a), mixes: dialogue, lines: i.lines });

  const p = i.profile;
  if (!p.available) missing.push(`${p.label} isn't available: ${p.unavailable_reason}`);
  if (NEEDS_PICTURE.has(p.id) && !v1.length) missing.push("The locked cut has no picture");
  if (NEEDS_AUDIO.has(p.id) && !audio.length && !music.length) missing.push("The locked cut has no sound — place the approved scene mixes on A1");
  if (p.id === "subtitles" && !subtitles.cues.length) missing.push("There is no dialogue in the locked cut to subtitle");
  const files = p.files.filter((f) => !(f === "captions.srt" && !subtitles.cues.length));

  const manifest: RenderManifest = {
    schema: MANIFEST_SCHEMA,
    project: i.project,
    profile: p,
    options: { watermark: p.supports.watermark ? i.options.watermark : null, burn_timecode: p.supports.burn_timecode ? i.options.burn_timecode : false },
    picture_lock: i.picture_lock,
    fps: i.fps,
    duration_frames: totalFrames,
    picture,
    audio,
    music,
    mixes,
    assets,
    automation,
    subtitles: subtitles.cues.length ? subtitles : null,
    edl: p.id === "edit_decision_list" ? edlExportEngine({ title: i.project.title, fps: i.fps, clips: i.clips }).edl : null,
    files,
    sources: {
      take_ids: [...new Set(picture.map((s) => s.take_id).filter((x): x is string => !!x))],
      audio_session_version_ids: Object.keys(mixes),
      asset_ids: Object.keys(assets),
      dialogue_line_ids: [...new Set(subtitles.cues.map((c) => c.line_id))],
      automation_revision: i.automation.A1.length ? i.automation_revision : null,
      ...(overlays.length ? { scene_captions: overlays.map((o) => o.scene_id) } : {}),
    },
    title_music: titled ? i.title_music : null,
    overlays,
    engine_versions: { manifest: ENGINE_VERSION, subtitles: SUB_V, audio_mix: MIX_V, profile: p.version, ...(titled ? { titles: i.titles!.engine_version } : {}) },
  };
  return { manifest: missing.length ? null : manifest, missing, engine_version: ENGINE_VERSION };
}
