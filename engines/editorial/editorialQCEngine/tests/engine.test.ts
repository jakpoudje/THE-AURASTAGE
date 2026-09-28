import { describe, expect, it } from "vitest";
import { NEUTRAL_GRADE } from "@aurastage/contracts";
import { editorialQCEngine } from "../engine";

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const c = (n: number, track: "V1" | "A1", kind: string, record_in: number, duration: number, scene = 90) => ({
  id: U(n), track, kind, record_in, duration, source_in: 0, source_frames: null, scene_id: U(scene), shot_id: null, take_id: null, audio_session_version_id: null, label: `C${n}`, grade: NEUTRAL_GRADE,
});
const scenes = [{ scene_id: U(90), number: 1, heading: "EXT. HARBOUR" }, { scene_id: U(91), number: 2, heading: "INT. ROOM" }];
const qc = (clips: unknown[], issues: unknown[] = [], target: number | null = null) => editorialQCEngine({ fps: 24, clips, scenes, issues, target_runtime_minutes: target });
const get = (r: ReturnType<typeof qc>, id: string) => r.checks.find((x) => x.id === id)!;

describe("editorialQCEngine", () => {
  it("a clean, synced cut is ready for Picture Lock", () => {
    const r = qc([c(1, "V1", "take", 0, 48), c(2, "V1", "take", 48, 48), c(3, "A1", "audio_mix", 0, 96)]);
    expect(r.ready_for_lock).toBe(true);
    expect(r.checks.every((x) => x.ok)).toBe(true);
    expect(r.duration_frames).toBe(96);
  });
  it("offline slugs and out-of-date sources block the lock, with timecodes", () => {
    const r = qc([c(1, "V1", "take", 0, 48), c(2, "V1", "slug", 48, 24)], [{ clip_id: U(1), code: "take_superseded", message: "C1: a newer take is approved" }]);
    expect(r.ready_for_lock).toBe(false);
    expect(get(r, "no_offline").at[0]).toMatchObject({ clip_id: U(2), timecode: "00:00:02:00" });
    expect(get(r, "sources_current").ok).toBe(false);
  });
  it("flags gaps, flash frames and sound out of sync (not blocking)", () => {
    const r = qc([c(1, "V1", "take", 0, 48), c(2, "V1", "take", 72, 4), c(3, "A1", "audio_mix", 12, 64)]);
    expect(get(r, "no_gaps").at[0]).toMatchObject({ frame: 48, note: "24 frames of black" });
    expect(get(r, "no_flash_frames").ok).toBe(false);
    expect(get(r, "audio_sync").at[0].note).toMatch(/late by 12 frames/);
    expect(r.ready_for_lock).toBe(true);
  });
  it("reports scenes without sound and runtime against the target", () => {
    const r = qc([c(1, "V1", "take", 0, 24 * 60, 90), c(2, "V1", "take", 24 * 60, 24 * 60, 91), c(3, "A1", "audio_mix", 0, 24 * 60, 90)], [], 2);
    expect(get(r, "scenes_have_audio").evidence).toMatch(/1 scene without sound/);
    expect(get(r, "runtime").ok).toBe(true);
  });
  it("an empty timeline is not ready", () => {
    expect(qc([]).ready_for_lock).toBe(false);
  });
});
