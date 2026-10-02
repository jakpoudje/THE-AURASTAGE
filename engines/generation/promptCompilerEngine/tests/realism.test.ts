// promptCompilerEngine 2.0.0 (realism R1, owner request 2026-10-01): every field that changes what is seen reaches the
// shot (PROMPT_FIELD_MAP.md), the video prompt is timed and lip-synced in the character's accent, and every provider
// gets a prompt inside its limit without losing who is in frame or what they do.
import { describe, expect, it } from "vitest";
import { promptCompilerEngine } from "../engine";
import { composePrompt, shorten } from "../compose";

const T = "11111111-1111-4111-8111-111111111111", A = "22222222-2222-4222-8222-222222222222", SH = "33333333-3333-4333-8333-333333333333";
const L1 = "44444444-4444-4444-8444-444444444444", PV = "55555555-5555-4555-8555-555555555555", DV = "66666666-6666-4666-8666-666666666666";
const full = (over: Record<string, any> = {}) => ({
  project: { title: "Shadows of Lagos", genre: "Thriller", subgenre: "Political", tone: "Tense", setting: "Lagos, Nigeria", time_period: "Present day", look: "Desaturated teal-and-amber" },
  scene: {
    number: 2, heading: "EXT. LAGOS HARBOUR - NIGHT", location: "LAGOS HARBOUR", int_ext: "EXT", time_of_day: "NIGHT",
    purpose: "Tunde commits", mood: ["tense"], weather: "light rain", atmosphere: "diesel haze", lighting_intent: "Sodium streetlight",
    stakes: "If they are seen, the source dies", story_time: "Three days later", continuity_notes: "Tunde's left hand is bandaged", area: "jetty",
  },
  shot: {
    id: SH, size: "CU", angle: "low", movement: "push_in", focus: "shallow", lens_mm: 85, duration_seconds: 1.5, support: "dolly", transition_in: "cut",
    description: "Amara turns to Tunde.", composition: "Amara right third", lighting: null, character_ids: [A], dialogue_line_ids: [L1],
  },
  characters: [
    { id: T, name: "Tunde Okafor", age: "35", gender: "Man", description: "Investigative journalist", wardrobe: null },
    { id: A, name: "Amara Bello", age: "32", gender: "Woman", nationality: "Nigerian", accent: "Nigerian English (Yoruba)", description: "Activist, close-cropped hair", wardrobe: "Rain gear: yellow oilskin",
      physicality: "Stands very still; touches her collar when afraid", personality: "Guarded and precise. Fierce when cornered." },
  ],
  dialogue: [{ id: L1, speaker: "AMARA", character_id: A, text: "They know everything.", emotion: "fear", intensity: 9, intention: "to warn", subtext: "we are already caught", parenthetical: "(whispering)", estimated_seconds: 1.2 }],
  script_action: ["Amara freezes as a torch beam sweeps the jetty."],
  continuity: { screen: { [A]: "right", [T]: "left" }, previous: "Wide two-shot on the jetty", next: "Tunde reacts" },
  props: [{ id: "77777777-7777-4777-8777-777777777777", name: "Torch", description: "", category: "prop", revision: 1, state: null, descriptors: ["battered", "yellow"] }],
  aspect_ratio: "16:9" as const,
  provenance: { shot_plan_version_id: PV, scene_dna_version_id: DV, script_version_id: null },
  ...over,
});

