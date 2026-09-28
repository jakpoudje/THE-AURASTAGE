// Pure helpers for drawing and navigating the timeline (frames <-> pixels, timecode).
import type { TimelineClip, TimelineTrack } from "@aurastage/contracts";
import { timecode } from "@aurastage/engines";

export const tc = (frame: number, fps: number) => timecode(frame, fps);
export const clipEnd = (c: { record_in: number; duration: number }) => c.record_in + c.duration;
export const onTrack = (clips: TimelineClip[], t: TimelineTrack) => clips.filter((c) => c.track === t).sort((a, b) => a.record_in - b.record_in);
export const clipAt = (clips: TimelineClip[], t: TimelineTrack, frame: number) => onTrack(clips, t).find((c) => c.record_in <= frame && frame < clipEnd(c)) ?? null;
export const timelineLength = (clips: TimelineClip[]) => clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0);

/** CSS preview of a clip grade (display only; the grade values are what is stored). */
export function gradeFilter(g: { exposure: number; contrast: number; saturation: number }) {
  return `brightness(${Math.pow(2, g.exposure).toFixed(3)}) contrast(${(1 + g.contrast).toFixed(3)}) saturate(${(1 + g.saturation).toFixed(3)})`;
}
