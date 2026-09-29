import { describe, expect, it } from "vitest";
import { screenplayFormatEngine } from "../../screenplayFormatEngine";
import { continuityCheckEngine } from "../engine";

const script = `INT. FLAT - NIGHT

TUNDE OKAFOR (35) paces.

TUNDE
They buried it.

AMARA
You came.

EXT. FLAT - NIGHT

Rain.

INT. OFFICE - DAY (CONTINUOUS)

TUNDE
Where is it?

TUNDEE
Here.
`;

describe("continuityCheckEngine", () => {
  const els = screenplayFormatEngine({ source_text: script }).elements;
  const r = continuityCheckEngine({ elements: els });
  it("flags a speaker who was never introduced, near-identical names and INT/EXT switches, each with its line", () => {
    const ids = r.findings.map((f) => f.id);
    expect(ids).toContain("speaks_before_intro");
    expect(r.findings.find((f) => f.id === "speaks_before_intro")!.message).toMatch(/^AMARA/);
    expect(r.findings.find((f) => f.id === "similar_names")!.message).toMatch(/TUNDE.*TUNDEE|TUNDEE.*TUNDE/);
    expect(ids).toContain("int_ext_switch");
    expect(r.findings.every((f) => f.line >= 1)).toBe(true);
    expect(r.findings.find((f) => f.id === "int_ext_switch")!.scene_number).toBe(2);
  });
  it("a clean scene has nothing to say", () => {
    const clean = screenplayFormatEngine({ source_text: "INT. FLAT - NIGHT\n\nTUNDE OKAFOR (35) paces.\n\nTUNDE\nThey buried it.\n" }).elements;
    expect(continuityCheckEngine({ elements: clean }).findings).toEqual([]);
  });
});
