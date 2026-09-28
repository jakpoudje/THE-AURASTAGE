import { describe, expect, it } from "vitest";
import { subtitleTimelineEngine } from "../engine";

const base = () => ({
  fps: 24,
  audio: [{ record_in: 240, duration: 192, source_in: 0, mix_version_id: "m1" }],
  mixes: { m1: { dialogue: [{ line_id: "l1", start_seconds: 1, duration_seconds: 2 }, { line_id: "l2", start_seconds: 4, duration_seconds: 0.5 }] } },
  lines: { l1: { speaker: "TUNDE", text: "You came." }, l2: { speaker: "AMARA", text: "I always do." } },
});

describe("subtitleTimelineEngine", () => {
  it("places lines where they are heard in the cut and writes SRT + VTT", () => {
    const r = subtitleTimelineEngine(base());
    expect(r.cues.map((c) => [c.start_frame, c.end_frame, c.text])).toEqual([[264, 312, "You came."], [336, 360, "I always do."]]);
    expect(r.srt).toContain("1\n00:00:11,000 --> 00:00:13,000\nYou came.\n");
    expect(r.vtt.startsWith("WEBVTT\n\n1\n00:00:11.000 --> 00:00:13.000")).toBe(true);
  });
  it("drops lines cut out of the edit and clips partly cut lines", () => {
    const i = base();
    i.audio[0] = { record_in: 0, duration: 36, source_in: 48, mix_version_id: "m1" }; // plays scene 2.0s..3.5s
    const r = subtitleTimelineEngine(i);
    expect(r.cues).toHaveLength(1);
    expect(r.cues[0]).toMatchObject({ start_frame: 0, end_frame: 24, line_id: "l1" }); // extended to 1 s minimum
  });
  it("wraps long lines to two of at most 42 characters and flags fast reading", () => {
    const i = base();
    i.lines.l1.text = "I have been waiting on this jetty since the rain started and I will not wait any longer for you";
    const r = subtitleTimelineEngine(i);
    const lines = r.cues[0].text.split("\n");
    expect(lines).toHaveLength(2);
    expect(r.warnings.some((w) => /characters per second/.test(w))).toBe(true);
  });
  it("keeps a gap before the next cue when extending short cues", () => {
    const i = base();
    i.mixes.m1.dialogue = [{ line_id: "l1", start_seconds: 1, duration_seconds: 0.25 }, { line_id: "l2", start_seconds: 1.5, duration_seconds: 1 }];
    const r = subtitleTimelineEngine(i);
    expect(r.cues[0].end_frame).toBe(r.cues[1].start_frame - 2);
  });
});
