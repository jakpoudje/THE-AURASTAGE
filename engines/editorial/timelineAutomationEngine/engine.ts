// engines/editorial/timelineAutomationEngine
// Volume automation on the final assembly: points { frame, db } joined by straight lines in dB (a level before the
// first point holds the first point's value, after the last the last one's; no points = 0 dB). Used by Editorial
// playback in the browser and by the render worker, so what is drawn is what is heard and delivered. The edits are
// pure functions: they return a new, valid list (frame order, one point per frame, levels in range).
import type { AutomationPoint } from "@aurastage/contracts";

export const MIN_DB = -60, MAX_DB = 12, MAX_POINTS = 2000;
const clampDb = (db: number) => Math.round(Math.max(MIN_DB, Math.min(MAX_DB, db)) * 10) / 10;
const norm = (pts: AutomationPoint[]) => {
  const byFrame = new Map<number, number>();
  for (const p of pts) byFrame.set(Math.max(0, Math.round(p.frame)), clampDb(p.db));
  return [...byFrame.entries()].sort((a, b) => a[0] - b[0]).map(([frame, db]) => ({ frame, db }));
};

/** Level (dB) at a (possibly fractional) frame. */
export function automationDbAt(points: AutomationPoint[], frame: number): number {
  if (!points.length) return 0;
  if (frame <= points[0].frame) return points[0].db;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (frame <= b.frame) return a.db + ((b.db - a.db) * (frame - a.frame)) / (b.frame - a.frame);
  }
  return points[points.length - 1].db;
}

/** Linear gain at a frame. */
export const automationGainAt = (points: AutomationPoint[], frame: number) => Math.pow(10, automationDbAt(points, frame) / 20);

/** Sets (or replaces) the point at a frame. */
export function setPoint(points: AutomationPoint[], frame: number, db: number): AutomationPoint[] {
  return norm([...points.filter((p) => p.frame !== Math.round(frame)), { frame, db }]);
}

/** Removes the point at a frame (if any). */
export function removePoint(points: AutomationPoint[], frame: number): AutomationPoint[] {
  return points.filter((p) => p.frame !== Math.round(frame));
}

/** Moves a point to a new frame/level, keeping it between its neighbours. */
export function movePoint(points: AutomationPoint[], fromFrame: number, toFrame: number, db: number): AutomationPoint[] {
  const i = points.findIndex((p) => p.frame === fromFrame);
  if (i < 0) return points;
  const lo = i > 0 ? points[i - 1].frame + 1 : 0, hi = i < points.length - 1 ? points[i + 1].frame - 1 : Number.MAX_SAFE_INTEGER;
  const next = points.slice();
  next[i] = { frame: Math.max(lo, Math.min(hi, Math.round(toFrame))), db: clampDb(db) };
  return norm(next);
}

/**
 * A drawn stroke (pointer positions converted to frame/dB, in drawing order) replaces the points it covers. The
 * level just outside the stroke is kept by anchoring its edges, and the stroke is thinned so that straight stretches
 * don't become thousands of points (a point is kept when the line through its neighbours misses it by > tolerance dB).
 */
export function drawStroke(points: AutomationPoint[], stroke: AutomationPoint[], toleranceDb = 0.3): AutomationPoint[] {
  if (!stroke.length) return points;
  const s = norm(stroke);
  const f0 = s[0].frame, f1 = s[s.length - 1].frame;
  const outside = points.filter((p) => p.frame < f0 || p.frame > f1);
  const anchors: AutomationPoint[] = [];
  if (points.length && f0 > 0 && !outside.some((p) => p.frame === f0 - 1)) anchors.push({ frame: f0 - 1, db: automationDbAt(points, f0 - 1) });
  if (points.length && !outside.some((p) => p.frame === f1 + 1) && points.some((p) => p.frame > f1)) anchors.push({ frame: f1 + 1, db: automationDbAt(points, f1 + 1) });
  return norm([...outside, ...anchors, ...thin(s, toleranceDb)]).slice(0, MAX_POINTS);
}

/** Keeps the ends and every point the straight line between kept neighbours would miss by more than the tolerance. */
export function thin(pts: AutomationPoint[], tol: number): AutomationPoint[] {
  if (pts.length <= 2) return pts;
  const keep = [pts[0]];
  let anchor = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[anchor], c = pts[i + 1];
    // Would a straight line from the last kept point to the next point pass every point since the anchor?
    let ok = true;
    for (let k = anchor + 1; k <= i; k++) {
      const p = pts[k], expect = a.db + ((c.db - a.db) * (p.frame - a.frame)) / (c.frame - a.frame);
      if (Math.abs(expect - p.db) > tol) { ok = false; break; }
    }
    if (!ok) { keep.push(pts[i]); anchor = i; }
  }
  keep.push(pts[pts.length - 1]);
  return keep;
}

/** Removes every point in [from, to] (inclusive), keeping the level at the edges so the rest doesn't change. */
export function clearRange(points: AutomationPoint[], from: number, to: number): AutomationPoint[] {
  const inside = points.filter((p) => p.frame >= from && p.frame <= to);
  if (!inside.length) return points;
  const edges: AutomationPoint[] = [];
  if (points.some((p) => p.frame < from)) edges.push({ frame: from, db: automationDbAt(points, from) });
  if (points.some((p) => p.frame > to)) edges.push({ frame: to, db: automationDbAt(points, to) });
  return norm([...points.filter((p) => p.frame < from || p.frame > to), ...edges]);
}

/** A dip of `db` over [from, to] with ramps of `ramp` frames (e.g. under a line of narration or across a cut). */
export function dip(points: AutomationPoint[], from: number, to: number, db: number, ramp: number): AutomationPoint[] {
  const base = (f: number) => automationDbAt(points, f);
  const a = Math.max(0, from - ramp), b = to + ramp;
  const kept = points.filter((p) => p.frame < a || p.frame > b);
  return norm([...kept, { frame: a, db: base(a) }, { frame: from, db: base(from) + db }, { frame: to, db: base(to) + db }, { frame: b, db: base(b) }]);
}
