import { describe, expect, it } from "vitest";
import type { CharacterCandidate } from "../../characterCandidateExtractionEngine/output.schema";
import { characterIdentityResolutionEngine } from "../engine";

const cand = (key: string, over: Partial<CharacterCandidate> = {}): CharacterCandidate => ({
  key,
  display_name: key,
  aliases: [],
  kind: "individual",
  suggested_role: "minor",
  age: null,
  introduction: null,
  total_lines: 1,
  appearances: [],
  confidence: 0.99,
  needs_confirmation: false,
  reason: "",
  ...over,
});
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("characterIdentityResolutionEngine", () => {
  const existing = [
    { id: A, name: "Tunde Okafor", merged_into: null, aliases: ["TUNDE OKAFOR", "TUNDE"] },
    { id: B, name: "Ramos", merged_into: A, aliases: [] },
  ];

  it("matches by canonical name, ignoring punctuation and case", () => {
    const [r] = characterIdentityResolutionEngine({ candidates: [cand("TUNDE OKAFOR")], existing }).resolutions;
    expect(r).toMatchObject({ decision: "match", character_id: A, via: "name" });
  });

  it("matches by alias, including a candidate's own aliases", () => {
    const r = characterIdentityResolutionEngine({ candidates: [cand("MR OKAFOR", { aliases: ["Tunde"] })], existing }).resolutions[0];
    expect(r).toMatchObject({ decision: "match", character_id: A, via: "alias" });
  });

  it("follows merges to the surviving character", () => {
    const r = characterIdentityResolutionEngine({ candidates: [cand("RAMOS")], existing }).resolutions[0];
    expect(r.character_id).toBe(A);
  });

  it("creates confident new characters and holds uncertain ones for confirmation", () => {
    const rs = characterIdentityResolutionEngine({
      candidates: [cand("AMARA BELLO"), cand("DETECTIVE RAMOS", { needs_confirmation: true, confidence: 0.6 })],
      existing,
    }).resolutions;
    expect(rs.map((r) => r.decision)).toEqual(["create", "confirm"]);
  });

  it("creates a held candidate once a person confirms it", () => {
    const r = characterIdentityResolutionEngine({
      candidates: [cand("DETECTIVE RAMOS", { needs_confirmation: true })],
      existing,
      confirmed_keys: ["DETECTIVE RAMOS"],
    }).resolutions[0];
    expect(r.decision).toBe("create");
  });
});
