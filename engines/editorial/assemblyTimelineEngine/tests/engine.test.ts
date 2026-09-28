import { describe, expect, it } from "vitest";
import { assemblyTimelineEngine } from "../engine";

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const scene = (over: Record<string, unknown> = {}) => ({
  scene_id: U(1), number: 1, heading: "EXT. HARBOUR - NIGHT",
  shots: [
    { shot_id: U(11), ordinal: 1, size: "WS", story_start: 0, story_end: 8, take: { take_id: U(21), duration_seconds: null } },
    { shot_id: U(12), ordinal: 2, size: "CU", story_start: 2, story_end: 4, take: { take_id: U(22), duration_seconds: null } },
  ],
  audio: { audio_session_version_id: U(31), version_number: 1, scene_seconds: 8 },
  ...over,
});

describe("assemblyTimelineEngine", () => {
  it("intercuts coverage: wide, close-up, back to the wide at the right source offset", () => {
    const r = assemblyTimelineEngine({ fps: 24, scenes: [scene()] });
    const v = r.clips.filter((c) => c.track === "V1");
    expect(v.map((c) => [c.shot_id, c.record_in, c.duration])).toEqual([[U(11), 0, 48], [U(12), 48, 48], [U(11), 96, 96]]);
    expect(r.duration_frames).toBe(192);
    expect(r.rationale.length).toBe(3);
  });
  it("puts the approved mix on A1 in sync with the scene picture", () => {
    const r = assemblyTimelineEngine({ fps: 24, scenes: [scene(), scene({ scene_id: U(2), number: 2, audio: null })] });
    const a = r.clips.filter((c) => c.track === "A1");
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ record_in: 0, duration: 192, audio_session_version_id: U(31), label: "Scene 1 mix v1" });
    expect(r.clips.filter((c) => c.track === "V1" && c.scene_id === U(2))[0].record_in).toBe(192);
  });
  it("keeps the place of shots without an approved take as offline slugs", () => {
    const s = scene();
    (s.shots as any)[1].take = null;
    const v = assemblyTimelineEngine({ fps: 24, scenes: [s] }).clips.filter((c) => c.track === "V1");
    expect(v[1]).toMatchObject({ kind: "slug", shot_id: U(12), duration: 48 });
    expect(v[1].label).toMatch(/no approved take/);
  });
  it("uses video source offsets and fills a too-short take with a slug", () => {
    const s = scene({ shots: [{ shot_id: U(11), ordinal: 1, story_start: 0, story_end: 8, take: { take_id: U(21), duration_seconds: 5 } }] });
    const v = assemblyTimelineEngine({ fps: 24, scenes: [s] }).clips.filter((c) => c.track === "V1");
    expect(v.map((c) => [c.kind, c.duration, c.source_frames])).toEqual([["take", 120, 120], ["slug", 72, null]]);
  });
  it("shows story time no shot covers as a slug, never hides it", () => {
    const s = scene({ shots: [{ shot_id: U(11), ordinal: 1, story_start: 2, story_end: 8, take: { take_id: U(21), duration_seconds: null } }] });
    const v = assemblyTimelineEngine({ fps: 24, scenes: [s] }).clips.filter((c) => c.track === "V1");
    expect(v[0]).toMatchObject({ kind: "slug", record_in: 0, duration: 48 });
  });
  it("is deterministic and orders scenes by number", () => {
    const a = assemblyTimelineEngine({ fps: 24, scenes: [scene({ scene_id: U(2), number: 2 }), scene()] });
    const b = assemblyTimelineEngine({ fps: 24, scenes: [scene(), scene({ scene_id: U(2), number: 2 })] });
    expect(a).toEqual(b);
    expect(a.clips[0].scene_id).toBe(U(1));
  });
});
