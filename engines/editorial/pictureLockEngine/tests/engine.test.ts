import { describe, expect, it } from "vitest";
import { NEUTRAL_GRADE } from "@aurastage/contracts";
import { pictureLockEngine } from "../engine";

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const c = (n: number, record_in: number, duration: number, scene: number, extra = {}) => ({
  id: U(n), track: "V1", kind: "take", record_in, duration, source_in: 0, source_frames: null, scene_id: U(scene), shot_id: U(40 + n), take_id: U(20 + n), audio_session_version_id: null, label: `C${n}`, grade: NEUTRAL_GRADE, ...extra,
});
const scenes = [{ scene_id: U(90), number: 1, heading: "A" }, { scene_id: U(91), number: 2, heading: "B" }];
const locked = [c(1, 0, 48, 90), c(2, 48, 48, 90), c(3, 96, 48, 91)];

describe("pictureLockEngine", () => {
  it("no change, no impact", () => {
    expect(pictureLockEngine({ fps: 24, locked, proposed: locked, scenes }).changed).toBe(false);
  });
  it("a trim in scene 1 retimes it (full re-work) and moves scene 2 (conform only)", () => {
    const proposed = [c(1, 0, 40, 90), c(2, 40, 48, 90), c(3, 88, 48, 91)];
    const r = pictureLockEngine({ fps: 24, locked, proposed, scenes });
    expect(r.impact.map((i) => [i.label, i.change])).toEqual([["Scene 1 — A", "retimed"], ["Scene 2 — B", "moved"]]);
    expect(r.impact[0].affects).toContain("Sound mix (re-conform)");
    expect(r.impact[1].affects).not.toContain("Color grade");
  });
  it("a new grade is a recut of that scene only", () => {
    const proposed = [c(1, 0, 48, 90, { grade: { ...NEUTRAL_GRADE, exposure: 1 } }), c(2, 48, 48, 90), c(3, 96, 48, 91)];
    const r = pictureLockEngine({ fps: 24, locked, proposed, scenes });
    expect(r.impact).toHaveLength(1);
    expect(r.impact[0].change).toBe("recut");
  });
  it("removing a scene is reported", () => {
    const r = pictureLockEngine({ fps: 24, locked, proposed: locked.slice(0, 2), scenes });
    expect(r.impact[0]).toMatchObject({ label: "Scene 2 — B", change: "removed" });
  });
});
