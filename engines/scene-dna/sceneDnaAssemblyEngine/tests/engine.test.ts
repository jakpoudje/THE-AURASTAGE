import { describe, expect, it } from "vitest";
import { sceneDnaAssemblyEngine } from "../engine";

const T = "11111111-1111-4111-8111-111111111111";
const A = "22222222-2222-4222-8222-222222222222";
const R = "33333333-3333-4333-8333-333333333333";
const LOOK = "44444444-4444-4444-8444-444444444444";
const L1 = "55555555-5555-4555-8555-555555555555";
const L2 = "66666666-6666-4666-8666-666666666666";
const S = "77777777-7777-4777-8777-777777777777";

const base = () => ({
  scene: { id: S, number: 2, heading: "EXT. LAGOS HARBOUR - NIGHT", int_ext: "EXT" as const, location: "LAGOS HARBOUR", time_of_day: "NIGHT", estimated_seconds: 95, status: "active" as const },
  action: [
    { line: 10, text: "Rain lashes the harbour. Waves slap the jetty." },
    { line: 14, text: "A car engine idles in the dark. Footsteps approach." },
  ],
  participants: [
    { character_id: T, name: "Tunde Okafor", kind: "individual" as const, status: "approved" as const, voice_only: false, speaking: true, line_count: 2 },
    { character_id: A, name: "Amara Bello", kind: "individual" as const, status: "draft" as const, voice_only: false, speaking: true, line_count: 1 },
    { character_id: R, name: "Radio", kind: "individual" as const, status: "draft" as const, voice_only: true, speaking: true, line_count: 1 },
  ],
  dialogue: [
    { id: L1, speaker: "TUNDE", character_id: T, emotion: "tension", intensity: 7, approval: "approved" as const, review_state: "current" as const },
    { id: L2, speaker: "AMARA", character_id: A, emotion: "fear", intensity: 9, approval: "approved" as const, review_state: "current" as const },
  ],
  adjacent: {
    previous: { number: 1, heading: "INT. NEWSROOM - DAY", location: "NEWSROOM", time_of_day: "DAY", int_ext: "INT" as const },
    next: { number: 3, heading: "EXT. LAGOS HARBOUR - CONTINUOUS", location: "LAGOS HARBOUR", time_of_day: "CONTINUOUS", int_ext: "EXT" as const },
  },
  wardrobe_available: [{ id: LOOK, character_id: T, name: "Field outfit" }],
  editable: { wardrobe: { [T]: LOOK }, purpose: "Tunde commits to the story." },
});

describe("sceneDnaAssemblyEngine", () => {
  it("resolves participants (on-screen first) with chosen wardrobe", () => {
    const { proposal } = sceneDnaAssemblyEngine(base());
    expect(proposal.participants.map((p) => [p.name, p.presence, p.wardrobe_look_name])).toEqual([
      ["Tunde Okafor", "on_screen", "Field outfit"],
      ["Amara Bello", "on_screen", null],
      ["Radio", "voice_only", null],
    ]);
  });

  it("summarises dialogue from the annotated lines only", () => {
    const { proposal } = sceneDnaAssemblyEngine(base());
    expect(proposal.dialogue).toMatchObject({ total: 2, approved: 2, needs_review: 0, peak_intensity: 9, silent: false });
    expect(proposal.dialogue.emotions).toEqual([{ emotion: "fear", count: 1 }, { emotion: "tension", count: 1 }]);
  });

  it("detects weather, atmosphere and sound cues with the exact source line", () => {
    const { proposal } = sceneDnaAssemblyEngine(base());
    expect(proposal.environment.weather).toEqual([{ value: "rain", line: 10, text: "Rain lashes the harbour. Waves slap the jetty." }]);
    expect(proposal.environment.atmosphere.map((a) => a.value)).toEqual(["dark"]);
    expect(proposal.sound_candidates.map((s) => [s.cue, s.line])).toEqual([
      ["Rain ambience", 10],
      ["Water lapping", 10],
      ["Footsteps", 14],
      ["Car engine", 14],
    ]);
  });

  it("writes continuity notes from adjacent scenes", () => {
    const { proposal } = sceneDnaAssemblyEngine(base());
    expect(proposal.continuity.notes).toEqual(["Time changes from DAY (scene 1) to NIGHT.", "Scene 3 continues directly from this one."]);
  });

  it("is ready when blocking predicates pass, with warnings listed as evidence", () => {
    const { proposal } = sceneDnaAssemblyEngine(base());
    expect(proposal.ready_for_approval).toBe(true);
    const byId = Object.fromEntries(proposal.readiness.map((r) => [r.id, r]));
    expect(byId.characters_approved).toMatchObject({ ok: false, blocking: false, evidence: "Still draft: Amara Bello" });
    expect(byId.wardrobe_assigned).toMatchObject({ ok: false, evidence: "No look chosen: Amara Bello" });
  });

  it("blocks approval on unapproved dialogue or unresolved speakers", () => {
    const i = base();
    i.dialogue[1] = { ...i.dialogue[1], approval: "draft" as never, review_state: "review_required" as never };
    i.dialogue.push({ id: "88888888-8888-4888-8888-888888888888", speaker: "GUARD", character_id: null, emotion: null, intensity: null, approval: "draft" as never, review_state: "current" as never });
    const { proposal } = sceneDnaAssemblyEngine(i);
    expect(proposal.ready_for_approval).toBe(false);
    const byId = Object.fromEntries(proposal.readiness.map((r) => [r.id, r]));
    expect(byId.dialogue_approved.evidence).toBe("1 of 3 lines approved, 1 need review");
    expect(byId.speakers_resolved.evidence).toBe("Not in Casting: GUARD");
  });

  it("treats a scene with no dialogue as silent, not as missing work", () => {
    const i = base();
    i.dialogue = [];
    const { proposal } = sceneDnaAssemblyEngine(i);
    expect(proposal.dialogue.silent).toBe(true);
    expect(proposal.readiness.find((r) => r.id === "dialogue_approved")).toMatchObject({ ok: true, label: "Silent scene (no dialogue expected)" });
  });

  it("never lets a look belonging to another character be applied", () => {
    const i = base();
    i.editable.wardrobe = { [A]: LOOK };
    const { proposal } = sceneDnaAssemblyEngine(i);
    expect(proposal.participants.find((p) => p.character_id === A)!.wardrobe_look_id).toBeNull();
  });
});
