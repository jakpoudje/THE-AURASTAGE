import { describe, expect, it } from "vitest";
import { shotPlanningEngine } from "../engine";
import { coverageMathEngine } from "../../coverageMathEngine/engine";

const T = "11111111-1111-4111-8111-111111111111";
const A = "22222222-2222-4222-8222-222222222222";
const R = "33333333-3333-4333-8333-333333333333";
const L = (n: number) => `4444444${n}-4444-4444-8444-444444444444`;

const base = () => ({
  scene: { number: 1, heading: "EXT. LAGOS HARBOUR - NIGHT", int_ext: "EXT" as const, location: "LAGOS HARBOUR", time_of_day: "NIGHT", duration_seconds: 30 },
  dna: { camera_energy: "measured" as const, mood: ["tense"], lighting_intent: "Sodium streetlight" },
  participants: [
    { character_id: T, name: "Tunde Okafor", presence: "on_screen" as const },
    { character_id: A, name: "Amara Bello", presence: "on_screen" as const },
    { character_id: R, name: "Radio", presence: "voice_only" as const },
  ],
  lines: [
    { id: L(1), character_id: T, speaker: "TUNDE", text: "You came.", estimated_seconds: 1, intensity: 4, listener_ids: [A] },
    { id: L(2), character_id: T, speaker: "TUNDE", text: "I didn't think you would.", estimated_seconds: 2, intensity: 4, listener_ids: [A] },
    { id: L(3), character_id: A, speaker: "AMARA", text: "They know everything.", estimated_seconds: 2, intensity: 9, listener_ids: [T] },
    { id: L(4), character_id: R, speaker: "RADIO", text: "Breaking news.", estimated_seconds: 1, intensity: null, listener_ids: [T, A] },
  ],
});

const coverageOf = (plan: ReturnType<typeof shotPlanningEngine>, input = base()) =>
  coverageMathEngine({
    scene_seconds: plan.scene_seconds,
    shots: plan.shots.map((s, i) => ({ ...s, id: String(i), ordinal: i + 1 })),
    line_ids: input.lines.map((l) => l.id),
    characters: input.participants.filter((p) => p.presence === "on_screen").map((p) => ({ id: p.character_id, name: p.name })),
  });

describe("shotPlanningEngine", () => {
  it("opens with an establishing wide and a master for two on-screen characters", () => {
    const { shots } = shotPlanningEngine(base());
    expect(shots[0]).toMatchObject({ purpose: "establishing", size: "EWS", story_start: 0, lighting: "Sodium streetlight" });
    expect(shots[1]).toMatchObject({ purpose: "master", size: "TWO_SHOT", character_ids: [T, A] });
  });

  it("groups consecutive lines by speaker and frames by intensity, referencing canonical ids", () => {
    const { shots } = shotPlanningEngine(base());
    const dialogue = shots.filter((s) => s.purpose === "dialogue");
    expect(dialogue.map((s) => [s.size, s.dialogue_line_ids.length])).toEqual([
      ["OTS", 2],
      ["CU", 1],
      ["MS", 1],
    ]);
    expect(dialogue[1]).toMatchObject({ movement: "push_in", focus: "shallow", lens_mm: 85, character_ids: [A] });
    expect(dialogue[2].description).toMatch(/RADIO heard off screen/);
    expect(dialogue[2].character_ids).toEqual([T]);
  });

  it("adds a reaction after a high-intensity line", () => {
    const { shots } = shotPlanningEngine(base());
    expect(shots.find((s) => s.purpose === "reaction")).toMatchObject({ size: "CU", character_ids: [T] });
  });

  it("covers leftover story time with an action shot so the plan is complete", () => {
    const plan = shotPlanningEngine(base());
    expect(plan.shots[plan.shots.length - 1]).toMatchObject({ purpose: "action", story_end: 30 });
    const c = coverageOf(plan);
    expect(c.coverage).toBe(1);
    expect(c.ready_for_approval).toBe(true);
  });

  it("plans a silent scene with no dialogue shots", () => {
    const input = { ...base(), lines: [], participants: [base().participants[0]] };
    const plan = shotPlanningEngine(input);
    expect(plan.shots.map((s) => s.purpose)).toEqual(["establishing", "action"]);
    expect(coverageOf(plan, input).coverage).toBe(1);
  });

  it("calm camera energy keeps everything on sticks", () => {
    const plan = shotPlanningEngine({ ...base(), dna: { ...base().dna, camera_energy: "calm" } });
    expect(new Set(plan.shots.map((s) => s.support))).toEqual(new Set(["tripod"]));
  });

  it("is deterministic", () => {
    expect(shotPlanningEngine(base())).toEqual(shotPlanningEngine(base()));
  });
  describe("coverage styles (1.1.0)", () => {
    it("standard is the 1.0.0 plan", () => {
      expect(shotPlanningEngine({ ...base(), style: "standard" }).shots).toEqual(shotPlanningEngine(base()).shots);
    });

    it("simple: no reactions, medium singles, camera on sticks — still fully covered", () => {
      const plan = shotPlanningEngine({ ...base(), style: "simple" });
      expect(plan.shots.some((s) => s.purpose === "reaction")).toBe(false);
      expect(plan.shots.filter((s) => s.purpose === "dialogue" && s.character_ids.length === 1).map((s) => s.size)).toEqual(["MS", "MS", "MS"]);
      expect(new Set(plan.shots.map((s) => s.support))).toEqual(new Set(["tripod"]));
      const c = coverageOf(plan);
      expect(c.coverage).toBe(1);
      expect(c.ready_for_approval).toBe(true);
    });

    it("intimate: one size closer with shallow focus, and reactions from intensity 5", () => {
      const input = base();
      input.lines[0].intensity = 5;
      const plan = shotPlanningEngine({ ...input, style: "intimate" });
      const dialogue = plan.shots.filter((s) => s.purpose === "dialogue");
      expect(dialogue.map((s) => s.size)).toEqual(["CU", "CU", "MS"]); // the off-screen radio line still plays over its listener
      expect(dialogue[0].focus).toBe("shallow");
      expect(plan.shots.filter((s) => s.purpose === "reaction").map((s) => s.character_ids)).toEqual([[A], [T]]);
      expect(plan.shots.find((s) => s.purpose === "reaction")!.rationale).toMatch(/^Intimate coverage: a line at intensity/);
      expect(coverageOf(plan, input).ready_for_approval).toBe(true);
    });

    it("energetic: a moving camera even when the scene is calm, and never calms a frenetic one", () => {
      const calm = shotPlanningEngine({ ...base(), dna: { ...base().dna, camera_energy: "calm" }, style: "energetic" });
      expect(calm.shots[0]).toMatchObject({ movement: "tracking", support: "gimbal" });
      expect(calm.shots.every((s) => s.support !== "tripod" || s.purpose === "reaction")).toBe(true);
      const wild = shotPlanningEngine({ ...base(), dna: { ...base().dna, camera_energy: "frenetic" }, style: "energetic" });
      expect(wild.shots[0].support).toBe("handheld");
    });

    it("an unknown style is refused", () => {
      expect(() => shotPlanningEngine({ ...base(), style: "wild" })).toThrow();
    });
  });
});
