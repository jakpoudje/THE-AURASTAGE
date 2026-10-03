import { describe, expect, it } from "vitest";
import { isNotPerson, matchScriptCast } from "../engine";

// The owner's film, as the Scriptwriter showed it on 2026-10-03 (regression: most of these were flagged as mismatches).
const story = ["Peter Nwosu", "Nnamdi Wabara", "Zara Danjuma", "Sule Adamu", "Alliance Democratic Congress", "Rabi Musa", "Middle Belt", "Bayo Adekunle",
  "Professor Idris Bello", "Tomiwa Oyelaran", "Hauwa Lawal", "Grace Choji", "Chiamaka Nwosu", "Ejike Okafor", "Lanre Bakare", "Yakubu Sanda"].map((name) => ({ name }));
const cue = (name: string, lines = 3) => ({ name, lines, scenes: 1 });
const cues = ["NWOSU", "EJIKE", "ADAMU", "ZARA", "WABARA", "ADEKUNLE", "HAUWA", "RABI", "GRACE", "BELLO", "CHIAMAKA", "YAKUBU", "NGOZI", "PRESIDING OFFICER",
  "LANRE", "AIDE", "EMISSARY", "IBIFURO", "YOUNG MAN", "REPORTER 3", "SLICK AIDE", "TOMIWA", "HON. TAFIDA", "GOVERNING PARTY AGENT", "OPPOSITION AGENT #1",
  "ADC AGENT", "MC", "ALL", "VOICES", "WOMEN'S LEADER", "NORTH-CENTRAL LEADER", "SENATOR HALIMA GARBA", "BROTHER EMEKA", "MAMA TOLU", "AGENT IN CAP"].map((n) => cue(n));
const by = (r: ReturnType<typeof matchScriptCast>, n: string) => r.cues.find((c) => c.name === n)!;

describe("scriptCastMatchEngine", () => {
  const r = matchScriptCast(cues, story);
  it("matches surnames, first names and full names to the story — the surname only when one story person has it unclaimed", () => {
    expect(by(r, "NWOSU")).toMatchObject({ kind: "story", story_name: "Peter Nwosu", how: "surname" });
    expect(by(r, "CHIAMAKA")).toMatchObject({ kind: "story", story_name: "Chiamaka Nwosu", how: "first" });
    expect(by(r, "ADAMU").story_name).toBe("Sule Adamu");
    expect(by(r, "WABARA").story_name).toBe("Nnamdi Wabara");
    expect(by(r, "ADEKUNLE").story_name).toBe("Bayo Adekunle");
    expect(by(r, "BELLO").story_name).toBe("Professor Idris Bello");
    expect(by(r, "EJIKE").story_name).toBe("Ejike Okafor");
    // Every story person speaks; the party and the region are not people.
    expect(r.silent).toEqual([]);
    expect(r.not_people).toEqual(["Alliance Democratic Congress", "Middle Belt"]);
  });
  it("roles are walk-on parts and ALL/VOICES are group lines — not mismatches; named people missing from the story stay flagged", () => {
    for (const n of ["PRESIDING OFFICER", "AIDE", "EMISSARY", "YOUNG MAN", "REPORTER 3", "SLICK AIDE", "GOVERNING PARTY AGENT", "OPPOSITION AGENT #1", "ADC AGENT", "MC", "WOMEN'S LEADER", "NORTH-CENTRAL LEADER", "AGENT IN CAP"])
      expect(by(r, n).kind, n).toBe("walk_on");
    expect(by(r, "ALL").kind).toBe("group");
    expect(by(r, "VOICES").kind).toBe("group");
    for (const n of ["NGOZI", "IBIFURO", "HON. TAFIDA", "SENATOR HALIMA GARBA", "BROTHER EMEKA", "MAMA TOLU"]) expect(by(r, n).kind, n).toBe("named");
  });
  it("a shared surname with two unclaimed story people is never guessed; titles are ignored on both sides", () => {
    const two = matchScriptCast([cue("NWOSU")], [{ name: "Peter Nwosu" }, { name: "Chiamaka Nwosu" }]);
    expect(two.cues[0].kind).toBe("named");
    expect(two.silent).toEqual(["Peter Nwosu", "Chiamaka Nwosu"]);
    const t = matchScriptCast([cue("PROFESSOR BELLO"), cue("DR. AMINA")], [{ name: "Professor Idris Bello" }, { name: "Amina Yusuf" }]);
    expect(t.cues.map((c) => c.story_name)).toEqual(["Professor Idris Bello", "Amina Yusuf"]);
    expect(isNotPerson("People's Democratic Party")).toBe(true);
    expect(isNotPerson("Grace Choji")).toBe(false);
  });
});
