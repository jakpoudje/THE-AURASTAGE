import { describe, expect, it } from "vitest";
import { worldExtractionEngine, normalizeLocation, timeOfDay } from "../engine";

const el = (index: number, type: string, text: string) => ({ index, type, text, line: index + 1 });
const elements = [
  el(0, "scene_heading", "INT. TUNDE'S APARTMENT - KITCHEN - NIGHT"),
  el(1, "action", "TUNDE OKAFOR (40s) paces. He grabs his phone and a battered NOTEBOOK from the table. The phone RINGS."),
  el(2, "character", "TUNDE"),
  el(3, "dialogue", "They buried it."),
  el(4, "scene_heading", "EXT. LAGOS HARBOUR - DAWN"),
  el(5, "action", "Amara steps off a yellow danfo. She clutches the RED FILE and her phone. A crane BOOMS."),
  el(6, "scene_heading", "INT. TUNDE'S APARTMENT - DAY"),
  el(7, "action", "The notebook lies open. AMARA reads it."),
];
const scenes = [
  { number: 1, heading: "INT. TUNDE'S APARTMENT - KITCHEN - NIGHT", int_ext: "INT", location: "TUNDE'S APARTMENT - KITCHEN", time_of_day: "NIGHT", element_start: 0, element_end: 3, heading_line: 1 },
  { number: 2, heading: "EXT. LAGOS HARBOUR - DAWN", int_ext: "EXT", location: "LAGOS HARBOUR", time_of_day: "DAWN", element_start: 4, element_end: 5, heading_line: 5 },
  { number: 3, heading: "INT. TUNDE'S APARTMENT - DAY", int_ext: "INT", location: "TUNDE'S APARTMENT", time_of_day: "DAY", element_start: 6, element_end: 7, heading_line: 7 },
];

describe("worldExtractionEngine", () => {
  const r = worldExtractionEngine({ elements, scenes, character_names: ["Tunde Okafor", "Amara Bello"] });
  it("finds one location per place, with every time of day and sub-area, and the scenes as evidence", () => {
    expect(r.locations.map((l) => l.name)).toEqual(["Tunde's Apartment", "Lagos Harbour"]);
    const apt = r.locations[0];
    expect(apt.times_of_day).toEqual(["NIGHT", "DAY"]);
    expect(apt.areas).toEqual(["Kitchen"]);
    expect(apt.int_ext).toEqual(["INT"]);
    expect(apt.scenes.map((s) => s.scene_number)).toEqual([1, 3]);
  });
  it("finds props named as objects, keeps capitals as high confidence, and never mistakes names or sounds for props", () => {
    const keys = r.props.map((p) => p.key);
    expect(keys).toEqual(expect.arrayContaining(["phone", "notebook", "red file", "danfo"]));
    expect(keys).not.toContain("tunde");
    expect(keys).not.toContain("ring");
    expect(keys).not.toContain("boom");
    const nb = r.props.find((p) => p.key === "notebook")!;
    expect(nb.confidence).toBe("high");
    expect(nb.descriptors).toContain("battered");
    expect(nb.scenes.map((s) => s.scene_number)).toEqual([1, 3]);
    expect(nb.scenes[0].text).toMatch(/battered NOTEBOOK/);
    expect(r.props.find((p) => p.key === "phone")!.confidence).toBe("medium");
    expect(r.props.find((p) => p.key === "danfo")!.category).toBe("vehicle");
    expect(r.props.find((p) => p.key === "red file")!.name).toBe("Red File");
  });
  it("normalises headings", () => {
    expect(normalizeLocation("Lagos harbour (CONTINUOUS)")).toBe("LAGOS HARBOUR");
    expect(timeOfDay("LATER THAT NIGHT")).toBe("NIGHT");
    expect(timeOfDay(null)).toBeNull();
  });
});
