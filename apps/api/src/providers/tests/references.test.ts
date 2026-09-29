import { describe, expect, it } from "vitest";
import { chooseReferences, describeReferences, type ReferenceCandidate } from "../references";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const cand = (n: number, kind: ReferenceCandidate["kind"], asset: Partial<NonNullable<ReferenceCandidate["asset"]>> | null = {}): ReferenceCandidate => ({
  kind, object_id: id(n), name: `${kind}${n}`, view: "v", asset_id: id(100 + n),
  asset: asset === null ? null : { storage_path: `p${n}.png`, media_type: "image/png", size_bytes: 10, version: 1, ...asset },
});
const adapter = { name: "Runway", references: { image: { max: 2, media_types: ["image/png"], max_bytes: 100 } } };

describe("chooseReferences", () => {
  it("characters first, then the location, then props, up to the provider's limit", () => {
    const d = chooseReferences(adapter, "image", [cand(1, "prop"), cand(2, "location"), cand(3, "character")]);
    expect(d.map((x) => [x.name, x.sent])).toEqual([["character3", true], ["location2", true], ["prop1", false]]);
    expect(d[2].reason).toMatch(/at most 2 reference images/);
  });

  it("explains every reference it does not send", () => {
    const d = chooseReferences(adapter, "image", [
      cand(1, "character", null), cand(2, "character", { media_type: "image/svg+xml" }), cand(3, "character", { media_type: "image/gif" }),
      cand(4, "character", { size_bytes: 1000 }), cand(5, "character"),
    ], { [id(105)]: "The reference file couldn't be read (gone)." });
    expect(d.map((x) => x.sent)).toEqual([false, false, false, false, false]);
    expect(d.map((x) => x.reason)).toEqual([
      "The reference file is no longer in this project's Assets Library.",
      expect.stringMatching(/built-in sketch/),
      "Runway doesn't accept image/gif as a reference.",
      expect.stringMatching(/Larger than/),
      "The reference file couldn't be read (gone).",
    ]);
  });

  it("a provider without reference support gets none, with the reason", () => {
    expect(chooseReferences({ name: "AuraStage sketch" }, "image", [cand(1, "character")])[0]).toMatchObject({ sent: false, reason: expect.stringMatching(/prompt only/) });
    expect(chooseReferences(adapter, "video", [cand(1, "character")])[0]).toMatchObject({ sent: false, reason: expect.stringMatching(/approved frame/) });
  });

  it("records the asset version for provenance", () => {
    expect(chooseReferences(adapter, "image", [cand(1, "character", { version: 4 })])[0].asset_version).toBe(4);
  });

  it("describes references in plain words", () => {
    expect(describeReferences([{ kind: "character", name: "Amara" }, { kind: "prop", name: "knife" }], (i) => `#${i + 1}`)).toBe(
      "Keep these consistent with the reference images: #1 is Amara; #2 is the knife. ");
    expect(describeReferences([], String)).toBe("");
  });
});
