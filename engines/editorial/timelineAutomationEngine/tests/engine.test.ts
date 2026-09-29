import { describe, expect, it } from "vitest";
import { automationDbAt, automationGainAt, clearRange, dip, drawStroke, movePoint, removePoint, setPoint, thin } from "../engine";

const P = (frame: number, db: number) => ({ frame, db });

describe("timelineAutomationEngine", () => {
  it("level: 0 dB without points; holds before the first and after the last; straight lines in dB between", () => {
    expect(automationDbAt([], 100)).toBe(0);
    const pts = [P(24, 0), P(72, -12)];
    expect(automationDbAt(pts, 0)).toBe(0);
    expect(automationDbAt(pts, 48)).toBe(-6);
    expect(automationDbAt(pts, 500)).toBe(-12);
    expect(automationGainAt(pts, 72)).toBeCloseTo(Math.pow(10, -12 / 20), 9);
  });
  it("set, move (kept between neighbours), remove; always frame order, one per frame, levels clamped", () => {
    let pts = setPoint([], 48, -3);
    pts = setPoint(pts, 12, 0);
    pts = setPoint(pts, 48, 99); // replaces, clamped to +12
    expect(pts).toEqual([P(12, 0), P(48, 12)]);
    pts = setPoint(pts, 30, -6.04);
    expect(pts.map((p) => p.frame)).toEqual([12, 30, 48]);
    expect(pts[1].db).toBe(-6);
    pts = movePoint(pts, 30, 100, -9); // can't jump past its right neighbour
    expect(pts[1]).toEqual(P(47, -9));
    expect(removePoint(pts, 47)).toEqual([P(12, 0), P(48, 12)]);
  });
  it("a drawn stroke replaces what it covers, keeps the level just outside, and is thinned", () => {
    const base = [P(0, 0), P(200, 0)];
    // A straight ramp drawn over 100 frames becomes two points, not a hundred.
    const stroke = Array.from({ length: 101 }, (_, i) => P(50 + i, -(i / 100) * 12));
    const out = drawStroke(base, stroke);
    expect(out.filter((p) => p.frame >= 50 && p.frame <= 150)).toEqual([P(50, -0), P(150, -12)]);
    expect(out.find((p) => p.frame === 49)).toEqual(P(49, 0)); // anchored: before the stroke is unchanged
    expect(out.find((p) => p.frame === 151)).toEqual(P(151, 0)); // and after it
    expect(automationDbAt(out, 100)).toBeCloseTo(-6, 1);
    // A wiggle keeps its turning points.
    const wiggle = [P(10, 0), P(20, -10), P(30, 0), P(40, -10)];
    expect(thin(wiggle, 0.3)).toEqual(wiggle);
  });
  it("clear a range without moving the rest; a dip with ramps", () => {
    const pts = [P(0, 0), P(50, -10), P(100, 0)];
    const c = clearRange(pts, 40, 60);
    expect(c.some((p) => p.frame === 50)).toBe(false);
    expect(automationDbAt(c, 40)).toBeCloseTo(automationDbAt(pts, 40), 6);
    expect(automationDbAt(c, 60)).toBeCloseTo(automationDbAt(pts, 60), 6);
    const d = dip([], 100, 200, -8, 12);
    expect(d).toEqual([P(88, 0), P(100, -8), P(200, -8), P(212, 0)]);
    expect(automationDbAt(d, 94)).toBe(-4);
  });
});
