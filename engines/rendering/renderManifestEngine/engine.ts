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
      picture.push({ kind: "take", record_in: c.record_in, duration: c.duration, source_in: c.source_in, take_id: c.take_id, storage_key: tk?.storage_key ?? null, media_type: tk?.media_type ?? null, capability: tk?.capability ?? null, grade: c.grade, label: c.label });
    }
    t = Math.max(t, c.record_in + c.duration);
  }
  if (duration > t) black(t, duration);

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
  if (NEEDS_AUDIO.has(p.id) && !audio.length) missing.push("The locked cut has no sound — place the approved scene mixes on A1");
  if (p.id === "subtitles" && !subtitles.cues.length) missing.push("There is no dialogue in the locked cut to subtitle");
  const files = p.files.filter((f) => !(f === "captions.srt" && !subtitles.cues.length));

  const manifest: RenderManifest = {
    schema: MANIFEST_SCHEMA,
    project: i.project,
    profile: p,
    options: { watermark: p.supports.watermark ? i.options.watermark : null, burn_timecode: p.supports.burn_timecode ? i.options.burn_timecode : false },
    picture_lock: i.picture_lock,
    fps: i.fps,
    duration_frames: duration,
    picture,
    audio,
    mixes,
    assets,
    subtitles: subtitles.cues.length ? subtitles : null,
    edl: p.id === "edit_decision_list" ? edlExportEngine({ title: i.project.title, fps: i.fps, clips: i.clips }).edl : null,
    files,
    sources: {
      take_ids: [...new Set(picture.map((s) => s.take_id).filter((x): x is string => !!x))],
      audio_session_version_ids: Object.keys(mixes),
      asset_ids: Object.keys(assets),
      dialogue_line_ids: [...new Set(subtitles.cues.map((c) => c.line_id))],
    },
    engine_versions: { manifest: ENGINE_VERSION, subtitles: SUB_V, audio_mix: MIX_V, profile: p.version },
  };
  return { manifest: missing.length ? null : manifest, missing, engine_version: ENGINE_VERSION };
}
