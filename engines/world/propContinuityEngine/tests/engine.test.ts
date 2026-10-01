import { describe, expect, it } from "vitest";
import { propContinuityEngine } from "../engine";

describe("propContinuityEngine", () => {
  it("carries a lasting state forward with a warning until the script restores it; lists the set dressing per scene", () => {
    const out = propContinuityEngine({ props: [
      { id: "l", name: "Laptop", appearances: [
        { scene_number: 1, evidence: "Tunde types on his LAPTOP." },
        { scene_number: 3, evidence: "Amara smashes the LAPTOP against the wall." },
        { scene_number: 5, evidence: "The LAPTOP sits on the desk." },
        { scene_number: 7, evidence: "A new LAPTOP, still in its box." },
      ] },
      { id: "c", name: "Coffee cup", appearances: [{ scene_number: 3, evidence: "A coffee cup, soaked in rain." }, { scene_number: 4, evidence: "The coffee cup again." }] },
    ] });
    const l = out.props.find((p) => p.id === "l")!.states;
    expect(l.map((s) => s.state)).toEqual([null, "broken", "broken", null]);
    expect(l[1]).toMatchObject({ changed_here: true, evidence: "Amara smashes the LAPTOP against the wall." });
    expect(out.warnings).toEqual([{ prop_id: "l", scene_number: 5, message: "Laptop was broken in scene 3 — keep it broken in scene 5, or show it repaired or replaced." }]);
    // "wet" doesn't last: no warning for the cup.
    expect(out.props.find((p) => p.id === "c")!.states.map((s) => s.state)).toEqual(["wet", null]);
    expect(out.set_dressing.find((s) => s.scene_number === 3)!.items).toEqual([{ prop_id: "l", name: "Laptop", state: "broken" }, { prop_id: "c", name: "Coffee cup", state: "wet" }]);
  });

  it("a state word belongs to the prop it's next to, not everything on the line", () => {
    const out = propContinuityEngine({ props: [
      { id: "n", name: "Notebook", appearances: [{ scene_number: 1, evidence: "He tears a page from a battered NOTEBOOK, then calmly picks up his phone from the kitchen counter." }] },
      { id: "p", name: "Phone", appearances: [{ scene_number: 1, evidence: "He tears a page from a battered NOTEBOOK, then calmly picks up his phone from the kitchen counter." }] },
    ] });
    expect(out.set_dressing[0].items).toEqual([{ prop_id: "n", name: "Notebook", state: "torn" }, { prop_id: "p", name: "Phone", state: null }]);
  });

  it("a passing state on top of a lasting one shows both and still asks to keep the lasting one", () => {
    const out = propContinuityEngine({ props: [{ id: "n", name: "Notebook", appearances: [
      { scene_number: 1, evidence: "He tears a page from the NOTEBOOK." }, { scene_number: 3, evidence: "The notebook lies open on the table." },
    ] }] });
    expect(out.props[0].states.map((s) => s.state)).toEqual(["torn", "torn, open"]);
    expect(out.warnings[0].message).toBe("Notebook was torn in scene 1 — keep it torn in scene 3, or show it repaired or replaced.");
  });

  it("a prop that went missing and appears again is flagged; finding it clears it", () => {
    const out = propContinuityEngine({ props: [{ id: "k", name: "Key", appearances: [
      { scene_number: 2, evidence: "The KEY is stolen from the drawer." },
      { scene_number: 4, evidence: "The KEY on the table." },
      { scene_number: 6, evidence: "She finds the KEY under the mat." },
    ] }] });
    expect(out.warnings[0].message).toBe("Key went missing in scene 2 but is in scene 4 — show it found, or check the scene.");
    expect(out.props[0].states.map((s) => s.state)).toEqual(["missing", "missing", null]);
    expect(out.engine_version).toBe("1.0.0");
  });
});
