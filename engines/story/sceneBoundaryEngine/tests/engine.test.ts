import { describe, expect, it } from "vitest";
import { screenplayFormatEngine } from "../../screenplayFormatEngine";
import { sceneBoundaryEngine } from "../engine";
import { parseHeading } from "../rules";

const SAMPLE = `FADE IN:

EXT. LAGOS SKYLINE - DAWN

The sun rises over Lagos.

INT. NEWSROOM - MORNING

TUNDE
Someone has to tell the truth.

AMARA
People deserve to know.

TUNDE
This is bigger than both of us.

EXT. LAGOS SKYLINE - NIGHT

City lights flicker.
`;

describe("sceneBoundaryEngine", () => {
  const { elements } = screenplayFormatEngine({ source_text: SAMPLE });
  const out = sceneBoundaryEngine({ elements });

  it("creates one scene per heading, numbered in order", () => {
    expect(out.scenes.map((s) => s.number)).toEqual([1, 2, 3]);
    expect(out.scenes.map((s) => s.heading)).toEqual([
      "EXT. LAGOS SKYLINE - DAWN",
      "INT. NEWSROOM - MORNING",
      "EXT. LAGOS SKYLINE - NIGHT",
    ]);
  });

  it("parses INT/EXT, location and time of day", () => {
    expect(out.scenes[1]).toMatchObject({ int_ext: "INT", location: "NEWSROOM", time_of_day: "MORNING" });
  });

  it("collects speaking characters per scene", () => {
    expect(out.scenes[1].speaking_characters.sort()).toEqual(["AMARA", "TUNDE"]);
    expect(out.scenes[0].speaking_characters).toEqual([]);
  });

  it("tracks element ranges for evidence", () => {
    const s = out.scenes[1];
    expect(elements[s.element_start].type).toBe("scene_heading");
    expect(s.element_end).toBeGreaterThan(s.element_start);
  });

  it("derives analysis from the elements", () => {
    expect(out.analysis.scene_count).toBe(3);
    expect(out.analysis.speaking_characters[0]).toEqual({ name: "TUNDE", lines: 2, scenes: 1 });
    expect(out.analysis.locations[0]).toEqual({ name: "LAGOS SKYLINE", scenes: 2 });
    expect(out.analysis.estimated_pages).toBeGreaterThan(0);
  });

  it("returns no scenes for a script without headings", () => {
    const e = screenplayFormatEngine({ source_text: "Just some action." }).elements;
    expect(sceneBoundaryEngine({ elements: e }).scenes).toEqual([]);
  });
});

describe("parseHeading", () => {
  it.each([
    ["INT./EXT. CAR - MOVING", { int_ext: "INT/EXT", location: "CAR", time_of_day: "MOVING" }],
    ["EXT. THIRD MAINLAND BRIDGE - DUSK", { int_ext: "EXT", location: "THIRD MAINLAND BRIDGE", time_of_day: "DUSK" }],
    ["INT. HOUSE - KITCHEN - NIGHT", { int_ext: "INT", location: "HOUSE - KITCHEN", time_of_day: "NIGHT" }],
    ["ROOFTOP", { int_ext: "UNKNOWN", location: "ROOFTOP", time_of_day: null }],
  ])("%s", (heading, expected) => {
    expect(parseHeading(heading)).toEqual(expected);
  });
});
