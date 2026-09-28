import { describe, expect, it } from "vitest";
import { audioSpottingEngine } from "../engine";

const base = () => ({
  scene: { number: 2, heading: "EXT. LAGOS HARBOUR - NIGHT", int_ext: "EXT", location: "LAGOS HARBOUR", time_of_day: "NIGHT" },
  scene_seconds: 20,
  shots: [
    { ordinal: 1, story_start: 0, story_end: 4, dialogue_line_ids: [] },
    { ordinal: 2, story_start: 4, story_end: 10, dialogue_line_ids: ["l1", "l2"] },
    { ordinal: 3, story_start: 10, story_end: 20, dialogue_line_ids: ["l3"] },
  ],
  lines: [
    { id: "l1", speaker: "TUNDE", character_id: "t", character_name: "Tunde Okafor", text: "You came.", estimated_seconds: 1 },
    { id: "l2", speaker: "TUNDE", character_id: "t", character_name: "Tunde Okafor", text: "I didn't think you would.", estimated_seconds: 2 },
    { id: "l3", speaker: "RADIO", character_id: null, character_name: null, text: "Breaking news.", estimated_seconds: 1.5, voice_over: true },
  ],
  dna: {
    sound_intent: "Low drones under the rain",
    weather: "rain",
    atmosphere: "dark",
    mood: ["tense"],
    sound_candidates: [
      { cue: "Rain ambience", line: 3, text: "Rain lashes the jetty." },
      { cue: "Footsteps", line: 5, text: "Footsteps approach." },
    ],
  },
});

describe("audioSpottingEngine", () => {
  it("places each line where the approved shot plan puts it, one DX track per speaker", () => {
    const r = audioSpottingEngine(base());
    const dx = r.clips.filter((c) => c.source.dialogue_line_id);
    expect(dx.map((c) => [c.track_key, c.start_seconds, c.duration_seconds])).toEqual([
      ["dx:t", 4, 1],
      ["dx:t", 5.5, 2],
      ["dx:RADIO", 10, 1.5],
    ]);
    expect(r.tracks.find((t) => t.key === "dx:t")).toMatchObject({ name: "DX — Tunde Okafor", family: "DX" });
    expect(r.tracks.find((t) => t.key === "dx:RADIO")).toMatchObject({ name: "VO — RADIO", family: "VO" });
    expect(dx[0].source.evidence).toBe("Shot 2 of the approved shot plan");
  });

  it("adds an ambience bed across the scene from the heading, weather and atmosphere", () => {
    const bg = audioSpottingEngine(base()).clips.find((c) => c.track_key === "bg")!;
    expect(bg).toMatchObject({ start_seconds: 0, duration_seconds: 20, label: "Exterior lagos harbour ambience — rain, dark, night" });
  });

  it("splits Scene DNA sound cues into Foley vs FX, with the script line as evidence", () => {
    const r = audioSpottingEngine(base());
    const fx = r.clips.filter((c) => c.track_key === "fx" || c.track_key === "foley");
    expect(fx.map((c) => [c.track_key, c.label])).toEqual([["fx", "Rain ambience"], ["foley", "Footsteps"]]);
    expect(fx[1].source.evidence).toBe("Script line 5: Footsteps approach.");
    expect(fx.every((c) => c.start_seconds >= 0 && c.start_seconds + c.duration_seconds <= 20)).toBe(true);
  });

  it("adds a score cue from mood + sound intent, and tracks come in department order", () => {
    const r = audioSpottingEngine(base());
    expect(r.clips.find((c) => c.track_key === "score")!.label).toBe("Score — tense — Low drones under the rain");
    expect(r.tracks.map((t) => t.family)).toEqual(["DX", "VO", "FOLEY", "FX", "BG", "SCORE"]);
  });

  it("a scene with no mood or sound notes gets no invented score", () => {
    const input = base();
    input.dna = { ...input.dna, mood: [], sound_intent: null };
    expect(audioSpottingEngine(input).tracks.some((t) => t.family === "SCORE")).toBe(false);
  });

  it("is deterministic", () => {
    expect(audioSpottingEngine(base())).toEqual(audioSpottingEngine(base()));
  });
});
