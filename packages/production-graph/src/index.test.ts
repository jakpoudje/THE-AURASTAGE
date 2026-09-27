import { describe, expect, it } from "vitest";
import { computeDrift, descendantState, impactPriority, type DependencyRef } from "./index";

const ref = (type: DependencyRef["type"], id: string, fingerprint: string, strength: DependencyRef["strength"] = "soft", label = id): DependencyRef => ({
  type, id, fingerprint, strength, label,
});

describe("computeDrift", () => {
  const frozen = [ref("scene", "s1", "h1", "hard", "Scene 1"), ref("character", "c1", "a", "soft", "Tunde"), ref("dialogue_line", "l1", "x", "soft", "Line 1")];

  it("reports nothing when every upstream fingerprint matches", () => {
    expect(computeDrift(frozen, [...frozen])).toEqual([]);
    expect(descendantState([])).toBe("current");
  });

  it("marks soft changes REVIEW_REQUIRED and hard changes STALE", () => {
    const soft = computeDrift(frozen, [frozen[0], ref("character", "c1", "b", "soft", "Tunde"), frozen[2]]);
    expect(soft).toEqual([{ ref: expect.objectContaining({ id: "c1" }), kind: "changed", effect: "review_required", message: "Tunde (character) changed since approval." }]);
    expect(descendantState(soft)).toBe("review_required");
    const hard = computeDrift(frozen, [ref("scene", "s1", "h2", "hard", "Scene 1"), frozen[1], frozen[2]]);
    expect(descendantState(hard)).toBe("stale");
  });

  it("treats removed and newly added upstream objects as drift", () => {
    const d = computeDrift(frozen, [frozen[0], frozen[1], ref("dialogue_line", "l2", "y", "soft", "Line 2")]);
    expect(d.map((x) => [x.ref.id, x.kind])).toEqual([["l1", "removed"], ["l2", "added"]]);
    expect(descendantState(d)).toBe("review_required");
  });

  it("stale wins over review_required", () => {
    const d = computeDrift(frozen, [ref("character", "c1", "b"), frozen[2]]);
    expect(descendantState(d)).toBe("stale"); // the hard scene ref was removed
  });
});

describe("impactPriority", () => {
  it("sums c×d×k×a with factors clamped to [0,1]", () => {
    expect(impactPriority([{ criticality: 1, dependencyStrength: 1, recomputationCost: 0.5, approvalWeight: 1 }, { criticality: 2, dependencyStrength: 0.5, recomputationCost: 1, approvalWeight: 1 }])).toBe(1);
    expect(impactPriority([])).toBe(0);
  });
});
