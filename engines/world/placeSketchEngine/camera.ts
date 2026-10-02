// placeSketchEngine — a small 3D camera so places are drawn in real perspective (not flat rectangles). World units are
// metres: x across, y up, z away from the camera. Faces are projected, clipped at the near plane and painted far to
// near; boxes are shaded by which way each face points relative to the light.

export type V3 = [number, number, number];
export interface Camera { x: number; y: number; z: number; yaw: number; f: number; W: number; H: number; horizon: number }
export interface Face { pts: [number, number][]; depth: number; svg: string }

const r1 = (n: number) => Math.round(n * 10) / 10;
export const hexShade = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
};
export const hexMix = (a: string, b: string, t: number) => {
  const p = (h: string) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const x = p(a), y = p(b);
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
};

/** World → camera space (x right, y up, z forward). */
function toCam(c: Camera, [x, y, z]: V3): V3 {
  const dx = x - c.x, dz = z - c.z, cs = Math.cos(c.yaw), sn = Math.sin(c.yaw);
  return [dx * cs - dz * sn, y - c.y, dx * sn + dz * cs];
}
const NEAR = 0.15;
/** Clip a polygon (camera space) against the near plane. */
function clipNear(p: V3[]): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    const ain = a[2] >= NEAR, bin = b[2] >= NEAR;
    if (ain) out.push(a);
    if (ain !== bin) {
      const t = (NEAR - a[2]) / (b[2] - a[2]);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, NEAR]);
    }
  }
  return out;
}
export function project(c: Camera, p: V3): [number, number] | null {
  const q = toCam(c, p);
  if (q[2] < NEAR) return null;
  return [c.W / 2 + (c.f * q[0]) / q[2], c.horizon - (c.f * q[1]) / q[2]];
}
/** Screen scale (pixels per metre) at a world point — for sprites like plants and people. */
export function scaleAt(c: Camera, p: V3) {
  const q = toCam(c, p);
  return q[2] < NEAR ? 0 : c.f / q[2];
}

/** True when every point is outside the picture on the same side (nothing of it would show). Such shapes are skipped:
 * they cost size, and an off-screen shape with opacity makes the render worker's resvg panic (empty layer bounds). */
function offscreen(c: Camera, pts: [number, number][], margin = 4) {
  return pts.every(([x]) => x < -margin) || pts.every(([x]) => x > c.W + margin) || pts.every(([, y]) => y < -margin) || pts.every(([, y]) => y > c.H + margin);
}

/** A flat polygon in the world. `extra` adds SVG attributes (stroke, opacity, filter …). */
export function poly(c: Camera, pts: V3[], fill: string, extra = ""): Face | null {
  const cam = clipNear(pts.map((p) => toCam(c, p)));
  if (cam.length < 3) return null;
  const sp = cam.map(([x, y, z]) => [c.W / 2 + (c.f * x) / z, c.horizon - (c.f * y) / z] as [number, number]);
  if (offscreen(c, sp)) return null;
  const depth = cam.reduce((n, p) => n + p[2], 0) / cam.length;
  return { pts: sp, depth, svg: `<polygon points="${sp.map(([x, y]) => `${r1(x)},${r1(y)}`).join(" ")}" fill="${fill}" ${extra}/>` };
}
/** A line in the world (for tile joints, rails, wires …). */
export function seg(c: Camera, a: V3, b: V3, stroke: string, width: number, extra = ""): Face | null {
  const cam = clipNear([toCam(c, a), toCam(c, b), toCam(c, b)]);
  if (cam.length < 2) return null;
  const [p, q] = [cam[0], cam[1]];
  const P = [c.W / 2 + (c.f * p[0]) / p[2], c.horizon - (c.f * p[1]) / p[2]], Q = [c.W / 2 + (c.f * q[0]) / q[2], c.horizon - (c.f * q[1]) / q[2]];
  if (offscreen(c, [P as [number, number], Q as [number, number]], 8)) return null;
  const w = Math.max(0.4, (width * c.f) / ((p[2] + q[2]) / 2));
  return { pts: [P as [number, number], Q as [number, number]], depth: (p[2] + q[2]) / 2 - 0.001, svg: `<line x1="${r1(P[0])}" y1="${r1(P[1])}" x2="${r1(Q[0])}" y2="${r1(Q[1])}" stroke="${stroke}" stroke-width="${r1(w)}" stroke-linecap="round" ${extra}/>` };
}

export interface Light { x: number; z: number; key: number }
/**
 * A box from (x0,y0,z0) to (x1,y1,z1): the faces the camera can see, shaded — top lit, the side facing the light
 * brighter, the other darker — with a thin ink edge.
 */
export function box(c: Camera, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, colour: string, light: Light, opts: { edge?: string; top?: string; front?: string } = {}): Face[] {
  const out: (Face | null)[] = [];
  const e = `stroke="${opts.edge ?? hexShade(colour, 0.55)}" stroke-width="0.8" stroke-linejoin="round"`;
  const lit = (nx: number, nz: number, k: number) => {
    // Light comes from (light.x, light.z) at the room's height; a face pointing at it is brighter.
    const lx = light.x - (x0 + x1) / 2, lz = light.z - (z0 + z1) / 2, d = Math.hypot(lx, lz) || 1;
    return hexShade(colour, k * (0.82 + 0.25 * Math.max(0, (nx * lx + nz * lz) / d)) * light.key);
  };
  if (c.y > y1) out.push(poly(c, [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], opts.top ?? lit(0, 0, 1.12), e));
  if (c.y < y0) out.push(poly(c, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], hexShade(colour, 0.6), e));
  if (c.z < z0) out.push(poly(c, [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], opts.front ?? lit(0, -1, 1), e));
  if (c.z > z1) out.push(poly(c, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], lit(0, 1, 0.9), e));
  if (c.x < x0) out.push(poly(c, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], lit(-1, 0, 0.86), e));
  if (c.x > x1) out.push(poly(c, [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], lit(1, 0, 0.86), e));
  return out.filter((f): f is Face => !!f).map((f) => ({ ...f, depth: f.depth }));
}

/** A group of faces that must stay in their own order (an object's parts) at one depth. */
export function group(faces: (Face | null)[], depthBias = 0): Face | null {
  const fs = faces.filter((f): f is Face => !!f);
  if (!fs.length) return null;
  fs.sort((a, b) => b.depth - a.depth);
  const depth = Math.min(...fs.map((f) => f.depth)) + depthBias;
  return { pts: fs[0].pts, depth, svg: fs.map((f) => f.svg).join("") };
}

/** An SVG element placed at a world point and scaled to it (plants, people, lamps' glow …). */
export function sprite(c: Camera, at: V3, draw: (x: number, y: number, s: number) => string, depthBias = 0): Face | null {
  const p = project(c, at);
  if (!p) return null;
  const s = scaleAt(c, at);
  // A sprite reaches about 3 m around its point (glows, palm fronds); skip it only when that is all off-screen.
  if (offscreen(c, [[p[0] - s * 3, p[1] - s * 3], [p[0] + s * 3, p[1] + s * 3]].map(([x, y]) => [x, y] as [number, number]), 0) && (p[0] + s * 3 < 0 || p[0] - s * 3 > c.W || p[1] + s * 3 < 0 || p[1] - s * 3 > c.H)) return null;
  return { pts: [p], depth: toCam(c, at)[2] + depthBias, svg: draw(p[0], p[1], s) };
}

export const paint = (faces: (Face | null)[]) => faces.filter((f): f is Face => !!f).sort((a, b) => b.depth - a.depth).map((f) => f.svg).join("");
