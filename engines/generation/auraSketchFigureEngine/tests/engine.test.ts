import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { characterAppearanceEngine } from "../../../character/characterAppearanceEngine/engine";
import { auraSketchFigure, figureCrop, type SketchAngle, type SketchSize } from "../engine";

const tunde = characterAppearanceEngine({ age: "35", gender: "Man", description: "Tall, close-cropped black hair, a full beard and wire glasses. Dark brown skin.", wardrobe: "khaki jacket over a white shirt, navy trousers" });
const aisha = characterAppearanceEngine({ age: "30", gender: "Woman", description: "olive skin", wardrobe: "navy hijab, long cream robe" });
const box = { x: 0, y: 0, width: 300, height: 600 };

describe("auraSketchFigureEngine (AuraSketch 2)", () => {
  it("is deterministic and draws what the description says", () => {
    const a = auraSketchFigure(tunde, "front", "FULL", box).svg;
    expect(a).toBe(auraSketchFigure(tunde, "front", "FULL", box).svg);
    expect(a).toContain("#6b4430"); // the described skin
    expect(a).toContain("#1f1c1c"); // black hair / beard
    expect(a).toContain("#a79a6c"); // khaki jacket
    expect(a).toContain("#27324f"); // navy trousers
    expect(a.match(/<rect [^>]*rx="0.035"/g)?.length).toBe(2); // two glass lenses
  });

  it("colours stay with their garment; the hijab frames a visible face", () => {
    const s = auraSketchFigure(aisha, "front", "MCU", box).svg;
    expect(aisha.clothing.named).toMatchObject({ headwear: "#27324f", top: "#e8dfc9" });
    expect(s.lastIndexOf("#a87a52")).toBeGreaterThan(s.indexOf("#27324f")); // the face is drawn over the hijab
  });

  it("every angle and size renders; the back has no face; crops grow with the size", () => {
    for (const ang of ["front", "three_quarter", "profile", "back"] as SketchAngle[]) for (const sz of ["CU", "MCU", "MS", "FULL"] as SketchSize[]) expect(auraSketchFigure(tunde, ang, sz, box).svg).toMatch(/^<svg /);
    expect(auraSketchFigure(tunde, "back", "CU", box).svg).not.toContain(`fill="#fff"`); // no eye whites from behind
    const h = (sz: SketchSize) => { const c = figureCrop(tunde, sz); return c.bottom - c.top; };
    expect(h("CU")).toBeLessThan(h("MCU"));
    expect(h("MS")).toBeLessThan(h("FULL"));
  });

  it("different descriptions give different drawings", () => {
    const other = characterAppearanceEngine({ age: "70", gender: "Man", description: "bald, grey moustache, fair skin", wardrobe: "charcoal suit, burgundy tie" });
    expect(auraSketchFigure(other, "front", "MS", box).svg).not.toBe(auraSketchFigure(tunde, "front", "MS", box).svg);
  });

  it("writes a preview sheet when asked (SK_OUT)", () => {
    if (!process.env.SK_OUT) return;
    const W = 220, H = 440; let body = "";
    [tunde, aisha].forEach((p, r) => (["front", "three_quarter", "profile", "back"] as SketchAngle[]).forEach((ang, c) => { body += auraSketchFigure(p, ang, "FULL", { x: c * W, y: r * H, width: W, height: H }).svg; }));
    writeFileSync(process.env.SK_OUT + "/sheet.svg", `<svg xmlns="http://www.w3.org/2000/svg" width="${4 * W}" height="${2 * H}"><rect width="100%" height="100%" fill="#f3efe6"/>${body}</svg>`);
  });
});
