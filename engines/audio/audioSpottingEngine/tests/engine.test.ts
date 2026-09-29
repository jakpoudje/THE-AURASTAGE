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

describe("audioSpottingEngine 1.1.0: sound cues placed by their script position", () => {
  const placed = () => {
    const input = base() as any;
    input.script_lines = { start: 1, end: 12 };
    // Script: 3 rain (before anyone speaks), 4 "You came.", 5 footsteps, 6 "I didn't think…", 9 "Breaking news."
    input.lines[0].script_line = 4; input.lines[1].script_line = 6; input.lines[2].script_line = 9;
    return audioSpottingEngine(input);
  };
  it("a cue between two lines lands between them; a cue before the first line lands before it", () => {
    const fx = placed().clips.filter((c) => c.track_key === "fx" || c.track_key === "foley");
    const rain = fx.find((c) => c.label === "Rain ambience")!, steps = fx.find((c) => c.label === "Footsteps")!;
    // "You came." is 4–5 s, "I didn't think you would." starts at 5.5 s; line 5 is halfway between lines 4 and 6.
    expect(steps.start_seconds).toBe(5.25);
    expect(steps.source.evidence).toBe("Script line 5: Footsteps approach. (placed by its script position — after “You came.”)");
    // Line 3 is 3/4 of the way from the scene start (line 0) to "You came." (line 4, at 4 s).
    expect(rain.start_seconds).toBe(3);
    expect(rain.start_seconds).toBeLessThan(4);
  });
  it("without script positions, cues are spread as before (1.0.0 behaviour)", () => {
    const fx = audioSpottingEngine(base()).clips.filter((c) => c.track_key === "fx" || c.track_key === "foley");
    expect(fx.map((c) => c.start_seconds)).toEqual([4, 14]);
    expect(fx[1].source.evidence).toBe("Script line 5: Footsteps approach.");
  });
  it("cues on the same track never start on top of each other", () => {
    const input = base() as any;
    input.lines[0].script_line = 4; input.lines[1].script_line = 20;
    input.dna.sound_candidates = [{ cue: "Footsteps", line: 5, text: "a" }, { cue: "Door knock", line: 5, text: "b" }];
    const f = audioSpottingEngine(input).clips.filter((c) => c.track_key === "foley");
    expect(f[1].start_seconds).toBeGreaterThan(f[0].start_seconds);
  });
});
