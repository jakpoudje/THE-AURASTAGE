// apps/api/src/modules/audio/audio.mapper.ts
import { AudioClipSchema, AudioTrackSchema } from "@aurastage/contracts";

type Row = Record<string, any>;
const n = (x: unknown) => Number(x);
export const toTrackDTO = (r: Row) => AudioTrackSchema.parse({ ...r, gain_db: n(r.gain_db), pan: n(r.pan) });
export const toClipDTO = (r: Row) =>
  AudioClipSchema.parse({
    ...r,
    start_seconds: n(r.start_seconds), duration_seconds: n(r.duration_seconds), offset_seconds: n(r.offset_seconds),
    gain_db: n(r.gain_db), fade_in_seconds: n(r.fade_in_seconds), fade_out_seconds: n(r.fade_out_seconds),
  });
export const toMeasurementDTO = (r: Row | null) =>
  r
    ? {
        id: r.id as string,
        session_revision: r.session_revision as string,
        integrated_lufs: r.integrated_lufs === null ? null : n(r.integrated_lufs),
        true_peak_dbtp: r.true_peak_dbtp === null ? null : n(r.true_peak_dbtp),
        lra_lu: r.lra_lu === null ? null : n(r.lra_lu),
        duration_seconds: n(r.duration_seconds),
        clip_count: r.clip_count as number,
        engine_version: r.engine_version as string,
        measured_at: r.measured_at as string,
      }
    : null;