describe("promptCompilerEngine 2.0.0 — every field reaches the shot", () => {
  it("the video prompt is a timed shot with lip-synced dialogue in the character's accent, how they move, screen direction and the neighbouring shots", () => {
    const p = promptCompilerEngine(full()).package;
    const v = p.video_prompt!;
    expect(v).toMatch(/^1\.5-second cinematic video shot, close-up, low angle, slow push-in, 85mm lens, shallow depth of field, on a dolly\./);
    expect(v).toContain("Action over 1.5 s: Amara turns to Tunde.");
    expect(v).toContain('AMARA (whispering) says "They know everything." (fear, intensity 9/10, to warn), meaning underneath: we are already caught, Nigerian English (Yoruba) accent, about 1.2 s; lips, jaw and face move naturally in sync with every word.');
    expect(v).toContain("How they move: Amara Bello: Stands very still; touches her collar when afraid; manner Guarded and precise.");
    expect(v).toContain("Screen direction: Amara Bello frame right (eyeline toward frame left).");
    expect(v).toContain("From the script: Amara freezes as a torch beam sweeps the jetty.");
    expect(v).toContain("Exterior: LAGOS HARBOUR (jetty), night.");
    expect(v).toContain("Props in the scene: Torch (battered, yellow).");
    expect(v).toContain("Continuity: Tunde's left hand is bandaged. Story time: Three days later.");
    expect(v).toContain("After: Wide two-shot on the jetty. Before: Tunde reacts.");
    expect(v).toContain("Stakes: If they are seen, the source dies.");
    expect(v).toContain("Style: Thriller, Political, Tense; Lagos, Nigeria, Present day.");
    expect(v).toContain("In frame: Amara Bello (woman, 32) [Nigerian] — Activist, close-cropped hair wearing Rain gear: yellow oilskin.");
  });
  it("the still keeps the face mid-line without the words, with physicality; checks report what is missing", () => {
    const p = promptCompilerEngine(full()).package;
    expect(p.prompt).toMatch(/^Cinematic film still, close-up/);
    expect(p.prompt).toContain("Performance: AMARA (fear, 9/10) mid-line, speaking.");
    expect(p.prompt).not.toContain("They know everything");
    expect(p.prompt).toContain("Physicality: Amara Bello: Stands very still; touches her collar when afraid.");
    const c = Object.fromEntries(p.checks.map((x) => [x.id, x]));
    expect(c.physicality.ok).toBe(true);
    expect(c.accent).toMatchObject({ ok: true, evidence: "AMARA: Nigerian English (Yoruba)" });
    expect(c.script.ok).toBe(true);
    const bare = promptCompilerEngine(full({ characters: [{ id: A, name: "Amara Bello", age: "32", description: "Activist", wardrobe: null }], script_action: [] })).package;
    const b = Object.fromEntries(bare.checks.map((x) => [x.id, x]));
    expect(b.physicality).toMatchObject({ ok: false, evidence: "No physicality & mannerisms in Casting: Amara Bello" });
    expect(b.accent).toMatchObject({ ok: false, evidence: "AMARA: no accent in Casting" });
    expect(b.script.ok).toBe(false);
  });
  it("every provider gets a prompt inside its limit; identity, action and dialogue survive, the lowest ranks go first", () => {
    const p = promptCompilerEngine(full()).package;
    const full_v = composePrompt(p.blocks as any, "video");
    for (const max of [1000, 2000, 2500]) {
      const c = composePrompt(p.blocks as any, "video", max);
      expect(c.chars).toBeLessThanOrEqual(max);
      expect(c.text).toContain("Action over 1.5 s");
      expect(c.text).toContain("Amara Bello");
      expect(c.text).toContain('"They know everything."');
      expect(c.text).toContain("Aspect ratio 16:9.");
    }
    const tight = composePrompt(p.blocks as any, "video", 1000);
    expect(full_v.chars).toBeGreaterThan(1000);
    expect(tight.dropped.concat(tight.shortened)).toContain("purpose");
    expect(tight.kept).toContain("header");
  });
  it("shorten() cuts at a sentence or word, never mid-word", () => {
    expect(shorten("One two. Three four five six.", 12)).toBe("One two.");
    expect(shorten("Alpha beta gamma delta", 15)).toBe("Alpha beta…");
  });
  it("a silent scene says no one speaks; a dissolve opens the shot", () => {
    const p = promptCompilerEngine(full({ scene: { ...full().scene, silent: true }, shot: { ...full().shot, dialogue_line_ids: [], transition_in: "dissolve" } })).package;
    expect(p.video_prompt).toContain("No one speaks in this shot.");
    expect(p.video_prompt).toMatch(/on a dolly\. Opens with a dissolve\./);
  });
});
