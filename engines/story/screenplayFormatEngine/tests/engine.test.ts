import { describe, expect, it } from "vitest";
import { screenplayFormatEngine } from "../engine";

const SAMPLE = `FADE IN:

EXT. LAGOS SKYLINE - DAWN

The sun rises over Lagos. A sprawling city of contrasts.

SUPER: LAGOS, NIGERIA - PRESENT DAY

INT. NEWSROOM - MORNING

TUNDE OKAFOR (35), an investigative journalist, reviews documents.

COLLEAGUE
You've really gone deep this time, Tunde.
Are you sure about this?

TUNDE (V.O.)
(quietly)
Someone has to tell the truth.

CUT TO:
`;

describe("screenplayFormatEngine", () => {
  const { elements } = screenplayFormatEngine({ source_text: SAMPLE });
  const types = elements.map((e) => e.type);

  it("classifies the standard element types", () => {
    expect(types).toEqual([
      "transition",
      "scene_heading",
      "action",
      "action",
      "scene_heading",
      "action",
      "character",
      "dialogue",
      "character",
      "parenthetical",
      "dialogue",
      "transition",
    ]);
  });

  it("normalises speakers and keeps extensions", () => {
    const cue = elements.find((e) => e.type === "character" && e.speaker === "TUNDE");
    expect(cue?.extensions).toEqual(["V.O."]);
  });

  it("keeps multi-line dialogue together", () => {
    expect(elements[7].text).toBe("You've really gone deep this time, Tunde.\nAre you sure about this?");
  });

  it("records source line numbers as evidence links", () => {
    expect(elements[1]).toMatchObject({ type: "scene_heading", line: 3, text: "EXT. LAGOS SKYLINE - DAWN" });
  });

  it("indexes elements sequentially", () => {
    elements.forEach((e, i) => expect(e.index).toBe(i));
  });

  it("does not treat SUPER: as a speaker", () => {
    expect(elements[3]).toMatchObject({ type: "action", text: "SUPER: LAGOS, NIGERIA - PRESENT DAY" });
  });

  it("supports forced scene headings and forced action", () => {
    const out = screenplayFormatEngine({ source_text: ".ROOFTOP - NIGHT\n\n!ALL CAPS ACTION LINE\nsecond line" });
    expect(out.elements.map((e) => e.type)).toEqual(["scene_heading", "action"]);
    expect(out.elements[0].text).toBe("ROOFTOP - NIGHT");
  });

  it("is deterministic", () => {
    expect(screenplayFormatEngine({ source_text: SAMPLE })).toEqual(screenplayFormatEngine({ source_text: SAMPLE }));
  });

  it("handles empty input", () => {
    expect(screenplayFormatEngine({ source_text: "" }).elements).toEqual([]);
  });
});
