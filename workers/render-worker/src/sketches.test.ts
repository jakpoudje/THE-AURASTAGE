import { describe, expect, it } from "vitest";
import { Resvg } from "@resvg/resvg-js";
import { characterAppearanceEngine, drawAuraSketchFigure, placeSketchEngine, SKETCH_STYLES } from "@aurastage/engines";

// Regression (2026-10-02): AuraSketch places and genre-styled figures made resvg — this worker's rasteriser — panic
// (an SVG filter over a large drawing, and off-screen lines with opacity), which stopped every render of the film.
// Every kind of place, at day and night, from every view, with a genre grade, must rasterise.
const PLACES: [string, string, string][] = [
  ["CHIEF'S OFFICE", "Executive office with wood panelled walls, a large desk, bookshelf, laptop, marble floor.", "INT"], ["NEWSROOM", "rows of desks", "INT"],
  ["LIVING ROOM", "ceiling fan, sofa, tv", "INT"], ["KITCHEN", "", "INT"], ["BAR", "neon sign", "INT"], ["CHURCH", "", "INT"], ["CLASSROOM", "", "INT"],
  ["HOSPITAL WARD", "", "INT"], ["HOLDING CELL", "", "INT"], ["WAREHOUSE", "", "INT"], ["CORRIDOR", "", "INT"], ["TAXI", "", "INT"],
  ["LAGOS HARBOUR", "containers", "EXT"], ["MARKET", "", "EXT"], ["STREET", "rain, okada, power lines", "EXT"], ["BEACH", "", "EXT"], ["VILLAGE", "", "EXT"],
  ["ROOFTOP", "", "EXT"], ["COMPOUND", "generator, palm trees", "EXT"],
];
const raster = (body: string, W = 640, H = 360) => new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${body}</svg>`).render().width;

describe("AuraSketch drawings rasterise in the render worker", () => {
  it("every place, view and time of day, graded by a genre", () => {
    let n = 0;
    for (const [name, description, ie] of PLACES) for (const time of ["DAY", "NIGHT"]) for (const view of ["establishing", "wide", "medium", "detail"] as const) {
      const o = placeSketchEngine({ name, description, int_ext: [ie], time, view, width: 640, height: 360, seed: name, style: SKETCH_STYLES.thriller });
      expect(raster(o.svg)).toBe(640);
      n++;
    }
    expect(n).toBe(PLACES.length * 8);
  });
  it("genre-styled characters (including a speaking one)", () => {
    const a = characterAppearanceEngine({ name: "Amara", gender: "woman", description: "dark skin, braids, navy blazer" });
    for (const st of Object.values(SKETCH_STYLES)) expect(raster(drawAuraSketchFigure(a, "three_quarter", "MCU", { x: 0, y: 0, width: 300, height: 360 }, { style: st }).svg)).toBe(640);
    const talk = drawAuraSketchFigure(a, "front", "CU", { x: 0, y: 0, width: 360, height: 360 }, { mouth: { kind: "talking", track: [{ t: 0, shape: "rest" }, { t: 0.3, shape: "a" }, { t: 0.8, shape: "rest" }], seconds: 1, blinks: [0.5] } }).svg;
    expect(raster(talk)).toBe(640);
  });
});
