import { describe, expect, it } from "vitest";
import { proceduralAudioEngine } from "../engine";

const rms = (a: Float32Array) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);

describe("proceduralAudioEngine", () => {
  it("builds an ambience bed from the cue's words and says why", () => {
    const r = proceduralAudioEngine({ kind: "ambience", description: "Exterior lagos harbour ambience — heavy rain, dawn", duration_seconds: 3 });
    expect(r.layers.map((l) => l.name)).toEqual(["room tone", "rain", "sea / waves", "distant traffic", "birds"]);
    expect(r.channels[0].length).toBe(3 * 48000);
    expect(rms(r.channels[0])).toBeGreaterThan(0.01);
    expect(r.channels[0].reduce((m, x) => Math.max(m, Math.abs(x)), 0)).toBeLessThanOrEqual(0.7080);
  });
  it("is deterministic for a seed and different for another", () => {
    const a = proceduralAudioEngine({ kind: "fx", description: "door slams", duration_seconds: 1, seed: 7 });
    const b = proceduralAudioEngine({ kind: "fx", description: "door slams", duration_seconds: 1, seed: 7 });
    const c = proceduralAudioEngine({ kind: "fx", description: "door slams", duration_seconds: 1, seed: 8 });
    expect(a.channels[0]).toEqual(b.channels[0]);
    expect(a.channels[0]).not.toEqual(c.channels[0]);
  });
  it("recognises effects and admits when it doesn't", () => {
    expect(proceduralAudioEngine({ kind: "foley", description: "footsteps on gravel", duration_seconds: 2 }).layers[0].name).toBe("footsteps");
    const g = proceduralAudioEngine({ kind: "fx", description: "a unicorn sneezes", duration_seconds: 1 });
    expect(g.layers[0]).toMatchObject({ name: "generic impact" });
  });
  it("chooses the score from the mood", () => {
    expect(proceduralAudioEngine({ kind: "score", description: "Score", mood: ["tense"], duration_seconds: 4 }).layers[0].name).toBe("tense minor pulse");
    expect(proceduralAudioEngine({ kind: "score", description: "Score — hopeful", duration_seconds: 4 }).layers[0].name).toBe("bright major progression");
  });
});

describe("proceduralAudioEngine 1.1.0: a main theme for titles and credits", () => {
  const theme = (seed: number) => proceduralAudioEngine({ kind: "score", description: "Main theme for the titles", duration_seconds: 8, mood: ["tense"], seed, sample_rate: 44100 });
  it("adds a melody over the chords, the same tune every time for the same film", () => {
    const a = theme(7);
    expect(a.layers[0].name).toBe("tense minor pulse + main theme melody");
    expect(Array.from(a.channels[0].slice(0, 44100 * 4))).toEqual(Array.from(theme(7).channels[0].slice(0, 44100 * 4)));
    expect(Array.from(theme(8).channels[0].slice(0, 44100 * 4))).not.toEqual(Array.from(a.channels[0].slice(0, 44100 * 4)));
  });
  it("other score cues are exactly as in 1.0.0 (no melody unless a theme is asked for)", () => {
    const plain = proceduralAudioEngine({ kind: "score", description: "Score — tense", duration_seconds: 2, mood: ["tense"], seed: 1 });
    expect(plain.layers[0].name).toBe("tense minor pulse");
  });
});
