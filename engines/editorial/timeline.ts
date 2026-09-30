// Shared timeline helpers for the editorial engines (pure, no I/O).
import { z } from "zod";
import { TimelineClipSchema, type TimelineClip, type TimelineTrack } from "@aurastage/contracts";

/** Clips inside an engine may not have an id yet (new pieces); the API assigns ids. */
export const EngineClipSchema = TimelineClipSchema.extend({ id: z.string().uuid().nullable() });
export type EngineClip = z.infer<typeof EngineClipSchema>;

export const end = (c: { record_in: number; duration: number }) => c.record_in + c.duration;

export function onTrack<T extends { track: TimelineTrack; record_in: number }>(clips: T[], track: TimelineTrack): T[] {
  return clips.filter((c) => c.track === track).sort((a, b) => a.record_in - b.record_in);
}

/** SMPTE non-drop timecode HH:MM:SS:FF. */
export function timecode(frames: number, fps: number, startHour = 0) {
  const f = Math.max(0, Math.round(frames)) + startHour * 3600 * fps;
  const ff = f % fps, s = Math.floor(f / fps), ss = s % 60, mm = Math.floor(s / 60) % 60, hh = Math.floor(s / 3600);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(hh)}:${p(mm)}:${p(ss)}:${p(ff)}`;
}

/** Pairs of overlapping clips on the same track. */
export function overlaps<T extends { track: TimelineTrack; record_in: number; duration: number }>(clips: T[]): [T, T][] {
  const out: [T, T][] = [];
  for (const t of ["V1", "V2", "A1", "A2"] as const) {
    const list = onTrack(clips, t);
    for (let i = 1; i < list.length; i++) if (list[i].record_in < end(list[i - 1])) out.push([list[i - 1], list[i]]);
  }
  return out;
}

export const sortClips = <T extends { track: TimelineTrack; record_in: number }>(clips: T[]) =>
  [...clips].sort((a, b) => (a.track === b.track ? a.record_in - b.record_in : a.track < b.track ? 1 : -1));

export type { TimelineClip };
