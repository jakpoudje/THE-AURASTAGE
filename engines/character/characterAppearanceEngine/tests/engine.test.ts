import { describe, expect, it } from "vitest";
import { characterAppearanceEngine } from "../engine";

describe("characterAppearanceEngine", () => {
  it("reads build, hair, face and clothes from the words, with evidence", () => {
    const a = characterAppearanceEngine({
      name: "Tunde Okafor", age: "35", gender: "Man",
      description: "Tall and broad-shouldered, close-cropped black hair, a full beard and wire glasses. Dark brown skin.",
      wardrobe: "Field outfit — khaki jacket over a white shirt, navy trousers",
    });
    expect(a).toMatchObject({ presentation: "masculine", age_years: 35, life_stage: "adult", muscular: true, facial_hair: "full_beard", glasses: true });
    expect(a.hair).toMatchObject({ style: "cropped", colour: "#1f1c1c", grey: false });
    expect(a.skin).toBe("#6b4430");
    expect(a.clothing).toMatchObject({ top: "jacket", bottom: "trousers", open_jacket: true });
    expect(a.clothing.colours.slice(0, 3)).toEqual(["#a79a6c", "#ecebe6", "#27324f"]); // khaki, white, navy in order
    expect(a.height).toBeGreaterThan(1.05);
    expect(a.evidence.some((e) => e.fact === "glasses" && e.from === "glasses")).toBe(true);
    expect(a.unspecified).toEqual([]);
  });

  it("never guesses skin tone, gender or hair from a name or nationality", () => {
    const a = characterAppearanceEngine({ name: "Amara Bello", description: "An activist who never gives up." });
    expect(a.skin).toBeNull();
    expect(a.presentation).toBe("neutral");
    expect(a.unspecified).toEqual(expect.arrayContaining(["skin tone", "gender presentation", "age", "hair style", "hair colour", "build", "clothing"]));
  });

  it("feminine presentation, braids, a gele and a dress", () => {
    const a = characterAppearanceEngine({ age: "28", gender: "Woman", description: "Slender, long braids", wardrobe: "Emerald green dress with a gold gele" });
    expect(a).toMatchObject({ presentation: "feminine", headwear: "gele", hair: { style: "braids" }, clothing: { top: "dress", bottom: "none" } });
    expect(a.width).toBeLessThan(0.85);
    expect(a.clothing.colours[0]).toBe("#3f7a45"); // green (from "emerald green": the colour word)
  });

  it("an elder goes grey unless a hair colour is given; a child is a child", () => {
    expect(characterAppearanceEngine({ age: "78", gender: "Man" }).hair).toMatchObject({ grey: true, colour: "#b3b2b0" });
    expect(characterAppearanceEngine({ age: "78", description: "dyed red hair" }).hair).toMatchObject({ grey: false, colour: "#a8492a" });
    expect(characterAppearanceEngine({ age: "32", age_state: { age: "10", description: "braided hair, school uniform" } })).toMatchObject({
      life_stage: "child", age_years: 10, hair: { style: "braids" }, clothing: { top: "uniform" },
    });
    // Regression: "late teens" is a teenager (18), not an adult of 20.
    expect(characterAppearanceEngine({ age: "late teens" })).toMatchObject({ life_stage: "teen", age_years: 18 });
    expect(characterAppearanceEngine({ age: "early thirties" })).toMatchObject({ life_stage: "adult", age_years: 32 });
  });

  it("structured Casting fields win over the description", () => {
    const a = characterAppearanceEngine({ description: "short brown hair", appearance: { hair: "long blonde hair", skin_tone: "fair skin", build: "heavyset" } });
    expect(a.hair).toMatchObject({ style: "long", colour: "#d8b56a" });
    expect(a.skin).toBe("#e6c4a8");
    expect(a.width).toBeGreaterThan(1.2);
  });

  it("a colour word about hair isn't taken as clothing", () => {
    const a = characterAppearanceEngine({ description: "red hair", wardrobe: "" });
    expect(a.clothing.colours).toEqual([]);
  });
});
