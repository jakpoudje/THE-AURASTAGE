import { describe, expect, it } from "vitest";
import { characterAppearanceEngine } from "../../../character/characterAppearanceEngine/engine";
import { auraSketchFigure } from "../engine";
import { gradeHex, sketchStyleFor, SKETCH_STYLES } from "../style";
import { blinksFor, estimateLineSeconds, visemesFor } from "../speech";

const box = { x: 0, y: 0, width: 300, height: 300 };
// Same description, different people: the faces must differ (owner, 2026-10-02: "all character sketches just look the same").
const same = (name: string) => characterAppearanceEngine({ name, age: "30", gender: "woman", description: "brown skin, short hair, blue shirt" });

describe("AuraSketch 3 — faces, genre styles and speech (owner request 2026-10-02)", () => {
  it("two people with the same description get different faces; the same person always gets the same face", () => {
    const a = same("Amara Bello"), b = same("Ngozi Eze");
    expect(a.face).toBeDefined();
    expect(a.face).not.toEqual(b.face);
    expect(same("Amara Bello").face).toEqual(a.face);
    expect(auraSketchFigure(a, "front", "CU", box).svg).not.toBe(auraSketchFigure(b, "front", "CU", box).svg);
    expect(a.varied).toEqual(expect.arrayContaining(["face shape", "eyes", "nose", "lips"]));
    // Skin still comes only from written words — never from the name.
    expect(characterAppearanceEngine({ name: "Amara Bello", description: "tall" }).skin).toBeNull();
  });

  it("what the description says wins over the variation", () => {
    const r = characterAppearanceEngine({ name: "Ramos", description: "Long face, hooded eyes, aquiline nose, thin lips, thick eyebrows, high cheekbones, green eyes, freckles, dimples, weathered" });
    expect(r.face).toMatchObject({ shape: "long", eyes: { shape: "hooded", colour: "#4f7a4a" }, nose: { bridge: "curved" }, lips: { fullness: 0.72 }, brows: { thickness: 1.5 }, cheekbones: 1, freckles: true, dimples: true });
    expect(r.face!.lines).toBeGreaterThanOrEqual(0.8);
    expect(r.varied).not.toContain("face shape");
    expect(r.evidence.map((e) => e.fact)).toEqual(expect.arrayContaining(["face: long", "eyes: hooded", "eye colour: green", "high cheekbones"]));
    const svg = auraSketchFigure(r, "front", "CU", box).svg;
    expect(svg).toContain("#4f7a4a"); // green irises
  });

  it("the genre sets the look: words map to styles, and the style changes the drawing", () => {
    expect(sketchStyleFor("Political thriller").id).toBe("thriller");
    expect(sketchStyleFor("Romantic comedy").id).toBe("romance");
    expect(sketchStyleFor("Sci-Fi").id).toBe("scifi");
    expect(sketchStyleFor("Horror").id).toBe("horror");
    expect(sketchStyleFor("Historical epic").id).toBe("epic");
    expect(sketchStyleFor(null).id).toBe("drama");
    expect(Object.keys(SKETCH_STYLES).length).toBeGreaterThanOrEqual(12);
    const a = same("Amara Bello");
    const drama = auraSketchFigure(a, "three_quarter", "MCU", box).svg, horror = auraSketchFigure(a, "three_quarter", "MCU", box, { style: SKETCH_STYLES.horror }).svg;
    // No SVG filters (the render worker's resvg panics on them): the grade is in the colours themselves.
    expect(drama).not.toContain("<filter");
    expect(horror).not.toContain("<filter");
    expect(horror).not.toBe(drama);
    expect(horror).toContain(gradeHex(SKETCH_STYLES.horror.rim!, SKETCH_STYLES.horror));
    expect(gradeHex("#c43b2f", SKETCH_STYLES.noir)).toMatch(/^#([0-9a-f]{2})\1\1$|^#6/); // nearly grey in noir
  });

  it("a line becomes timed mouth shapes that start and end at rest, fit the length, and close on m/b/p", () => {
    const t = visemesFor("Mama, open the door.", 2);
    expect(t[0]).toEqual({ t: 0, shape: "rest" });
    expect(t[t.length - 1].shape).toBe("rest");
    expect(t.every((k, i) => i === 0 || k.t > t[i - 1].t)).toBe(true);
    expect(t[t.length - 1].t).toBeLessThanOrEqual(2);
    expect(t.map((k) => k.shape)).toEqual(expect.arrayContaining(["closed", "a", "o"]));
    expect(estimateLineSeconds("You came.")).toBeGreaterThan(0.8);
    expect(estimateLineSeconds("one two three four five six", "slow")).toBeGreaterThan(estimateLineSeconds("one two three four five six", "fast"));
    expect(blinksFor(8).length).toBeGreaterThanOrEqual(2);
  });

  it("a speaking figure animates its mouth and blinks; a still one has no animation", () => {
    const a = same("Amara Bello");
    const secs = 2;
    const talk = auraSketchFigure(a, "front", "CU", box, { mouth: { kind: "talking", track: visemesFor("Mama, open the door.", secs), seconds: secs, blinks: blinksFor(3.2) } }).svg;
    expect(talk.match(/<animate attributeName="opacity" calcMode="discrete"/g)!.length).toBeGreaterThanOrEqual(5);
    expect(talk).toContain('dur="3.2s"');
    expect(auraSketchFigure(a, "front", "CU", box).svg).not.toContain("<animate");
    const prof = auraSketchFigure(a, "profile", "CU", box, { mouth: { kind: "talking", track: visemesFor("Ah", 1), seconds: 1, blinks: [] } }).svg;
    expect(prof).toContain("<animate");
  });
});
