import { describe, expect, it } from "vitest";
import { NEUTRAL_GRADE } from "@aurastage/contracts";
import { editDecisionEngine } from "../engine";

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const clip = (n: number, track: "V1" | "A1", record_in: number, duration: number, extra: Record<string, unknown> = {}) => ({
  id: U(n), track, kind: track === "V1" ? "take" : "audio_mix", record_in, duration, source_in: 0, source_frames: track === "A1" ? 200 : null,
  scene_id: U(90), shot_id: track === "V1" ? U(80 + n) : null, take_id: track === "V1" ? U(70 + n) : null, audio_session_version_id: track === "A1" ? U(60) : null,
  label: `C${n}`, grade: { ...NEUTRAL_GRADE }, ...extra,
});
// V1: C1 [0,48) C2 [48,96) C3 [96,192)   A1: C4 [0,192) (scene mix)
const tl = () => [clip(1, "V1", 0, 48), clip(2, "V1", 48, 48), clip(3, "V1", 96, 96), clip(4, "A1", 0, 192)];
const run = (operation: unknown, extra: Record<string, unknown> = {}) => editDecisionEngine({ clips: tl(), operation, ...extra });
const pick = (r: ReturnType<typeof run>, track: string) => r.clips.filter((c) => c.track === track).map((c) => [c.label, c.record_in, c.duration, c.source_in]);

