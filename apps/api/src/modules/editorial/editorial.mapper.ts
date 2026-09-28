// apps/api/src/modules/editorial/editorial.mapper.ts
import { TimelineClipSchema, type TimelineClip } from "@aurastage/contracts";

type Row = Record<string, any>;
export const toClipDTO = (r: Row): TimelineClip =>
  TimelineClipSchema.parse({
    id: r.id, track: r.track, kind: r.kind, record_in: Number(r.record_in), duration: Number(r.duration), source_in: Number(r.source_in),
    source_frames: r.source_frames === null || r.source_frames === undefined ? null : Number(r.source_frames),
    scene_id: r.scene_id ?? null, shot_id: r.shot_id ?? null, take_id: r.take_id ?? null, audio_session_version_id: r.audio_session_version_id ?? null,
    label: r.label, grade: { exposure: 0, contrast: 0, saturation: 0, temperature: 0, ...(r.grade ?? {}) },
  });
