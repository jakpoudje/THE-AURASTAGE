import { describe, expect, it } from "vitest";
import { storyTimeCueEngine } from "../engine";

const chars = [{ id: "a", name: "AMARA", age: "32" }, { id: "t", name: "TUNDE", age: "35" }];
const scene = (number: number, heading: string, action: string[] = []) => ({ id: `s${number}`, number, heading, action: action.map((text, i) => ({ line: number * 10 + i, text })) });

describe("storyTimeCueEngine", () => {
  it("finds flashbacks, time jumps and years in headings, with evidence", () => {
    const r = storyTimeCueEngine({ characters: chars, scenes: [
      scene(1, "EXT. HARBOUR - NIGHT"),
      scene(2, "INT. SCHOOL - DAY (FLASHBACK - 1995)"),
      scene(3, "INT. OFFICE - DAY", ["TWENTY YEARS LATER.", "SUPER: Lagos, 2015"]),
      scene(4, "EXT. HARBOUR - NIGHT - PRESENT DAY"),
    ] });
    expect(r.scenes[0]).toMatchObject({ cues: [], other_time: false });
    expect(r.scenes[1].cues.map((c) => [c.kind, c.text, c.where])).toEqual([["flashback", "FLASHBACK", "heading"], ["year", "1995", "heading"]]);
    expect(r.scenes[2].cues.map((c) => [c.kind, c.text, c.line])).toEqual([["time_jump", "TWENTY YEARS LATER", 30], ["year", "2015", 31]]);
    expect(r.scenes[3]).toMatchObject({ cues: [{ kind: "back_to_present", text: "PRESENT DAY" }], other_time: false });
    expect(r.engine_version).toBe("1.0.0");
  });

  it("finds characters shown at another age", () => {
    const r = storyTimeCueEngine({ characters: chars, scenes: [scene(5, "EXT. YARD - DAY", ["YOUNG AMARA (10) chases a goat.", "An older Tunde watches.", "AMARA (age 10) laughs."])] });
    const ages = r.scenes[0].cues.filter((c) => c.kind === "character_age").map((c) => [c.character_id, c.age, c.text]);
    expect(ages).toEqual([["a", "young", "YOUNG AMARA"], ["a", "10", "AMARA (10)"], ["t", "older", "older Tunde"], ["a", "age 10", "AMARA (age 10)"]]);
    expect(r.scenes[0].other_time).toBe(true);
  });

  it("regression: a character's usual introduction with their profile age is not a time clue", () => {
    const r = storyTimeCueEngine({ characters: chars, scenes: [scene(7, "INT. NEWSROOM - NIGHT", ["Rain lashes the windows. TUNDE (35) and AMARA (32) argue.", "RAMOS (60) watches."])] });
    expect(r.scenes[0]).toMatchObject({ cues: [], other_time: false });
  });

  it("does not date a scene from a year in ordinary action, or invent cues", () => {
    const r = storyTimeCueEngine({ characters: chars, scenes: [scene(6, "INT. GARAGE - DAY", ["A 1970s car sits under a sheet.", "Amara (quietly) opens the door."])] });
    expect(r.scenes[0].cues).toEqual([]);
  });
});
