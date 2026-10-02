import { describe, expect, it } from "vitest";
import { CharacterProfileFieldsSchema } from "@aurastage/contracts";
import { characterProfileEngine } from "../engine";

const base = {
  character: { name: "Tomiwa Oyelaran", role: "lead" },
  introduction: "At the very front stands TOMIWA OYELARAN (22), lanky, a phone charger coiled round his wrist like a bangle. His left thumb is still stained purple.",
  intro_age: "22",
  lines: [
    { scene: 1, text: "It's done. It's signed!", emotion: "joy" as const, intensity: 6, intention: "Celebrate" },
    { scene: 1, text: "Hold it up. Let me get all four corners.", emotion: "determination" as const, intensity: 5, intention: "Take control" },
    { scene: 9, text: "They changed the numbers. I have the photo. I will not delete it.", emotion: "determination" as const, intensity: 9, intention: "Hold their ground" },
  ],
  mentions: [{ scene: 1, text: "Tomiwa punches the air." }, { scene: 1, text: "Tomiwa steps closer than anyone. He frames the photo carefully." }],
  scenes: [{ number: 1, heading: "EXT. LAGOS POLLING UNIT - NIGHT" }, { number: 9, heading: "INT. TOMIWA'S ROOM - NIGHT" }],
  total_scenes: 69,
  relationships: [{ other: "Amara", type: "friend", description: null }],
  accent: { accent: "Lagos Nigerian English", languages: ["English", "Yoruba", "Nigerian Pidgin"], evidence: ["Scenes set in Lagos"] },
  project: { logline: "When Tomiwa photographs a result sheet, the proof puts him in danger.", setting: "Lagos", time_period: "2023" },
};

describe("characterProfileEngine", () => {
  it("proposes every profile field from the script, within Casting's limits, each with evidence", () => {
    const out = characterProfileEngine(base);
    expect(CharacterProfileFieldsSchema.safeParse(out.fields).success).toBe(true);
    expect(out.fields).toMatchObject({ age: "22", gender: "Male", nationality: "Nigerian", accent: "Lagos Nigerian English", languages: "English, Yoruba, Nigerian Pidgin" });
    expect(out.fields.description).toMatch(/phone charger/);
    expect(out.fields.personality).toMatch(/^Resolute and driven/);
    expect(out.fields.personality).toMatch(/I will not delete it/);
    expect(out.fields.motivation).toMatch(/^Drives the story/);
    expect(out.fields.arc).toMatch(/Begins hopeful in Scene 1 and ends resolute in Scene 9/);
    expect(out.fields.backstory).toMatch(/First seen in Scene 1/);
    expect(out.fields.strengths).toMatch(/Won't back down/);
    for (const k of Object.keys(out.fields)) expect(out.evidence[k]).toBeTruthy();
  });

  it("never reads anything from the name alone; a silent extra gets what the action shows", () => {
    const out = characterProfileEngine({ character: { name: "Market Woman" }, mentions: [{ scene: 1, text: "A MARKET WOMAN fans herself with a ballot envelope." }], scenes: [{ number: 1, heading: "EXT. POLLING UNIT - NIGHT" }] });
    expect(out.fields.occupation).toBe("Market woman");
    expect(out.fields.accent).toBeUndefined();
    expect(out.fields.personality).toMatch(/never speak/);
    expect(out.fields.arc).toMatch(/single-scene role in Scene 1/);
    const nameOnly = characterProfileEngine({ character: { name: "Chinedu" } });
    // Regression (whole-cast fill left a hand-added character empty): every field is filled, honestly.
    expect(nameOnly.fields.personality).toMatch(/doesn't show yet/);
    expect(nameOnly.fields.arc).toMatch(/Not in any scene/);
    expect(nameOnly.fields.motivation).toBeTruthy();
    expect(nameOnly.fields.gender).toBeUndefined();
    expect(nameOnly.fields.accent).toBeUndefined();
  });
});

describe("characterProfileEngine 1.1.0 — physicality & mannerisms (realism R1)", () => {
  it("quotes only what the script shows them doing with their body; nothing when it shows nothing", () => {
    const out = characterProfileEngine({
      character: { name: "Amara Bello" },
      introduction: "AMARA BELLO (32), wiry, close-cropped hair. She paces when she thinks.",
      mentions: [{ scene: 2, text: "Amara touches her collar. The rain gets heavier." }, { scene: 3, text: "Amara reads the note." }],
    });
    expect(out.fields.physicality).toBe("As the script shows them: She paces when she thinks. Amara touches her collar.");
    expect(out.evidence.physicality).toBe("2 action line(s) about how they move");
    expect(characterProfileEngine({ character: { name: "Kemi" }, mentions: [{ scene: 1, text: "Kemi reads the note." }] }).fields.physicality).toBeUndefined();
  });
});
