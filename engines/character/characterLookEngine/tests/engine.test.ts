import { describe, expect, it } from "vitest";
import { characterLookEngine } from "../engine";

const amara = { name: "Amara Bello", age: "32", gender: "Woman", nationality: "Nigerian", occupation: "Harbour pilot", description: "Close-cropped hair, a thin scar over the left eyebrow" };

describe("characterLookEngine", () => {
  it("builds one identity description and repeats it word for word in every view", () => {
    const r = characterLookEngine({ character: amara, wardrobe: { name: "Rain gear", description: "yellow oilskin jacket" }, style: "Desaturated teal and amber" });
    expect(r.identity).toBe("Amara Bello — Woman, aged 32, Nigerian. Harbour pilot. Close-cropped hair, a thin scar over the left eyebrow.");
    expect(r.views.map((v) => v.key)).toEqual(["front:CU", "front:MS", "front:FULL", "three_quarter:MCU", "three_quarter:FULL", "profile:MCU", "profile:FULL", "back:FULL"]);
    for (const v of r.views) expect(v.prompt).toContain(r.identity + " Wearing: Rain gear — yellow oilskin jacket. Visual style: Desaturated teal and amber.");
    expect(r.views[2]).toMatchObject({ label: "Front · Full", aspect_ratio: "9:16" });
    expect(r.views[0].prompt).toMatch(/^Character reference sheet image, close-up of the face, front view, facing camera\./);
  });
  it("changes the identity hash when anything that defines the look changes, and only then", () => {
    const a = characterLookEngine({ character: amara }).identity_hash;
    expect(characterLookEngine({ character: { ...amara } }).identity_hash).toBe(a);
    expect(characterLookEngine({ character: { ...amara, age: "45" } }).identity_hash).not.toBe(a);
    expect(characterLookEngine({ character: amara, wardrobe: { name: "Suit", description: null } }).identity_hash).not.toBe(a);
  });
  it("names what's missing instead of guessing it", () => {
    expect(characterLookEngine({ character: { name: "Ramos" } })).toMatchObject({ identity: "Ramos.", missing: ["age", "gender", "description"] });
  });
  it("takes a custom set of views", () => {
    expect(characterLookEngine({ character: amara, views: [["back", "MS"]] }).views.map((v) => v.key)).toEqual(["back:MS"]);
  });
});
