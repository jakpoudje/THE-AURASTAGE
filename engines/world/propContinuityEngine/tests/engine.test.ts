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
    expect(out.warnings).toEqual([{ prop_id: "l", scene_number: 5, scenes: [5], message: "Laptop was broken in scene 3 — keep it broken in scene 5, or show it repaired or replaced." }]);
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
    expect(out.engine_version).toBe("1.1.0");
  });

  it("regression (owner report 2026-10-03, The Last Ballot): a cracked case or a cold cup is not a broken phone or a missing cup; an everyday item's state stays in its place; one warning per state", () => {
    const phone = (n: number, evidence: string) => ({ scene_number: n, evidence });
    const out = propContinuityEngine({
      props: [
        { id: "p", name: "Phone", appearances: [
          phone(16, "In the crowd, TOMIWA OYELARAN (22), lanky, a phone in a cracked case gripped like a passport."),
          phone(19, "She picks up her phone."), phone(30, "His face lit blue by his phone."), phone(31, "Her phone buzzes on the desk."),
        ] },
        { id: "c", name: "Cup", appearances: [{ scene_number: 28, evidence: "A cup of tea gone cold." }, { scene_number: 34, evidence: "Her phone lies screen-down beside a cold cup of tea." }] },
        { id: "v", name: "Car", appearances: [{ scene_number: 15, evidence: "She looks out at the gate, where the Emissary's car has gone." }, { scene_number: 31, evidence: "A car slows at the gate." }] },
        // Everyday (4+ scenes): smashed at the rally, later phones elsewhere are other people's; back at the rally it stays broken.
        { id: "m", name: "Mobile", appearances: [
          phone(2, "Ejike smashes the mobile on the ground."), phone(3, "A mobile on the hotel bed."), phone(4, "The mobile rings in the office."),
          phone(5, "The mobile lies where it fell."), phone(6, "Someone's mobile glows."), phone(7, "The mobile, still on the ground."),
        ] },
      ],
      scene_locations: [{ scene_number: 2, location: "RALLY" }, { scene_number: 3, location: "HOTEL" }, { scene_number: 4, location: "OFFICE" },
        { scene_number: 5, location: "RALLY" }, { scene_number: 6, location: "BUS PARK" }, { scene_number: 7, location: "RALLY" }],
    });
    expect(out.props.find((p) => p.id === "p")!.states.every((s) => s.state === null)).toBe(true);
    expect(out.props.find((p) => p.id === "c")!.states.every((s) => s.state === null)).toBe(true);
    // A car that "has gone" drove off — it isn't missing.
    expect(out.props.find((p) => p.id === "v")!.states.every((s) => s.state === null)).toBe(true);
    expect(out.props.find((p) => p.id === "m")!.states.map((s) => s.state)).toEqual(["broken", null, null, "broken", null, "broken"]);
    expect(out.warnings).toEqual([{ prop_id: "m", scene_number: 5, scenes: [5, 7], message: "Mobile was broken in scene 2 — keep it broken in scenes 5, 7, or show it repaired or replaced." }]);
  });
});
