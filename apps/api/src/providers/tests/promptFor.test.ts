// Realism R1: each provider receives the package composed to its own limit — video models get the timed, lip-synced
// video prompt; Runway's 1,000 characters keep who is in frame, what they do and what they say.
import { describe, expect, it } from "vitest";
import { promptCompilerEngine } from "@aurastage/engines";
import { framedPrompt, promptFor } from "../promptFor";
import { runwayPrompt } from "../video/runway/runwayAdapter";

const A = "22222222-2222-4222-8222-222222222222", L1 = "44444444-4444-4444-8444-444444444444";
const pkg = promptCompilerEngine({
  project: { title: "T", genre: "Thriller", tone: "Tense", setting: "Lagos, Nigeria", time_period: "Present day", look: "Desaturated teal-and-amber with deep shadows and a fine film grain throughout" },
  scene: { number: 2, heading: "EXT. LAGOS HARBOUR - NIGHT", location: "LAGOS HARBOUR", int_ext: "EXT", time_of_day: "NIGHT", purpose: "Tunde commits to publishing whatever it costs him", mood: ["tense", "wet", "watchful"],
    weather: "steady light rain that beads on every surface", atmosphere: "diesel haze hanging over black water", lighting_intent: "Sodium streetlight from above, deep shadows",
    stakes: "If they are seen, the source dies tonight", story_time: "Three days later", continuity_notes: "Tunde's left hand is bandaged since scene 1; Amara's oilskin is torn at the shoulder" },
  shot: { id: "33333333-3333-4333-8333-333333333333", size: "CU", angle: "low", movement: "push_in", focus: "shallow", lens_mm: 85, duration_seconds: 1.5, support: "dolly",
    description: "Amara turns sharply to Tunde, eyes wide.", composition: "Amara on the right third, eyes on the upper third, look room toward frame left", lighting: null, character_ids: [A], dialogue_line_ids: [L1] },
  characters: [{ id: A, name: "Amara Bello", age: "32", gender: "Woman", accent: "Nigerian English (Yoruba)", description: "Activist with close-cropped hair, a small scar through her left eyebrow, wiry build", wardrobe: "Rain gear: yellow oilskin over a black hoodie", physicality: "Stands very still; touches her collar when afraid; speaks with her hands low", personality: "Guarded and precise. Fierce when cornered." }],
  dialogue: [{ id: L1, speaker: "AMARA", character_id: A, text: "They know everything.", emotion: "fear", intensity: 9, intention: "to warn", subtext: "we are already caught", parenthetical: "(whispering)", estimated_seconds: 1.2 }],
  script_action: ["Amara freezes as a torch beam sweeps the jetty, then turns to Tunde."],
  continuity: { screen: { [A]: "right" }, previous: "two-shot — Amara and Tunde on the jetty", next: "close-up — Tunde reacts" },
  aspect_ratio: "16:9", provenance: { shot_plan_version_id: "55555555-5555-4555-8555-555555555555", scene_dna_version_id: "66666666-6666-4666-8666-666666666666", script_version_id: null },
}).package;

describe("promptFor", () => {
  it("video providers get the video prompt; stills get the still prompt", () => {
    expect(promptFor(pkg, "video", 8000)).toMatch(/^1\.5-second cinematic video shot/);
    expect(promptFor(pkg, "image", 8000)).toMatch(/^Cinematic film still/);
  });
  it("tight limits keep identity, action and the line; the lowest-ranked details go first", () => {
    for (const max of [1000, 2000]) {
      const t = promptFor(pkg, "video", max);
      expect(t.length).toBeLessThanOrEqual(max);
      expect(t).toContain("Amara Bello");
      expect(t).toContain("Action over 1.5 s");
      expect(t).toContain('"They know everything."');
    }
    expect(promptFor(pkg, "video", 1000)).not.toContain("Stakes:");
  });
  it("Runway: the reference sentence and the prompt fit 1,000 characters together", () => {
    const r = runwayPrompt({ capability: "video", package: pkg, model: "gen4_turbo", aspect_ratio: "16:9" } as never);
    expect(r.length).toBeLessThanOrEqual(1000);
    expect(r).toContain("Action over 1.5 s");
    expect(framedPrompt(pkg, "image", 1000, "", "Avoid: x.").length).toBeLessThanOrEqual(1000);
  });
});
