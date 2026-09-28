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
    expect(p.provenance).toEqual({ shot_id: SH, shot_plan_version_id: PV, scene_dna_version_id: DV, script_version_id: null, character_ids: [A], dialogue_line_ids: [L1], settings_version: null });
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
    expect(engine_version).toBe("1.1.0");
    expect(p.prompt).toContain("Look: Desaturated teal-and-amber, handheld.");
    expect(p.provenance.settings_version).toBe(3);
    expect(p.checks.find((c) => c.id === "style")).toMatchObject({ ok: true, evidence: expect.stringContaining("settings v3") });
    expect(promptCompilerEngine(base()).package.checks.find((c) => c.id === "style")).toMatchObject({ ok: false });
  });
});