describe("editDecisionEngine", () => {
  it("1.2.0: an insert over the picture (V2) and music (A2) never move the cut; a ripple carries them along; music has its own level", () => {
    const ins = { ...clip(9, "V1", 0, 24), track: "V2", id: null, label: "INSERT" };
    let r = run({ op: "insert", at: 60, source: { kind: "insert_shot", shot_id: U(99) } }, { new_clip: ins });
    expect(pick(r, "V1")).toEqual([["C1", 0, 48, 0], ["C2", 48, 48, 0], ["C3", 96, 96, 0]]);
    expect(pick(r, "V2")).toEqual([["INSERT", 60, 24, 0]]);
    expect(r.summary).toMatch(/cut is unchanged/);
    const mus = { ...clip(8, "A1", 0, 150), track: "A2", kind: "music", id: null, audio_session_version_id: null, asset_id: U(55), source_frames: 400, label: "THEME" };
    const withIds = (x: ReturnType<typeof run>) => x.clips.map((c, k) => ({ ...c, id: c.id ?? U(200 + k) }));
    r = editDecisionEngine({ clips: withIds(r), operation: { op: "overwrite", at: 0, source: { kind: "music", asset_id: U(55) } }, new_clip: mus });
    expect(pick(r, "A2")).toEqual([["THEME", 0, 150, 0]]);
    // Extracting C1 (48 frames at the start) pulls the insert and the music with the picture.
    r = editDecisionEngine({ clips: withIds(r), operation: { op: "extract", clip_id: U(1) } });
    expect(pick(r, "V2")).toEqual([["INSERT", 12, 24, 0]]);
    expect(pick(r, "A2")).toEqual([["THEME", 0, 102, 48]]);
    const music = r.clips.find((c) => c.track === "A2")!;
    r = editDecisionEngine({ clips: withIds(r), operation: { op: "gain", clip_id: music.id, gain_db: -9 } });
    expect(r.clips.find((c) => c.track === "A2")!.gain_db).toBe(-9);
    expect(() => editDecisionEngine({ clips: withIds(r), operation: { op: "gain", clip_id: U(2), gain_db: -9 } })).toThrow(/Only music clips/);
  });

  it("blade splits a clip; the new piece continues the source", () => {
    const r = run({ op: "blade", track: "V1", at: 120 });
    expect(pick(r, "V1")).toEqual([["C1", 0, 48, 0], ["C2", 48, 48, 0], ["C3", 96, 24, 0], ["C3", 120, 72, 24]]);
    expect(r.clips.find((c) => c.record_in === 120)!.id).toBeNull();
  });
  it("lift leaves a gap; extract closes it on every track (sync lock)", () => {
    expect(pick(run({ op: "lift", clip_id: U(2) }), "V1")).toEqual([["C1", 0, 48, 0], ["C3", 96, 96, 0]]);
    const r = run({ op: "extract", clip_id: U(2) });
    expect(pick(r, "V1")).toEqual([["C1", 0, 48, 0], ["C3", 48, 96, 0]]);
    // the scene mix loses the same 48 frames: split around the removed range
    expect(pick(r, "A1")).toEqual([["C4", 0, 48, 0], ["C4", 48, 96, 96]]);
  });
  it("insert pushes everything after it later on all tracks", () => {
    const r = run({ op: "insert", at: 48, source: { kind: "shot", shot_id: U(99) } }, { new_clip: { ...clip(9, "V1", 0, 24), id: null, label: "NEW" } });
    expect(pick(r, "V1")).toEqual([["C1", 0, 48, 0], ["NEW", 48, 24, 0], ["C2", 72, 48, 0], ["C3", 120, 96, 0]]);
    expect(pick(r, "A1")).toEqual([["C4", 0, 48, 0], ["C4", 72, 144, 48]]);
  });
  it("overwrite replaces a range without changing length", () => {
    const r = run({ op: "overwrite", at: 40, source: { kind: "shot", shot_id: U(99) } }, { new_clip: { ...clip(9, "V1", 0, 16), id: null, label: "NEW" } });
    expect(pick(r, "V1")).toEqual([["C1", 0, 40, 0], ["NEW", 40, 16, 0], ["C2", 56, 40, 8], ["C3", 96, 96, 0]]);
    expect(pick(r, "A1")).toEqual([["C4", 0, 192, 0]]);
  });
  it("plain trim refuses to overlap; ripple trim moves what follows", () => {
    expect(() => run({ op: "trim", clip_id: U(1), edge: "out", delta: 10, ripple: false })).toThrow(/overlap/);
    expect(pick(run({ op: "trim", clip_id: U(2), edge: "out", delta: -8, ripple: false }), "V1")[1]).toEqual(["C2", 48, 40, 0]);
    const r = run({ op: "trim", clip_id: U(2), edge: "out", delta: -8, ripple: true });
    expect(pick(r, "V1")).toEqual([["C1", 0, 48, 0], ["C2", 48, 40, 0], ["C3", 88, 96, 0]]);
    const g = run({ op: "trim", clip_id: U(2), edge: "out", delta: 12, ripple: true });
    expect(pick(g, "V1")).toEqual([["C1", 0, 48, 0], ["C2", 48, 60, 0], ["C3", 108, 96, 0]]);
  });
  it("ripple trim of a head keeps the clip in place and uses later media", () => {
    const r = run({ op: "trim", clip_id: U(3), edge: "in", delta: 24, ripple: true });
    expect(pick(r, "V1")[2]).toEqual(["C3", 96, 72, 24]);
    const back = editDecisionEngine({ clips: r.clips.map((c, i) => ({ ...c, id: c.id ?? U(50 + i) })), operation: { op: "trim", clip_id: U(3), edge: "in", delta: -24, ripple: true } });
    expect(pick(back, "V1")[2]).toEqual(["C3", 96, 96, 0]);
    expect(() => run({ op: "trim", clip_id: U(3), edge: "in", delta: -1, ripple: true })).toThrow(/no more media before/);
  });
  it("roll moves the cut point between two clips, keeping total length", () => {
    const r = run({ op: "roll", clip_id: U(1), delta: 6 });
    expect(pick(r, "V1").slice(0, 2)).toEqual([["C1", 0, 54, 0], ["C2", 54, 42, 6]]);
    expect(() => run({ op: "roll", clip_id: U(3), delta: 6 })).toThrow(/no clip right after/);
  });
  it("slip changes the media shown, not position; stills and slugs refuse", () => {
    const clips = tl().map((c) => (c.id === U(2) ? { ...c, source_frames: 120 } : c));
    const r = editDecisionEngine({ clips, operation: { op: "slip", clip_id: U(2), delta: 30 } });
    expect(r.clips.find((c) => c.id === U(2))).toMatchObject({ record_in: 48, duration: 48, source_in: 30 });
    expect(() => editDecisionEngine({ clips, operation: { op: "slip", clip_id: U(2), delta: 100 } })).toThrow(/no more media after/);
    expect(() => run({ op: "slip", clip_id: U(1), delta: 5 })).toThrow(/still image/);
  });
  it("slide moves a clip between its neighbours", () => {
    const r = run({ op: "slide", clip_id: U(2), delta: 10 });
    expect(pick(r, "V1")).toEqual([["C1", 0, 58, 0], ["C2", 58, 48, 0], ["C3", 106, 86, 10]]);
  });
  it("move refuses overlaps; grade only on picture", () => {
    expect(() => run({ op: "move", clip_id: U(3), record_in: 90 })).toThrow(/overlap/);
    expect(run({ op: "move", clip_id: U(3), record_in: 200 }).clips.find((c) => c.id === U(3))!.record_in).toBe(200);
    const g = run({ op: "grade", clip_id: U(1), grade: { exposure: 0.5, contrast: 0.1, saturation: -0.2, temperature: 0.3 } });
    expect(g.clips.find((c) => c.id === U(1))!.grade.exposure).toBe(0.5);
    expect(() => run({ op: "grade", clip_id: U(4), grade: NEUTRAL_GRADE })).toThrow(/picture/);
  });
  it("conform swaps sources but keeps the cut", () => {
    const r = run({ op: "conform" }, { replacements: [{ clip_id: U(2), kind: "take", take_id: U(77), audio_session_version_id: null, source_frames: null, label: "C2 new take" }] });
    expect(r.clips.find((c) => c.id === U(2))).toMatchObject({ take_id: U(77), record_in: 48, duration: 48, label: "C2 new take" });
    expect(() => run({ op: "conform" }, { replacements: [] })).toThrow(/already/);
  });
  it("1.3.0 (owner 2026-10-02): conform adds approved scene sound that isn't on the cut, in sync, in free space only", () => {
    // Scene 2's picture follows at 192; its mix was approved after the cut was assembled.
    const clips = [...tl(), clip(5, "V1", 192, 100, { scene_id: U(91) })];
    const mix = (record_in: number, duration: number) => ({ ...clip(6, "A1", record_in, duration), id: null, scene_id: U(91), audio_session_version_id: U(61), label: "Scene 2 mix v1" });
    let r = editDecisionEngine({ clips, operation: { op: "conform" }, additions: [mix(192, 100)] });
    expect(pick(r, "A1")).toEqual([["C4", 0, 192, 0], ["Scene 2 mix v1", 192, 100, 0]]);
    expect(pick(r, "V1")).toEqual(pick(editDecisionEngine({ clips, operation: { op: "conform" }, additions: [mix(192, 100)] }), "V1"));
    expect(r.summary).toMatch(/added the approved sound of 1 scene/i);
    // Never covers existing sound: shortened to the gap before the next clip, skipped where sound already plays.
    const later = { ...clip(7, "A1", 250, 50), scene_id: U(92) };
    r = editDecisionEngine({ clips: [...clips, later], operation: { op: "conform" }, additions: [mix(192, 100)] });
    expect(pick(r, "A1")).toEqual([["C4", 0, 192, 0], ["Scene 2 mix v1", 192, 58, 0], ["C7", 250, 50, 0]]);
    expect(() => editDecisionEngine({ clips, operation: { op: "conform" }, additions: [mix(100, 50)] })).toThrow(/no free space/);
  });
  it("refuses unknown clips in plain language", () => {
    expect(() => run({ op: "lift", clip_id: U(55) })).toThrow(/no longer on the timeline/);
  });
  it("regression (live 2026-09-30): trimming a clip below its transition shrinks the transition (or makes it a cut) instead of refusing the edit", () => {
    const base = [clip(1, "V1", 0, 12, { transition: { in: "fade_from_black", out: "cut", frames: 6 } })];
    const shorter = editDecisionEngine({ clips: base, operation: { op: "trim", clip_id: U(1), edge: "out", delta: -8, ripple: false } });
    expect(shorter.clips[0]).toMatchObject({ duration: 4, transition: { in: "fade_from_black", out: "cut", frames: 4 } });
    const both = [clip(1, "V1", 0, 12, { transition: { in: "dissolve", out: "fade_to_black", frames: 6 } })];
    const tiny = editDecisionEngine({ clips: both, operation: { op: "trim", clip_id: U(1), edge: "out", delta: -9, ripple: false } });
    expect(tiny.clips[0]).toMatchObject({ duration: 3, transition: { in: "cut", out: "cut" } });
  });
  it("transitions: set on a picture clip; refused on sound or when longer than the clip; a blade keeps the fade-in on the first piece and the fade-out on the second", () => {
    const r = run({ op: "transition", clip_id: U(2), transition: { in: "dissolve", out: "fade_to_black", frames: 12 } });
    expect(r.clips.find((c) => c.id === U(2))!.transition).toEqual({ in: "dissolve", out: "fade_to_black", frames: 12 });
    expect(r.summary).toBe("“C2” now dissolves in and fades out to black (12 frames).");
    expect(() => run({ op: "transition", clip_id: U(4), transition: { in: "dissolve", out: "cut", frames: 12 } })).toThrow(/picture clips/);
    expect(() => run({ op: "transition", clip_id: U(1), transition: { in: "fade_from_black", out: "fade_to_black", frames: 30 } })).toThrow(/only 48 frames/);
    const both = editDecisionEngine({ clips: [clip(1, "V1", 0, 96, { transition: { in: "fade_from_black", out: "fade_to_black", frames: 12 } })], operation: { op: "blade", track: "V1", at: 48 } });
    expect(both.clips.map((c) => [c.record_in, c.transition.in, c.transition.out])).toEqual([[0, "fade_from_black", "cut"], [48, "cut", "fade_to_black"]]);
  });
});
