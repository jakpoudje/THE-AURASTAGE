import { describe, expect, it } from "vitest";
import { voiceCastingEngine } from "../engine";

const amara = { name: "Amara Bello", age: "32", gender: "Woman", nationality: "Nigerian", personality: "Calm, deliberate" };
const tunde = { name: "Tunde Okafor", age: "35", gender: "Man", nationality: "Nigerian" };

describe("voiceCastingEngine (Voice DNA)", () => {
  it("gives each character a stable voice from their profile, and says why", () => {
    const a = voiceCastingEngine({ character: amara }), t = voiceCastingEngine({ character: tunde });
    expect(a).toMatchObject({ gender: "female", age_band: "adult", language: "en-gb" });
    expect(["f1", "f3", "f5"]).toContain(a.variant);
    expect(["m2", "m4", "m5", "m6"]).toContain(t.variant);
    expect(a.pitch).toBeGreaterThan(t.pitch);
    expect(a.speed).toBeLessThan(voiceCastingEngine({ character: { ...amara, personality: "" } }).speed); // calm → slower
    expect(voiceCastingEngine({ character: amara })).toEqual(a); // stable
    expect(a.why.join(" | ")).toMatch(/Female \(profile\) \| Age 32 → adult voice \| Nigerian → British English \(the built-in voice has no Nigerian accent/);
  });
  it("adjusts delivery per line from its emotion and intensity", () => {
    const base = voiceCastingEngine({ character: tunde });
    const angry = voiceCastingEngine({ character: tunde, line: { emotion: "anger", intensity: 10 } });
    const sad = voiceCastingEngine({ character: tunde, line: { emotion: "sadness", intensity: 5 } });
    expect(angry.speed).toBeGreaterThan(base.speed);
    expect(angry.amplitude).toBeGreaterThan(base.amplitude);
    expect(sad.speed).toBeLessThan(base.speed);
    expect(angry.description).toMatch(/sharper and louder for anger \(intensity 10\/10\)\.$/);
  });
  it("doesn't pretend to know what isn't in the profile", () => {
    const r = voiceCastingEngine({ character: { name: "Ramos" } });
    expect(r.gender).toBe("unspecified");
    expect(r.why[0]).toMatch(/No gender in the profile/);
    expect(voiceCastingEngine({ character: { name: "Old Man", age: "80", gender: "male" } }).age_band).toBe("elder");
  });
  it("regression: a plain profile's variation stays within ±10 wpm and ±6 pitch for every name (unsigned hash)", () => {
    for (const name of ["Tunde Okafor", "a", "b", "c", "d", "e", "Amara Bello", "Det. Ramos", "Chief Adeyemi", "x".repeat(40)]) {
      const r = voiceCastingEngine({ character: { name, gender: "male", age: "40" } });
      expect(r.speed).toBeGreaterThanOrEqual(155);
      expect(r.speed).toBeLessThanOrEqual(175);
      expect(r.pitch).toBeGreaterThanOrEqual(32);
      expect(r.pitch).toBeLessThanOrEqual(44);
    }
  });
});
