import { describe, expect, it } from "vitest";
import { planRecordedSound, renderRecordedSound, SOUND_CATEGORIES } from "..";

const lib = [
  { id: "rain-a", category: "rain", seconds: 20 }, { id: "rain-b", category: "rain", seconds: 25 },
  { id: "traffic-a", category: "traffic", seconds: 30 }, { id: "crowd-a", category: "crowd", seconds: 30 },
  { id: "insects-a", category: "insects", seconds: 30 }, { id: "thunder-a", category: "thunder", seconds: 8 },
  { id: "door-a", category: "door", seconds: 2 }, { id: "footsteps-a", category: "footsteps", seconds: 4 },
  { id: "knock-a", category: "knock", seconds: 1.5 }, { id: "fire-a", category: "fire", seconds: 20 },
];

describe("recordedSoundEngine (owner request 2026-10-02: real life prop sounds)", () => {
  it("an ambience cue gets the backgrounds its words ask for, spread across the stereo field, with thunder once in a storm", () => {
    const p = planRecordedSound({ kind: "ambience", description: "Exterior Lagos street at night — heavy rain, thunder, a crowd", duration_seconds: 20, seed: 3, library: lib })!;
    expect(p.layers.filter((l) => l.bed).map((l) => l.category)).toEqual(["traffic", "insects", "rain", "crowd"]);
    expect(new Set(p.layers.filter((l) => l.bed).map((l) => l.pan)).size).toBe(4);
    const t = p.layers.find((l) => l.category === "thunder")!;
    expect(t.bed).toBe(false);
    expect(t.at_seconds).toBeGreaterThan(5);
    expect(p.room_tone).toBe("exterior");
    // Same cue, same seed → same choice; and the result says which words have no recording.
    expect(planRecordedSound({ kind: "ambience", description: "Exterior Lagos street at night — heavy rain, thunder, a crowd", duration_seconds: 20, seed: 3, library: lib })).toEqual(p);
    expect(planRecordedSound({ kind: "ambience", description: "Interior office, rain on the windows, waves outside", duration_seconds: 10, library: lib })!.missing).toEqual(["waves"]);
    // "windows" is not wind, "rainbow" is not rain.
    expect(planRecordedSound({ kind: "ambience", description: "a rainbow over the windows", duration_seconds: 5, library: [...lib, { id: "w", category: "wind", seconds: 9 }] })).toBeNull();
  });
  it("effects play in the order the cue says them; footsteps longer than the recording loop; nothing known → null (the synthesiser is used)", () => {
    const p = planRecordedSound({ kind: "fx", description: "Knocks, then the door creaks open", duration_seconds: 4, library: lib })!;
    expect(p.layers.map((l) => [l.category, l.bed])).toEqual([["knock", false], ["door", false]]);
    expect(p.layers[1].at_seconds).toBeGreaterThan(p.layers[0].at_seconds);
    const walk = planRecordedSound({ kind: "foley", description: "footsteps down the corridor", duration_seconds: 12, library: lib })!;
    expect(walk.layers[0]).toMatchObject({ category: "footsteps", bed: true });
    expect(planRecordedSound({ kind: "fx", description: "fire crackling", duration_seconds: 6, library: lib })!.layers[0]).toMatchObject({ category: "fire", bed: true });
    expect(planRecordedSound({ kind: "fx", description: "a strange hum", duration_seconds: 3, library: lib })).toBeNull();
    expect(planRecordedSound({ kind: "ambience", description: "a door slams", duration_seconds: 3, library: lib })).toBeNull();
  });
  it("renders: a background loops seamlessly for longer than its recording (no gap, no click) and peaks at -3 dBFS", () => {
    const sr = 8000, src = new Float32Array(sr * 2).map((_, i) => 0.5 * Math.sin(i / 3));
    const p = planRecordedSound({ kind: "ambience", description: "rain", duration_seconds: 7, library: [{ id: "r", category: "rain", seconds: 2 }] })!;
    const out = renderRecordedSound(p, { r: src }, 7, sr);
    expect(out.channels[0].length).toBe(7 * sr);
    // Energy everywhere after the first fade (the loop never drops out).
    for (let s = 0.2; s < 6.8; s += 0.1) {
      let e = 0;
      for (let i = Math.floor(s * sr); i < Math.floor((s + 0.1) * sr); i++) e += out.channels[0][i] ** 2;
      expect(e).toBeGreaterThan(1);
    }
    const peak = Math.max(...out.channels[0].map(Math.abs), ...out.channels[1].map(Math.abs));
    expect(peak).toBeCloseTo(Math.pow(10, -3 / 20), 3);
  });
  it("every category has words, Commons searches and a sensible length", () => {
    for (const c of SOUND_CATEGORIES) {
      expect(c.search.length).toBeGreaterThan(0);
      expect(c.max_seconds).toBeGreaterThanOrEqual(4);
      expect(c.words.test(c.label) || c.search.some((s) => c.words.test(s))).toBe(true);
    }
  });
});
