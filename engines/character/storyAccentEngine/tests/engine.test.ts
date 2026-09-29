import { describe, expect, it } from "vitest";
import { storyAccentEngine } from "../engine";

describe("storyAccentEngine", () => {
  it("the character's stated nationality comes first, with its evidence", () => {
    const r = storyAccentEngine({ character: { nationality: "Ghanaian" }, scene_locations: ["LAGOS HARBOUR"], project: { setting: "Lagos, Nigeria" } });
    expect(r.suggestion).toMatchObject({ accent: "Ghanaian English", languages: ["English", "Twi", "Ga", "Ewe"], confidence: "stated" });
    expect(r.suggestion!.evidence[0]).toBe("Nationality in the profile: Ghanaian");
    expect(r.alternatives[0].place).toBe("Lagos");
  });
  it("reads where the backstory says they come from", () => {
    const r = storyAccentEngine({ character: { backstory: "Grew up in Kano before moving south for work." }, scene_locations: [], project: { setting: "Lagos" } });
    expect(r.suggestion).toMatchObject({ accent: "Nigerian English (northern)", confidence: "story" });
  });
  it("falls back to where their scenes are set, then the story's setting", () => {
    expect(storyAccentEngine({ character: {}, scene_locations: ["GLASGOW PUB", "GLASGOW STREET"], project: { setting: "London" } }).suggestion).toMatchObject({ accent: "Scottish English", confidence: "setting" });
    expect(storyAccentEngine({ character: {}, scene_locations: [], project: { setting: "Mumbai, 1990s" } }).suggestion).toMatchObject({ accent: "Indian English" });
  });
  it("never reads a name, and says nothing when the story says nothing", () => {
    expect(storyAccentEngine({ character: { description: "A tired detective." }, scene_locations: ["OFFICE"], project: { setting: null } }).suggestion).toBeNull();
    // The input has no name field at all (a name is not evidence of how someone speaks).
    expect(() => storyAccentEngine({ character: { name: "Chukwuemeka" }, scene_locations: [], project: {} })).not.toThrow();
    expect(storyAccentEngine({ character: { name: "Chukwuemeka" } as never, scene_locations: [], project: {} }).suggestion).toBeNull();
  });
});
