import { describe, expect, it } from "vitest";
import { promptCompilerEngine } from "../engine";

const T = "11111111-1111-4111-8111-111111111111";
const A = "22222222-2222-4222-8222-222222222222";
const SH = "33333333-3333-4333-8333-333333333333";
const L1 = "44444444-4444-4444-8444-444444444444";
const PV = "55555555-5555-4555-8555-555555555555";
const DV = "66666666-6666-4666-8666-666666666666";

const base = () => ({
  project: { title: "Shadows of Lagos", genre: "Thriller", tone: "Tense", setting: "Lagos, Nigeria", time_period: "Present day" },
  scene: {
    number: 2, heading: "EXT. LAGOS HARBOUR - NIGHT", location: "LAGOS HARBOUR", int_ext: "EXT", time_of_day: "NIGHT",
    purpose: "Tunde commits", mood: ["tense", "wet"], weather: "rain", atmosphere: "dark", lighting_intent: "Sodium streetlight",
  },
  shot: {
    id: SH, size: "CU", angle: "low", movement: "push_in", focus: "shallow", lens_mm: 85, duration_seconds: 3,
    description: "Amara turns to Tunde.", composition: "Amara right third", lighting: null, character_ids: [A], dialogue_line_ids: [L1],
  },
  characters: [
    { id: T, name: "Tunde Okafor", age: "35", description: "Investigative journalist", wardrobe: "Field outfit: khaki jacket" },
    { id: A, name: "Amara Bello", age: "32", description: "Activist", wardrobe: null },
  ],
  dialogue: [{ id: L1, speaker: "AMARA", text: "They know everything.", emotion: "fear" }],
  aspect_ratio: "16:9" as const,
  provenance: { shot_plan_version_id: PV, scene_dna_version_id: DV, script_version_id: null },
});

