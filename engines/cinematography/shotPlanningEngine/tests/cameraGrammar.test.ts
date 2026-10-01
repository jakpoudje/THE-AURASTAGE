import { describe, expect, it } from "vitest";
import { shotPlanningEngine } from "../engine";
import { genreFamily, sceneKind } from "../cameraGrammar";

const T = "11111111-1111-4111-8111-111111111111";
const A = "22222222-2222-4222-8222-222222222222";
const L = (n: number) => `4444444${n}-4444-4444-8444-444444444444`;
const scene = (over: Record<string, unknown> = {}, text = ["You came.", "They know everything."]) => ({
  scene: { number: 1, heading: "INT. FLAT - NIGHT", int_ext: "INT" as const, location: "FLAT", time_of_day: "NIGHT", duration_seconds: 20 },
  dna: { camera_energy: "measured" as const, mood: [] as string[], lighting_intent: null },
  participants: [{ character_id: T, name: "Tunde", presence: "on_screen" as const }, { character_id: A, name: "Amara", presence: "on_screen" as const }],
  lines: text.map((t, i) => ({ id: L(i + 1), character_id: i % 2 ? A : T, speaker: i % 2 ? "AMARA" : "TUNDE", text: t, estimated_seconds: 2, intensity: i % 2 ? 9 : 4, listener_ids: [i % 2 ? T : A] })),
  ...over,
});

describe("camera intelligence by genre and scene (1.3.0, owner request 2026-10-01)", () => {
  it("reads the genre family from the project's genre text, and the kind of moment from mood and dialogue", () => {
    expect(genreFamily("Political thriller")).toBe("thriller");
    expect(genreFamily("Romantic comedy")).toBe("romance");
    expect(genreFamily("Supernatural horror")).toBe("horror");
    expect(genreFamily(null)).toBe("drama");
    expect(sceneKind({ mood: [], text: ["They chase him through the market"] })).toMatchObject({ kind: "chase", cue: "chase" });
    expect(sceneKind({ mood: ["grief"], text: [] }).kind).toBe("grief");
    expect(sceneKind({ mood: [], text: ["Pass the salt."] }).kind).toBe("talk");
  });
  it("a drama talk scene is planned exactly as before (no camera grammar to apply)", () => {
    const plan = shotPlanningEngine(scene());
    expect(plan.camera).toMatchObject({ genre_family: "drama", scene_kind: "talk", decisions: [] });
    expect(plan.shots.every((s) => !s.rationale.includes("Camera —"))).toBe(true);
  });
  it("the same scene is filmed differently as a thriller and as a romance, and says why", () => {
    const thriller = shotPlanningEngine(scene({ genre: "Political thriller" }));
    const romance = shotPlanningEngine(scene({ genre: "Romance" }));
    const peakT = thriller.shots.find((s) => s.purpose === "dialogue" && s.dialogue_line_ids.includes(L(2)))!;
    const peakR = romance.shots.find((s) => s.purpose === "dialogue" && s.dialogue_line_ids.includes(L(2)))!;
    expect(peakT.angle).toBe("dutch"); // intensity 9 in a thriller
    expect(peakT.rationale).toMatch(/Camera — low angle on the speaker at the height of the threat/);
    expect(peakR.angle).toBe("eye");
    expect(peakR.focus).toBe("shallow");
    expect(peakR.lens_mm).toBeGreaterThanOrEqual(85);
    expect(romance.shots.find((s) => s.purpose === "master")!.movement).toBe("arc");
    expect(thriller.shots.find((s) => s.purpose === "reaction")!.angle).toBe("high");
  });
  it("a chase runs with the characters; coverage (lines and story time) is unchanged by the grammar", () => {
    const calm = shotPlanningEngine(scene({}, ["Wait.", "Run!"]));
    const chase = shotPlanningEngine(scene({ dna: { camera_energy: "measured", mood: [], lighting_intent: null, purpose: "Tunde chases Amara through the market" } }, ["Wait.", "Run!"]));
    expect(chase.camera.scene_kind).toBe("chase");
    expect(chase.shots.filter((s) => s.purpose === "dialogue").every((s) => s.movement === "handheld")).toBe(true);
    expect(chase.shots.map((s) => [s.purpose, s.story_start, s.story_end, s.dialogue_line_ids])).toEqual(calm.shots.map((s) => [s.purpose, s.story_start, s.story_end, s.dialogue_line_ids]));
  });
  it("a person's own choice wins: calm camera energy keeps a chase on sticks (only angle, lens and focus change)", () => {
    const plan = shotPlanningEngine(scene({ genre: "Action", dna: { camera_energy: "calm", mood: [], lighting_intent: null, purpose: "a chase" } }));
    expect(plan.shots.every((s) => s.movement === "static" || s.movement === "push_in")).toBe(true);
    expect(plan.shots.filter((s) => s.purpose === "dialogue").some((s) => s.rationale.includes("wider lens"))).toBe(true);
  });
  it("an epic exterior opens from the air", () => {
    const plan = shotPlanningEngine(scene({ genre: "Historical epic", scene: { number: 1, heading: "EXT. KANO WALLS - DAWN", int_ext: "EXT", location: "KANO WALLS", time_of_day: "DAWN", duration_seconds: 20 } }));
    expect(plan.shots[0]).toMatchObject({ purpose: "establishing", movement: "drone", angle: "aerial", size: "EWS" });
  });
});
