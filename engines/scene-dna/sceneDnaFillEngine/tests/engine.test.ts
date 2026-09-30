import { describe, expect, it } from "vitest";
import { UpdateSceneDnaInputSchema } from "@aurastage/contracts";
import { sceneDnaFillEngine } from "../engine";

const scene = {
  number: 1, heading: "EXT. LAGOS POLLING UNIT - NIGHT", int_ext: "EXT", location: "LAGOS POLLING UNIT", time_of_day: "NIGHT", estimated_seconds: 112,
  action: [
    "A single fluorescent tube buzzes over a table under a tarpaulin. A small generator coughs. The crowd presses in, sweating.",
    "The PRESIDING OFFICER (25), in sweat-dark khaki, holds each ballot up to the light.",
    "TOMIWA holds up his phone and photographs the result sheet. His left thumb is still stained purple.",
  ],
};
const lines = [
  { speaker: "PRESIDING OFFICER", text: "Void. Next.", emotion: "neutral" as const, intensity: 3 },
  { speaker: "AGENT IN CAP", text: "Count it again! Every vote!", emotion: "determination" as const, intensity: 8 },
  { speaker: "TOMIWA", text: "It's done. It's signed.", emotion: "joy" as const, intensity: 6 },
];

describe("sceneDnaFillEngine", () => {
  it("proposes every field from the script, within the Scene DNA limits, with evidence", () => {
    const out = sceneDnaFillEngine({ scene, lines, characters: ["Presiding Officer", "Tomiwa Oyelaran"], is_first: true,
      next: { number: 2, heading: "EXT. SURULERE STREET - CONTINUOUS", time_of_day: "CONTINUOUS" }, project: { logline: "A young voter fights to protect one result sheet.", time_period: "2023" } });
    expect(UpdateSceneDnaInputSchema.safeParse(out.fields).success).toBe(true);
    expect(out.fields.lighting_intent).toMatch(/fluorescent tube/);
    expect(out.fields.weather).toMatch(/Hot and humid/);
    expect(out.fields.sound_intent).toMatch(/Dialogue sits clean|ambience|bed/);
    expect(out.fields.purpose).toMatch(/^Opens the film/);
    expect(out.fields.purpose).toMatch(/Count it again/);
    expect(out.fields.stakes).toMatch(/Agent In Cap holds to what they have decided/);
    expect(out.fields.story_time).toBe("Night, 2023");
    expect(out.fields.mood).toContain("resolute");
    expect(out.fields.continuity_notes).toMatch(/Scene 2 continues straight on/);
    expect(out.fields.continuity_notes).toMatch(/purple/);
    expect(Object.keys(out.evidence)).toEqual(expect.arrayContaining(["purpose", "lighting_intent", "weather"]));
  });

  it("a CONTINUOUS scene inherits the time and must match the scene before", () => {
    const out = sceneDnaFillEngine({ scene: { number: 2, heading: "EXT. SURULERE STREET - CONTINUOUS", int_ext: "EXT", location: "SURULERE STREET", time_of_day: "CONTINUOUS", action: ["Tomiwa walks home."] },
      previous: { number: 1, heading: scene.heading, time_of_day: "NIGHT", location: "LAGOS POLLING UNIT", characters: ["TOMIWA"] }, characters: ["Tomiwa"] });
    expect(out.fields.story_time).toBe("Continuous from Scene 1 (night)");
    expect(out.fields.continuity_notes).toMatch(/Continues directly from Scene 1/);
    expect(out.fields.continuity_notes).toMatch(/Tomiwa is also in Scene 1/);
    expect(out.fields.lighting_intent).toMatch(/^Night exterior/);
    expect(out.fields.camera_energy).toBe("measured");
  });
});