describe("promptCompilerEngine", () => {
  it("assembles a provider-neutral prompt from camera, subject, place, light and mood", () => {
    const { package: p } = promptCompilerEngine(base());
    expect(p.prompt).toContain("Cinematic film still, close-up, low angle, slow push-in, 85mm lens, shallow depth of field.");
    expect(p.prompt).toContain("In frame: Amara Bello (32) — Activist.");
    expect(p.prompt).toContain("Exterior: LAGOS HARBOUR, night.");
    expect(p.prompt).toContain("Lighting: Sodium streetlight.");
    expect(p.prompt).toContain('AMARA (fear) says "They know everything."');
    expect(p.prompt).toContain("Style: Thriller, Tense; Lagos, Nigeria, Present day.");
  });

  it("only includes characters in frame and records exact provenance", () => {
    const { package: p } = promptCompilerEngine(base());
    expect(p.characters.map((c) => c.name)).toEqual(["Amara Bello"]);
    expect(p.provenance).toEqual({ shot_id: SH, shot_plan_version_id: PV, scene_dna_version_id: DV, script_version_id: null, character_ids: [A], dialogue_line_ids: [L1], settings_version: null, world_revisions: {} });
    expect(p.negative).toContain("no people other than Amara Bello");
  });

  it("reports honest checks: missing wardrobe is shown, not hidden", () => {
    const { package: p } = promptCompilerEngine(base());
    expect(p.checks.find((c) => c.id === "wardrobe")).toMatchObject({ ok: false, evidence: "No look chosen in Scene DNA: Amara Bello" });
    expect(p.checks.find((c) => c.id === "lighting")).toMatchObject({ ok: true });
  });

  it("empty frames ask for no people", () => {
    const input = base();
    input.shot.character_ids = [];
    const { package: p } = promptCompilerEngine(input);
    expect(p.negative).toContain("no people");
    expect(p.checks.find((c) => c.id === "characters")!.evidence).toBe("Nobody in frame");
  });

  it("is deterministic", () => {
    expect(promptCompilerEngine(base())).toEqual(promptCompilerEngine(base()));
  });

  it("applies the Project Settings look and records its settings version (1.1.0)", () => {
    const withLook = { ...base(), project: { ...base().project, look: "Desaturated teal-and-amber, handheld" }, provenance: { ...base().provenance, settings_version: 3 } };
    const { package: p, engine_version } = promptCompilerEngine(withLook);
    expect(engine_version).toBe("1.5.0");
    expect(p.prompt).toContain("Look: Desaturated teal-and-amber, handheld.");
    expect(p.provenance.settings_version).toBe(3);
    expect(p.checks.find((c) => c.id === "style")).toMatchObject({ ok: true, evidence: expect.stringContaining("settings v3") });
    expect(promptCompilerEngine(base()).package.checks.find((c) => c.id === "style")).toMatchObject({ ok: false });
  });
  it("1.2.0: uses the scene's canonical location and props from Locations & Props, and only the reference images that belong to the shot", () => {
    const LOC = "77777777-7777-4777-8777-777777777777", PR = "88888888-8888-4888-8888-888888888888", OTHER = "99999999-9999-4999-8999-999999999999";
    const AS = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, "0")}`;
    const { package: p } = promptCompilerEngine({
      ...base(),
      location: { id: LOC, name: "Lagos Harbour", description: "Rusted cranes, oily black water, a single sodium lamp", revision: 3 },
      props: [{ id: PR, name: "Brass key", description: "Old, green with age", category: "prop", revision: 2 }],
      references: [
        { kind: "character", object_id: A, name: "Amara Bello", view: "front · MS", asset_id: AS(1) },
        { kind: "character", object_id: T, name: "Tunde Okafor", view: "front · MS", asset_id: AS(2) }, // not in frame
        { kind: "location", object_id: LOC, name: "Lagos Harbour", view: "wide · NIGHT", asset_id: AS(3) },
        { kind: "prop", object_id: OTHER, name: "Other prop", view: "hero", asset_id: AS(4) }, // not in this scene
      ],
    });
    expect(p.prompt).toContain("Exterior: Lagos Harbour, night — Rusted cranes, oily black water, a single sodium lamp.");
    expect(p.prompt).toContain("Props in the scene: Brass key (Old, green with age).");
    expect(p.references!.map((r) => r.name)).toEqual(["Amara Bello", "Lagos Harbour"]);
    expect(p.world!.location!.revision).toBe(3);
    expect(p.provenance.world_revisions).toEqual({ [LOC]: 3, [PR]: 2 });
    const c = Object.fromEntries(p.checks.map((x) => [x.id, x]));
    expect(c.location_described.ok).toBe(true);
    expect(c.references).toMatchObject({ ok: true, evidence: "Amara Bello · front · MS, Lagos Harbour · wide · NIGHT" });
  });
  it("1.5.0: a prop's state in this scene (continuity) is in the prompt", () => {
    const PR = "88888888-8888-4888-8888-888888888888";
    const { package: p } = promptCompilerEngine({ ...base(), props: [{ id: PR, name: "Laptop", description: "Silver, stickered", category: "prop", revision: 1, state: "broken" }] });
    expect(p.prompt).toContain("Props in the scene: Laptop (Silver, stickered) — broken.");
  });
  it("1.2.0: without Locations & Props records it still compiles and says what's missing", () => {
    const { package: p } = promptCompilerEngine(base());
    expect(p.prompt).toContain("Exterior: LAGOS HARBOUR, night.");
    const c = Object.fromEntries(p.checks.map((x) => [x.id, x]));
    expect(c.location_described).toMatchObject({ ok: false });
    expect(c.references).toMatchObject({ ok: false });
  });
  it("1.3.0: a character shown at another age in this scene is described at that age, and its references are checked", () => {
    const ST = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const young = (b: ReturnType<typeof base>) => ({
      ...b, characters: b.characters.map((c) => (c.id === A ? { ...c, age: "10", age_state: { id: ST, label: "Flashback, 1995", description: "Braided hair" } } : c)),
    });
    const { package: p } = promptCompilerEngine(young(base()));
    expect(p.prompt).toContain("In frame: Amara Bello (aged 10, Flashback, 1995: Braided hair) — Activist.");
    expect(p.characters[0]).toMatchObject({ age: "10", age_state: { id: ST, label: "Flashback, 1995" } });
    const c = Object.fromEntries(p.checks.map((x) => [x.id, x]));
    expect(c.age).toMatchObject({ ok: false, evidence: expect.stringContaining("No reference views at this age yet: Amara Bello (Flashback, 1995)") });
    const withRef = promptCompilerEngine({ ...young(base()), references: [{ kind: "character", object_id: A, name: "Amara Bello", view: "front · MS", asset_id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001" }] });
    expect(Object.fromEntries(withRef.package.checks.map((x) => [x.id, x])).age).toMatchObject({ ok: true, evidence: "Amara Bello: Flashback, 1995 (10)" });
    // No age states: no age check, prompt as before.
    expect(promptCompilerEngine(base()).package.checks.some((x) => x.id === "age")).toBe(false);
  });
  it("1.4.0: the gender written in Casting is in the prompt and the package (no gender, no word)", () => {
    const b = base();
    const { package: p } = promptCompilerEngine({ ...b, characters: b.characters.map((c) => (c.id === A ? { ...c, gender: "Woman" } : c)) });
    expect(p.prompt).toContain("In frame: Amara Bello (woman, 32) — Activist.");
    expect(p.characters[0].gender).toBe("Woman");
    expect(promptCompilerEngine(base()).package.characters[0].gender).toBeUndefined();
  });
});
