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

describe("proceduralAudioEngine 1.2.0: ambient beds (owner request 2026-10-01)", () => {
  const sr = 44100;
  it("an ambient cue keeps the mood's harmony but plays as a slow, soft bed — no pulse, swelling in", () => {
    const bed = proceduralAudioEngine({ kind: "score", description: "Ambient bed — tense, suspense", duration_seconds: 12, seed: 3, sample_rate: sr });
    expect(bed.layers[0].name).toBe("tense minor pulse — ambient bed");
    // Swells in: the first 50 ms are far quieter than the middle (a pulse score starts at full level).
    const L = bed.channels[0];
    const head = rms(L.slice(0, sr * 0.05)), mid = rms(L.slice(sr * 5, sr * 6));
    expect(head).toBeLessThan(mid * 0.2);
    // No pulse: short-window energy barely changes across a bar (a pulse score jumps at every eighth note).
    const win = Math.floor(sr * 0.05), energies: number[] = [];
    for (let i = sr * 4; i < sr * 6; i += win) energies.push(rms(L.slice(i, i + win)));
    const spread = Math.max(...energies) / Math.min(...energies);
    expect(spread).toBeLessThan(1.6);
  });
  it("is deterministic and peaks safely like every generated file", () => {
    const a = proceduralAudioEngine({ kind: "score", description: "Ambient bed — calm", duration_seconds: 4, seed: 1, sample_rate: sr });
    expect(a.peak_db).toBe(-3);
    expect(Array.from(a.channels[1].slice(0, 2000))).toEqual(Array.from(proceduralAudioEngine({ kind: "score", description: "Ambient bed — calm", duration_seconds: 4, seed: 1, sample_rate: sr }).channels[1].slice(0, 2000)));
  });
});
