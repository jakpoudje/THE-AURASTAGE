import { describe, expect, it } from "vitest";
import { characterDuplicateEngine } from "../engine";

const c = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, name, ...extra });

describe("characterDuplicateEngine", () => {
  it("finds a first name used alone next to the full name, keeping the fuller, more-used record", () => {
    const { pairs } = characterDuplicateEngine({ characters: [c("1", "AMARA", { scene_count: 2 }), c("2", "AMARA BELLO", { scene_count: 9 }), c("3", "TUNDE OKAFOR")] });
    expect(pairs).toEqual([expect.objectContaining({ keep_id: "2", merge_id: "1", confidence: "medium", reason: expect.stringMatching(/first name of “AMARA BELLO”/) })]);
  });
  it("a title or script note is not a different person", () => {
    const { pairs } = characterDuplicateEngine({ characters: [c("1", "DETECTIVE RAMOS"), c("2", "RAMOS"), c("3", "Dr. Adeyemi"), c("4", "ADEYEMI")] });
    expect(pairs.map((p) => [p.keep_name, p.merge_name, p.confidence])).toEqual([["DETECTIVE RAMOS", "RAMOS", "high"], ["Dr. Adeyemi", "ADEYEMI", "high"]]);
  });
  it("one-letter typos in names of five letters or more", () => {
    expect(characterDuplicateEngine({ characters: [c("1", "CHIDERA"), c("2", "CHIDRA")] }).pairs).toHaveLength(1);
    expect(characterDuplicateEngine({ characters: [c("1", "ADA"), c("2", "ADE")] }).pairs).toHaveLength(0);
  });
  it("an ambiguous first name is not guessed (two people share it)", () => {
    const { pairs } = characterDuplicateEngine({ characters: [c("1", "AMARA"), c("2", "AMARA BELLO"), c("3", "AMARA OKON")] });
    expect(pairs).toEqual([]);
  });
  it("a pair a person marked as different never comes back", () => {
    const { pairs } = characterDuplicateEngine({ characters: [c("1", "RAMOS", { distinct_from: ["2"] }), c("2", "DETECTIVE RAMOS")] });
    expect(pairs).toEqual([]);
  });
  it("an approved character is always the one kept", () => {
    const { pairs } = characterDuplicateEngine({ characters: [c("1", "RAMOS", { approved: true }), c("2", "DETECTIVE RAMOS", { scene_count: 20 })] });
    expect(pairs[0]).toMatchObject({ keep_id: "1", merge_id: "2" });
  });
});
