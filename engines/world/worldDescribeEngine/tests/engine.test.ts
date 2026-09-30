import { describe, expect, it } from "vitest";
import { worldDescribeEngine } from "../engine";

describe("worldDescribeEngine", () => {
  it("describes a location from the script's own words, setting and times", () => {
    const out = worldDescribeEngine({ kind: "location", name: "Kano School", int_ext: ["INT"], times_of_day: ["DAWN", "DAY"], areas: ["Classroom"],
      mentions: [{ scene: 10, text: "A cramped classroom with peeling blue paint and wooden benches." }], project: { setting: "Kano", time_period: "2023" } });
    expect(out.description).toMatch(/^Kano School: interior in Kano, 2023\. Seen at dawn and day\. Areas: Classroom\./);
    expect(out.look_words).toEqual(expect.arrayContaining(["cramped", "peeling", "blue", "wooden"]));
    expect(out.description).toMatch(/\(Scene 10\)/);
  });
  it("describes a prop even with nothing but its name and scenes", () => {
    const out = worldDescribeEngine({ kind: "prop", name: "Result sheet", mentions: [] });
    expect(out.description).toMatch(/^Result sheet: a prop\./);
    expect(out.description.length).toBeLessThanOrEqual(2000);
  });
});
