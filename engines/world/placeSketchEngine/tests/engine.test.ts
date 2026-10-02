import { describe, expect, it } from "vitest";
import { placeSketchEngine } from "../engine";
import { readPlace } from "../read";

const W = 640, H = 360;
const draw = (name: string, description: string, int_ext: string[], time: string | null, view: "establishing" | "wide" | "medium" | "detail" = "wide") =>
  placeSketchEngine({ name, description, int_ext, time, view, width: W, height: H, seed: name });

describe("placeSketchEngine — places drawn from their description (owner request 2026-10-02)", () => {
  it("reads the kind of place from the name first, then the description; INT/EXT decides inside or outside", () => {
    expect(readPlace("NEWSROOM", "", ["INT"], "DAY").type).toBe("newsroom");
    expect(readPlace("LAGOS HARBOUR", "an office by the water", ["EXT"], "DAWN").type).toBe("harbour");
    expect(readPlace("AMARA'S APARTMENT", "her bedroom, a single bed", ["INT"], "NIGHT").type).toBe("living_room");
    expect(readPlace("CHURCH", "", ["EXT"], "DAY")).toMatchObject({ type: "building_ext", interior: false });
    expect(readPlace("MARKET HALL", "", ["INT"], "DAY")).toMatchObject({ interior: true });
    expect(readPlace("SOMEWHERE", "", ["EXT"], "DAY").type).toBe("street");
  });
  it("reads size, condition, wealth, materials, colours, weather, light and the objects named — with the words they came from", () => {
    const p = readPlace("CHIEF'S OFFICE", "A spacious executive office with wood panelled walls, cream walls, a marble floor, a laptop, a bookshelf and a ceiling fan. Rain outside. Fluorescent strip lights.", ["INT"], "NIGHT");
    expect(p).toMatchObject({ type: "office", size: "large", wealth: "luxury", weather: "rain", lit: "night", practical: "fluorescent", wall: { mat: "wood" } });
    expect(p.objects).toEqual(expect.arrayContaining(["laptop", "bookshelf", "ceiling_fan"]));
    expect(p.evidence.map((e) => e.fact)).toEqual(expect.arrayContaining(["place: office", "large", "has laptop"]));
    expect(readPlace("FLAT", "a cramped, run-down room with peeling paint", ["INT"], "DAY")).toMatchObject({ size: "small", condition: "worn" });
  });
  it("draws a furnished room in perspective: an office has desks and monitors, a hospital beds, a cell bars; deterministic", () => {
    const office = draw("NEWSROOM", "rows of desks", ["INT"], "DAY").svg;
    expect(office).toBe(draw("NEWSROOM", "rows of desks", ["INT"], "DAY").svg);
    expect(office.match(/<polygon/g)!.length).toBeGreaterThan(150);
    expect(office).toContain("#9fc2e0"); // lit monitor screens
    expect(draw("WARD", "a hospital ward", ["INT"], "DAY").svg).toContain("#4fd08a"); // patient monitors
    expect(draw("HOLDING CELL", "", ["INT"], "NIGHT").svg.match(/<line [^>]*stroke="#3a3d40"/g)!.length).toBeGreaterThan(10); // bars
    expect(draw("NEWSROOM", "", ["INT"], "DAY").svg).not.toBe(draw("BEDROOM", "", ["INT"], "DAY").svg);
  });
  it("draws exteriors: a harbour has water, containers and cranes; a market has stalls and people; rain and night change the picture", () => {
    const h = draw("LAGOS HARBOUR", "containers and cranes", ["EXT"], "DAWN");
    expect(h.place.type).toBe("harbour");
    expect(h.svg).toContain("#3f6f8a"); // water
    const m = draw("BALOGUN MARKET", "stalls", ["EXT"], "DAY").svg;
    expect(m).toContain("#c43b2f"); // produce
    const wet = draw("BACK STREET", "rain", ["EXT"], "NIGHT").svg;
    expect(wet.match(/stroke="#c9d6e6"/g)!.length).toBeGreaterThan(100); // rain streaks
    expect(wet).toContain('fill="#0b1226"'); // night grade
  });
  it("an interior's establishing view is the building from outside; the film's genre grades the picture", () => {
    expect(draw("CHIEF'S OFFICE", "", ["INT"], "DAY", "establishing").place.type).toBe("building_ext");
    const graded = placeSketchEngine({ name: "OFFICE", int_ext: ["INT"], time: "DAY", width: W, height: H, style: { id: "horror", sat: 0.32, warmth: -0.2, shadow: 1.8, key: "#d9f0c8", shade: "#0c1a10", grade: 0.6 } }).svg;
    expect(graded).not.toContain("<filter");
    expect(graded).not.toBe(placeSketchEngine({ name: "OFFICE", int_ext: ["INT"], time: "DAY", width: W, height: H }).svg);
  });
});
