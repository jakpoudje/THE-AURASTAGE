import { describe, expect, it } from "vitest";
import { neighbours, screenDirection, scriptActionForShot } from "../shotContext";

// INT. FLAT - NIGHT (0) / Rain hammers the window. (1) / Amara paces. (2) / AMARA (3) / They know. (4) /
// She grabs the torch. (5) / TUNDE (6) / (quietly) (7) / Then we run. (8) / They slip out the back door. (9)
const els = [
  { index: 0, type: "scene_heading", text: "INT. FLAT - NIGHT" }, { index: 1, type: "action", text: "Rain hammers the window." },
  { index: 2, type: "action", text: "Amara paces." }, { index: 3, type: "character", text: "AMARA" }, { index: 4, type: "dialogue", text: "They know." },
  { index: 5, type: "action", text: "She grabs the torch." }, { index: 6, type: "character", text: "TUNDE" }, { index: 7, type: "parenthetical", text: "(quietly)" },
  { index: 8, type: "dialogue", text: "Then we run." }, { index: 9, type: "action", text: "They slip out the back door." },
  { index: 10, type: "scene_heading", text: "EXT. STREET - NIGHT" }, { index: 11, type: "action", text: "Next scene." },
];
const scene = { start: 0, end: 9 };

describe("scriptActionForShot", () => {
  it("a speaking shot gets the action just before and just after its line", () => {
    expect(scriptActionForShot({ elements: els, scene, lineElementIndexes: [3], purpose: "dialogue" })).toEqual(["Rain hammers the window.", "Amara paces.", "She grabs the torch."]);
    expect(scriptActionForShot({ elements: els, scene, lineElementIndexes: [6], purpose: "dialogue" })).toEqual(["She grabs the torch.", "They slip out the back door."]);
  });
  it("establishing and master get the opening action; an action shot gets what follows the last line; nothing leaks from the next scene", () => {
    expect(scriptActionForShot({ elements: els, scene, lineElementIndexes: [], purpose: "establishing" })).toEqual(["Rain hammers the window.", "Amara paces."]);
    expect(scriptActionForShot({ elements: els, scene, lineElementIndexes: [], purpose: "action" })).toEqual(["They slip out the back door."]);
    expect(scriptActionForShot({ elements: els, scene, lineElementIndexes: [], purpose: "reaction" })).toEqual([]);
  });
});

describe("screenDirection and neighbours", () => {
  const shots = [
    { id: "s1", ordinal: 1, purpose: "establishing", size: "WS", description: "Wide of the flat", character_ids: ["a"], dialogue_line_ids: [] },
    { id: "s2", ordinal: 2, purpose: "master", size: "TWO_SHOT", description: "Amara and Tunde", character_ids: ["t", "a"], dialogue_line_ids: [] },
    { id: "s3", ordinal: 3, purpose: "dialogue", size: "CU", description: "Amara", character_ids: ["a"], dialogue_line_ids: ["l1"] },
    { id: "s4", ordinal: 4, purpose: "dialogue", size: "MS", description: "Kemi enters", character_ids: ["k"], dialogue_line_ids: [] },
  ];
  it("the master sets the sides and every shot keeps them; a newcomer takes the next side", () => {
    expect(screenDirection(shots)).toEqual({ t: "left", a: "right", k: "center" });
  });
  it("names the shots before and after", () => {
    expect(neighbours(shots, "s3", { TWO_SHOT: "two-shot", MS: "medium shot" })).toEqual({ previous: "two-shot — Amara and Tunde", next: "medium shot — Kemi enters" });
    expect(neighbours(shots, "s1", {}).previous).toBeNull();
  });
});
