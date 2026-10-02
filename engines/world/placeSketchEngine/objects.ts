// placeSketchEngine — the object library: furniture, fixtures, vehicles and outdoor things built in 3D from boxes,
// panels and sprites, at real sizes (metres), so a desk, a bed or a container sits in the room in true perspective.
import { box, group, hexMix, hexShade, poly, seg, sprite, type Camera, type Face, type Light, type V3 } from "./camera";

export type Rng = () => number;
type F = (Face | null)[];
const r1 = (n: number) => Math.round(n * 10) / 10;

export const WOOD = "#7a5638", DARK_WOOD = "#4e3424", METAL = "#8b9096", BLACK = "#24252a", WHITE = "#e9e6de", FABRIC = "#5a6a7a";

export function desk(c: Camera, L: Light, x: number, z: number, w = 1.4, d = 0.7, col = WOOD): F {
  const h = 0.75, t = 0.04;
  return [group([
    ...box(c, x - w / 2, h - t, z - d / 2, x + w / 2, h, z + d / 2, col, L),
    ...box(c, x - w / 2, 0, z - d / 2 + 0.05, x - w / 2 + 0.42, h - t, z + d / 2, hexShade(col, 0.92), L),
    ...box(c, x + w / 2 - 0.05, 0, z - d / 2 + 0.05, x + w / 2, h - t, z + d / 2 - 0.05, hexShade(col, 0.85), L),
  ])];
}
export function chair(c: Camera, L: Light, x: number, z: number, facing: 1 | -1 = -1, col = DARK_WOOD, office = false): F {
  const s = 0.23, sh = 0.46, back = z - facing * s;
  const parts: F = [
    ...box(c, x - s, sh - 0.05, z - s, x + s, sh, z + s, office ? BLACK : col, L),
    ...box(c, x - s, sh, back - 0.03, x + s, sh + (office ? 0.55 : 0.45), back + 0.03, office ? BLACK : col, L),
  ];
  if (office) parts.push(...box(c, x - 0.03, 0.05, z - 0.03, x + 0.03, sh - 0.05, z + 0.03, METAL, L), ...box(c, x - 0.28, 0, z - 0.28, x + 0.28, 0.05, z + 0.28, BLACK, L));
  else for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push(...box(c, x + dx * s - 0.02, 0, z + dz * s - 0.02, x + dx * s + 0.02, sh - 0.05, z + dz * s + 0.02, hexShade(col, 0.8), L));
  return [group(parts)];
}
export function monitor(c: Camera, L: Light, x: number, y: number, z: number, glow = "#9fc2e0"): F {
  return [group([
    ...box(c, x - 0.03, y, z - 0.03, x + 0.03, y + 0.18, z + 0.03, BLACK, L),
    ...box(c, x - 0.3, y + 0.15, z - 0.03, x + 0.3, y + 0.5, z + 0.02, BLACK, L),
    poly(c, [[x - 0.27, y + 0.18, z - 0.035], [x + 0.27, y + 0.18, z - 0.035], [x + 0.27, y + 0.47, z - 0.035], [x - 0.27, y + 0.47, z - 0.035]], glow),
  ], -0.01)];
}
export function laptop(c: Camera, L: Light, x: number, y: number, z: number): F {
  return [group([...box(c, x - 0.18, y, z - 0.12, x + 0.18, y + 0.02, z + 0.12, "#5d6066", L), poly(c, [[x - 0.17, y + 0.02, z + 0.12], [x + 0.17, y + 0.02, z + 0.12], [x + 0.17, y + 0.24, z + 0.16], [x - 0.17, y + 0.24, z + 0.16]], "#9fc2e0", `stroke="#3a3c40" stroke-width="1"`)], -0.01)];
}
export function papers(c: Camera, x: number, y: number, z: number, rng: Rng): F {
  return Array.from({ length: 3 }, (_, i) => {
    const dx = (rng() - 0.5) * 0.4, dz = (rng() - 0.5) * 0.2;
    return poly(c, [[x + dx - 0.1, y + 0.002 * (i + 1), z + dz - 0.14], [x + dx + 0.1, y + 0.002 * (i + 1), z + dz - 0.14], [x + dx + 0.1, y + 0.002 * (i + 1), z + dz + 0.14], [x + dx - 0.1, y + 0.002 * (i + 1), z + dz + 0.14]], "#f1eee6", `stroke="#bdb8ad" stroke-width="0.5"`);
  });
}
export function lamp(c: Camera, L: Light, x: number, y: number, z: number, on: boolean, floor = false): F {
  const h = floor ? 1.5 : 0.35;
  return [group([
    ...box(c, x - 0.1, y, z - 0.1, x + 0.1, y + 0.03, z + 0.1, BLACK, L),
    seg(c, [x, y, z], [x, y + h, z], "#3a3a3a", 0.02),
    ...box(c, x - 0.16, y + h - 0.05, z - 0.16, x + 0.16, y + h + 0.18, z + 0.16, on ? "#f3d9a0" : "#d8cdb5", L),
  ], -0.01), on ? sprite(c, [x, y + h + 0.05, z], (px, py, s) => `<circle cx="${r1(px)}" cy="${r1(py)}" r="${r1(s * 1.4)}" fill="url(#glow)" opacity="0.8"/>`, -0.5) : null];
}
export function bookshelf(c: Camera, L: Light, x: number, z: number, w: number, h: number, rng: Rng, depthAxis: "z" | "x" = "z"): F {
  const d = 0.32, parts: F = [];
  const along = depthAxis === "z";
  const [x0, x1, z0, z1] = along ? [x - w / 2, x + w / 2, z - d, z] : [x - d, x, z - w / 2, z + w / 2];
  parts.push(...box(c, x0, 0, z0, x1, h, z1, DARK_WOOD, L));
  const books = ["#7a2e2e", "#2f4e6e", "#c9a24a", "#3f6b45", "#6b4a8f", "#d2cfc6", "#8e5a2a", "#2b2b2b"];
  const shelves = Math.max(3, Math.round(h / 0.38));
  for (let s = 0; s < shelves; s++) {
    const y = 0.08 + (s * (h - 0.12)) / shelves;
    parts.push(along ? poly(c, [[x0 + 0.03, y, z0 - 0.002], [x1 - 0.03, y, z0 - 0.002], [x1 - 0.03, y + 0.02, z0 - 0.002], [x0 + 0.03, y + 0.02, z0 - 0.002]], "#2a1d14") : null);
    let u = 0.04;
    while (u < w - 0.08) {
      const bw = 0.025 + rng() * 0.04, bh = 0.18 + rng() * 0.12, col = books[Math.floor(rng() * books.length)];
      if (along) parts.push(poly(c, [[x0 + u, y + 0.02, z0 - 0.004], [x0 + u + bw, y + 0.02, z0 - 0.004], [x0 + u + bw, y + 0.02 + bh, z0 - 0.004], [x0 + u, y + 0.02 + bh, z0 - 0.004]], col, `stroke="#1a1410" stroke-width="0.4"`));
      else parts.push(poly(c, [[x1 + 0.004, y + 0.02, z0 + u], [x1 + 0.004, y + 0.02, z0 + u + bw], [x1 + 0.004, y + 0.02 + bh, z0 + u + bw], [x1 + 0.004, y + 0.02 + bh, z0 + u]], col, `stroke="#1a1410" stroke-width="0.4"`));
      u += bw + (rng() < 0.12 ? 0.08 : 0.004);
    }
  }
  return [group(parts)];
}
export function cabinet(c: Camera, L: Light, x0: number, z0: number, x1: number, z1: number, h = 1.3, col = "#8a8d8f"): F {
  const parts: F = [...box(c, x0, 0, z0, x1, h, z1, col, L)];
  for (let i = 1; i < 4; i++) parts.push(seg(c, [x0, (i * h) / 4, z0 - 0.003], [x1, (i * h) / 4, z0 - 0.003], hexShade(col, 0.6), 0.008));
  return [group(parts)];
}
export function sofa(c: Camera, L: Light, x: number, z: number, w: number, facing: 1 | -1, col = FABRIC): F {
  const d = 0.9, b = z + (facing === -1 ? d / 2 - 0.2 : -d / 2);
  return [group([
    ...box(c, x - w / 2, 0.05, z - d / 2, x + w / 2, 0.42, z + d / 2, col, L),
    ...box(c, x - w / 2, 0.42, b, x + w / 2, 0.85, b + 0.2, hexShade(col, 0.92), L),
    ...box(c, x - w / 2, 0.05, z - d / 2, x - w / 2 + 0.18, 0.62, z + d / 2, hexShade(col, 0.95), L),
    ...box(c, x + w / 2 - 0.18, 0.05, z - d / 2, x + w / 2, 0.62, z + d / 2, hexShade(col, 0.95), L),
    ...box(c, x - w / 2 + 0.2, 0.42, z - d / 2 + 0.05, x - 0.02, 0.5, b, hexShade(col, 1.06), L),
    ...box(c, x + 0.02, 0.42, z - d / 2 + 0.05, x + w / 2 - 0.2, 0.5, b, hexShade(col, 1.06), L),
  ])];
}
export function table(c: Camera, L: Light, x: number, z: number, w: number, d: number, h = 0.74, col = WOOD, cloth?: string): F {
  const parts: F = [...box(c, x - w / 2, h - 0.04, z - d / 2, x + w / 2, h, z + d / 2, cloth ?? col, L)];
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push(...box(c, x + dx * (w / 2 - 0.06) - 0.03, 0, z + dz * (d / 2 - 0.06) - 0.03, x + dx * (w / 2 - 0.06) + 0.03, h - 0.04, z + dz * (d / 2 - 0.06) + 0.03, hexShade(col, 0.8), L));
  return [group(parts)];
}
export function bed(c: Camera, L: Light, x: number, zHead: number, w: number, len: number, cover = "#8a6f8f", hospital = false): F {
  const z0 = zHead - len;
  return [group([
    ...box(c, x - w / 2, 0, z0, x + w / 2, 0.3, zHead, hospital ? METAL : DARK_WOOD, L),
    ...box(c, x - w / 2 + 0.02, 0.3, z0 + 0.02, x + w / 2 - 0.02, 0.5, zHead - 0.02, WHITE, L),
    ...box(c, x - w / 2 + 0.01, 0.36, z0, x + w / 2 - 0.01, 0.53, zHead - 0.55, cover, L),
    ...box(c, x - w / 2 + 0.08, 0.5, zHead - 0.5, x + w / 2 - 0.08, 0.62, zHead - 0.12, "#f2efe8", L),
    ...box(c, x - w / 2, 0, zHead - 0.06, x + w / 2, hospital ? 0.9 : 1.1, zHead, hospital ? METAL : DARK_WOOD, L),
  ])];
}
export function wardrobe(c: Camera, L: Light, x0: number, z0: number, x1: number, z1: number, col = WOOD): F {
  return [group([...box(c, x0, 0, z0, x1, 2.0, z1, col, L), seg(c, [(x0 + x1) / 2, 0.1, z0 - 0.003], [(x0 + x1) / 2, 1.9, z0 - 0.003], hexShade(col, 0.5), 0.01)])];
}
export function plant(c: Camera, L: Light, x: number, z: number, h = 1.0, rng: Rng = Math.random): F {
  const leaves = Array.from({ length: 7 }, () => [rng() - 0.5, rng(), rng()]);
  return [group([
    ...box(c, x - 0.15, 0, z - 0.15, x + 0.15, 0.3, z + 0.15, "#9a5a3a", L),
    sprite(c, [x, 0.3 + h * 0.5, z], (px, py, s) => leaves.map(([dx, dy, k]) => `<ellipse cx="${r1(px + dx * s * 0.5)}" cy="${r1(py - (dy - 0.3) * s * h * 0.7)}" rx="${r1(s * 0.18)}" ry="${r1(s * 0.32)}" fill="${hexMix("#3f6b3a", "#6f9a4a", k)}" stroke="#24401f" stroke-width="0.6" transform="rotate(${r1(dx * 70)} ${r1(px + dx * s * 0.5)} ${r1(py - (dy - 0.3) * s * h * 0.7)})"/>`).join(""), -0.05),
  ])];
}
export function rug(c: Camera, x: number, z: number, w: number, d: number, col = "#7a3a34"): F {
  return [poly(c, [[x - w / 2, 0.005, z - d / 2], [x + w / 2, 0.005, z - d / 2], [x + w / 2, 0.005, z + d / 2], [x - w / 2, 0.005, z + d / 2]], col, `stroke="${hexShade(col, 1.4)}" stroke-width="2"`),
    poly(c, [[x - w / 2 + 0.15, 0.006, z - d / 2 + 0.15], [x + w / 2 - 0.15, 0.006, z - d / 2 + 0.15], [x + w / 2 - 0.15, 0.006, z + d / 2 - 0.15], [x - w / 2 + 0.15, 0.006, z + d / 2 - 0.15]], "none", `stroke="${hexShade(col, 1.5)}" stroke-width="1" opacity="0.7"`)];
}
export function tv(c: Camera, L: Light, x: number, y: number, z: number, w = 1.2, on = true): F {
  return [group([...box(c, x - w / 2, y, z - 0.05, x + w / 2, y + w * 0.58, z, BLACK, L),
    poly(c, [[x - w / 2 + 0.03, y + 0.03, z - 0.052], [x + w / 2 - 0.03, y + 0.03, z - 0.052], [x + w / 2 - 0.03, y + w * 0.58 - 0.03, z - 0.052], [x - w / 2 + 0.03, y + w * 0.58 - 0.03, z - 0.052]], on ? "#4b6f93" : "#15161a")], -0.01)];
}
/** Pictures on a wall at depth z (back wall) or on a side wall at x. */
export function frames(c: Camera, rng: Rng, at: { z: number } | { x: number }, from: number, to: number, y = 1.5, n = 3): F {
  const out: F = [];
  for (let i = 0; i < n; i++) {
    const u = from + ((i + 0.5) * (to - from)) / n, w = 0.35 + rng() * 0.25, h = 0.28 + rng() * 0.25, col = hexMix("#6a7d8a", "#b39060", rng());
    const q: V3[] = "z" in at ? [[u - w / 2, y - h / 2, at.z - 0.01], [u + w / 2, y - h / 2, at.z - 0.01], [u + w / 2, y + h / 2, at.z - 0.01], [u - w / 2, y + h / 2, at.z - 0.01]]
      : [[at.x, y - h / 2, u - w / 2], [at.x, y - h / 2, u + w / 2], [at.x, y + h / 2, u + w / 2], [at.x, y + h / 2, u - w / 2]];
    out.push(poly(c, q, col, `stroke="#2a2420" stroke-width="2.5"`));
  }
  return out;
}
export function windowOn(c: Camera, at: { z: number } | { x: number }, from: number, to: number, y0: number, y1: number, sky: string, curtains: string | null, light: "day" | "night" | "dawn" | "dusk"): F {
  const q = (a: number, b: number, ya: number, yb: number, d = 0): V3[] => "z" in at ? [[a, ya, at.z - d], [b, ya, at.z - d], [b, yb, at.z - d], [a, yb, at.z - d]] : [[at.x + (at.x > 0 ? -d : d), ya, a], [at.x + (at.x > 0 ? -d : d), ya, b], [at.x + (at.x > 0 ? -d : d), yb, b], [at.x + (at.x > 0 ? -d : d), yb, a]];
  const out: F = [poly(c, q(from - 0.06, to + 0.06, y0 - 0.06, y1 + 0.06, 0.01), "#e9e4d8", `stroke="#5a5048" stroke-width="1"`), poly(c, q(from, to, y0, y1, 0.012), sky, `stroke="#5a5048" stroke-width="1.5"`)];
  const mid = (from + to) / 2;
  out.push(poly(c, q(mid - 0.02, mid + 0.02, y0, y1, 0.014), "#e9e4d8"), poly(c, q(from, to, (y0 + y1) / 2 - 0.02, (y0 + y1) / 2 + 0.02, 0.014), "#e9e4d8"));
  if (light !== "night") out.push(poly(c, q(from, to, y0, y1, 0.013), "#ffffff", `opacity="0.18"`));
  if (curtains) {
    const cw = (to - from) * 0.28;
    out.push(poly(c, q(from - 0.15, from - 0.15 + cw, y0 - 0.25, y1 + 0.15, 0.02), curtains, `stroke="${hexShade(curtains, 0.6)}" stroke-width="1"`));
    out.push(poly(c, q(to + 0.15 - cw, to + 0.15, y0 - 0.25, y1 + 0.15, 0.02), curtains, `stroke="${hexShade(curtains, 0.6)}" stroke-width="1"`));
  }
  return out;
}
export function door(c: Camera, at: { z: number } | { x: number }, u: number, col = "#6b4a33"): F {
  const w = 0.9, h = 2.05;
  const q: V3[] = "z" in at ? [[u - w / 2, 0, at.z - 0.01], [u + w / 2, 0, at.z - 0.01], [u + w / 2, h, at.z - 0.01], [u - w / 2, h, at.z - 0.01]] : [[at.x, 0, u - w / 2], [at.x, 0, u + w / 2], [at.x, h, u + w / 2], [at.x, h, u - w / 2]];
  return [poly(c, q, col, `stroke="#2a1d14" stroke-width="2"`), sprite(c, "z" in at ? [u + w * 0.35, 1.0, at.z - 0.02] : [at.x, 1.0, u + w * 0.35], (px, py, s) => `<circle cx="${r1(px)}" cy="${r1(py)}" r="${r1(Math.max(1.5, s * 0.03))}" fill="#c9a24a"/>`)];
}
export function ceilingFan(c: Camera, x: number, y: number, z: number): F {
  return [seg(c, [x, y, z], [x, y - 0.35, z], "#4a4a4a", 0.02), sprite(c, [x, y - 0.38, z], (px, py, s) => `<ellipse cx="${r1(px)}" cy="${r1(py)}" rx="${r1(s * 0.9)}" ry="${r1(s * 0.09)}" fill="#6b5a45" stroke="#2a2420" stroke-width="0.8"/><ellipse cx="${r1(px)}" cy="${r1(py)}" rx="${r1(s * 0.3)}" ry="${r1(s * 0.05)}" fill="#6b5a45" stroke="#2a2420" stroke-width="0.8" transform="rotate(25 ${r1(px)} ${r1(py)})"/><circle cx="${r1(px)}" cy="${r1(py)}" r="${r1(s * 0.08)}" fill="#3a3a3a"/>`)];
}
export function tubeLight(c: Camera, x: number, y: number, z: number): F {
  return [poly(c, [[x - 0.6, y - 0.01, z - 0.08], [x + 0.6, y - 0.01, z - 0.08], [x + 0.6, y - 0.01, z + 0.08], [x - 0.6, y - 0.01, z + 0.08]], "#f4f8ff", `stroke="#b9c2cc" stroke-width="1"`)];
}
export function board(c: Camera, z: number, x0: number, x1: number, y0: number, y1: number, col: string): F {
  return [poly(c, [[x0, y0, z - 0.01], [x1, y0, z - 0.01], [x1, y1, z - 0.01], [x0, y1, z - 0.01]], col, `stroke="#6b5a45" stroke-width="3"`)];
}
export function counter(c: Camera, L: Light, x0: number, z0: number, x1: number, z1: number, h = 0.92, col = "#d8d3c8", top = "#4a4440"): F {
  return [group([...box(c, x0, 0, z0, x1, h - 0.04, z1, col, L), ...box(c, x0 - 0.02, h - 0.04, z0 - 0.02, x1 + 0.02, h, z1 + 0.02, top, L)])];
}
export function bottles(c: Camera, x0: number, x1: number, y: number, z: number, rng: Rng): F {
  const cols = ["#3d6b3a", "#7a4a1f", "#c9c3b5", "#5a2a2a", "#2f4e6e"];
  return [sprite(c, [(x0 + x1) / 2, y, z], (px, py, s) => {
    let out = "", n = Math.max(4, Math.round((x1 - x0) / 0.12));
    for (let i = 0; i < n; i++) { const bx = px + (i - n / 2) * s * 0.12, h = s * (0.2 + rng() * 0.12); out += `<rect x="${r1(bx)}" y="${r1(py - h)}" width="${r1(s * 0.06)}" height="${r1(h)}" rx="${r1(s * 0.02)}" fill="${cols[i % cols.length]}" stroke="#151515" stroke-width="0.5"/>`; }
    return out;
  })];
}
export function fridge(c: Camera, L: Light, x0: number, z0: number, x1: number, z1: number): F {
  return [group([...box(c, x0, 0, z0, x1, 1.8, z1, "#dcdcd8", L), seg(c, [x0, 1.15, z0 - 0.003], [x1, 1.15, z0 - 0.003], "#9a9a96", 0.01), seg(c, [x1 - 0.06, 1.3, z0 - 0.01], [x1 - 0.06, 1.6, z0 - 0.01], "#7a7a76", 0.02)])];
}
export function crate(c: Camera, L: Light, x: number, z: number, s = 0.8, col = "#9a7a50"): F {
  return [group([...box(c, x - s / 2, 0, z - s / 2, x + s / 2, s, z + s / 2, col, L), seg(c, [x - s / 2, s / 2, z - s / 2 - 0.003], [x + s / 2, s / 2, z - s / 2 - 0.003], hexShade(col, 0.6), 0.015)])];
}
export function bars(c: Camera, x0: number, x1: number, z: number, h: number): F {
  const out: F = [];
  for (let x = x0; x <= x1; x += 0.14) out.push(seg(c, [x, 0, z], [x, h, z], "#3a3d40", 0.025));
  out.push(seg(c, [x0, h * 0.55, z], [x1, h * 0.55, z], "#3a3d40", 0.03));
  return out;
}

// ---- Outdoors ----
export function car(c: Camera, L: Light, x: number, z: number, col: string, along: "z" | "x" = "z"): F {
  const [lw, ld] = along === "z" ? [0.9, 2.2] : [2.2, 0.9];
  const parts: F = [
    ...box(c, x - lw, 0.25, z - ld, x + lw, 0.85, z + ld, col, L),
    ...box(c, x - lw * 0.85, 0.85, z - ld * 0.45, x + lw * 0.85, 1.35, z + ld * 0.4, hexMix(col, "#9fb6c6", 0.45), L),
  ];
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push(...box(c, x + dx * lw - 0.12 * Math.sign(dx), 0, z + dz * ld * 0.65 - 0.3, x + dx * lw + 0.02 * Math.sign(dx), 0.5, z + dz * ld * 0.65 + 0.3, "#1b1b1d", L));
  return [group(parts)];
}
export function building(c: Camera, L: Light, x0: number, z0: number, x1: number, z1: number, h: number, col: string, lit: boolean, rng: Rng, roof: "flat" | "zinc" | "gable" = "flat", glass = false): F {
  const parts: F = [...box(c, x0, 0, z0, x1, h, z1, col, L)];
  const facing: "z" | "x" = Math.abs(c.x - (x0 + x1) / 2) > Math.abs(x1 - x0) / 2 + 1 ? "x" : "z";
  const winCol = (k: number) => (glass ? hexMix("#5f7f99", "#b9d0de", k) : lit && k > 0.45 ? "#f0c86a" : hexMix("#2c3440", "#5b6c7c", k));
  const floors = Math.max(1, Math.floor(h / 3.1));
  if (facing === "z") {
    const n = Math.max(1, Math.floor((x1 - x0) / 1.6));
    for (let f = 0; f < floors; f++) for (let i = 0; i < n; i++) {
      const wx = x0 + (i + 0.5) * ((x1 - x0) / n), wy = 0.9 + f * 3.1;
      parts.push(poly(c, [[wx - 0.45, wy, z0 - 0.02], [wx + 0.45, wy, z0 - 0.02], [wx + 0.45, wy + 1.3, z0 - 0.02], [wx - 0.45, wy + 1.3, z0 - 0.02]], winCol(rng()), `stroke="#2a2a2a" stroke-width="0.6"`));
    }
  } else {
    const side = c.x < x0 ? x0 - 0.02 : x1 + 0.02, n = Math.max(1, Math.floor((z1 - z0) / 1.6));
    for (let f = 0; f < floors; f++) for (let i = 0; i < n; i++) {
      const wz = z0 + (i + 0.5) * ((z1 - z0) / n), wy = 0.9 + f * 3.1;
      parts.push(poly(c, [[side, wy, wz - 0.45], [side, wy, wz + 0.45], [side, wy + 1.3, wz + 0.45], [side, wy + 1.3, wz - 0.45]], winCol(rng()), `stroke="#2a2a2a" stroke-width="0.6"`));
    }
  }
  if (roof === "gable" || roof === "zinc") {
    const rc = roof === "zinc" ? "#8d9599" : "#7a3d2e", mx = (x0 + x1) / 2;
    parts.push(poly(c, [[x0 - 0.3, h, z0 - 0.3], [mx, h + 1.6, z0 - 0.3], [mx, h + 1.6, z1 + 0.3], [x0 - 0.3, h, z1 + 0.3]], hexShade(rc, 0.85), `stroke="#2a2a2a" stroke-width="0.8"`));
    parts.push(poly(c, [[x1 + 0.3, h, z0 - 0.3], [mx, h + 1.6, z0 - 0.3], [mx, h + 1.6, z1 + 0.3], [x1 + 0.3, h, z1 + 0.3]], rc, `stroke="#2a2a2a" stroke-width="0.8"`));
    parts.push(poly(c, [[x0 - 0.3, h, z0 - 0.3], [x1 + 0.3, h, z0 - 0.3], [mx, h + 1.6, z0 - 0.3]], hexShade(col, 0.95), `stroke="#2a2a2a" stroke-width="0.8"`));
  }
  return [group(parts)];
}
export function tree(c: Camera, x: number, z: number, h: number, rng: Rng, palm = false): F {
  if (palm) {
    const lean = (rng() - 0.5) * 1.2;
    return [group([seg(c, [x, 0, z], [x + lean, h, z], "#6b5236", 0.22), sprite(c, [x + lean, h, z], (px, py, s) => Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2, len = s * 2.2;
      return `<path d="M ${r1(px)} ${r1(py)} Q ${r1(px + Math.cos(a) * len * 0.5)} ${r1(py - len * 0.35)} ${r1(px + Math.cos(a) * len)} ${r1(py + Math.abs(Math.sin(a)) * len * 0.35)}" stroke="#3f6b33" stroke-width="${r1(s * 0.22)}" fill="none" stroke-linecap="round"/>`;
    }).join(""))])];
  }
  const blobs = Array.from({ length: 6 }, () => [rng() - 0.5, rng() - 0.5, rng()]);
  return [group([seg(c, [x, 0, z], [x, h * 0.55, z], "#5a4030", 0.25), sprite(c, [x, h * 0.75, z], (px, py, s) => blobs.map(([dx, dy, k]) => `<circle cx="${r1(px + dx * s * h * 0.45)}" cy="${r1(py + dy * s * h * 0.35)}" r="${r1(s * h * 0.28)}" fill="${hexMix("#2f5a2c", "#5d8a3f", k)}" stroke="#1f3a1c" stroke-width="0.6"/>`).join(""))])];
}
export function streetlight(c: Camera, x: number, z: number, on: boolean): F {
  return [seg(c, [x, 0, z], [x, 6, z], "#3a3d40", 0.12), seg(c, [x, 6, z], [x - Math.sign(x || 1) * 1.2, 6.2, z], "#3a3d40", 0.08),
    sprite(c, [x - Math.sign(x || 1) * 1.2, 6.1, z], (px, py, s) => `<ellipse cx="${r1(px)}" cy="${r1(py)}" rx="${r1(s * 0.3)}" ry="${r1(s * 0.1)}" fill="${on ? "#ffe2a0" : "#cfd3d6"}"/>${on ? `<circle cx="${r1(px)}" cy="${r1(py)}" r="${r1(s * 2.5)}" fill="url(#glow)" opacity="0.7"/>` : ""}`)];
}
export function container(c: Camera, L: Light, x0: number, z0: number, col: string, along: "z" | "x" = "x", y0 = 0): F {
  const [w, d] = along === "x" ? [6.1, 2.44] : [2.44, 6.1];
  const parts: F = [...box(c, x0, y0, z0, x0 + w, y0 + 2.6, z0 + d, col, L)];
  for (let i = 1; i < 12; i++) parts.push(along === "x" ? seg(c, [x0 + (i * w) / 12, y0 + 0.1, z0 - 0.01], [x0 + (i * w) / 12, y0 + 2.5, z0 - 0.01], hexShade(col, 0.7), 0.02) : seg(c, [x0 - 0.01, y0 + 0.1, z0 + (i * d) / 12], [x0 - 0.01, y0 + 2.5, z0 + (i * d) / 12], hexShade(col, 0.7), 0.02));
  return [group(parts)];
}
export function crane(c: Camera, x: number, z: number, h: number, col = "#c9a23a"): F {
  const out: F = [];
  for (const dx of [-3, 3]) for (const dz of [-3, 3]) out.push(seg(c, [x + dx, 0, z + dz], [x + dx * 0.7, h, z + dz * 0.7], col, 0.35));
  out.push(seg(c, [x - 4, h, z], [x + 18, h + 1, z], col, 0.5), seg(c, [x - 2.1, h, z - 2.1], [x - 2.1, h, z + 2.1], col, 0.35), seg(c, [x + 10, h + 0.6, z], [x + 10, h * 0.45, z], "#2a2a2a", 0.05));
  return out;
}
export function boat(c: Camera, L: Light, x: number, z: number, len: number, col: string): F {
  return [group([poly(c, [[x - len / 2, 0.6, z], [x + len / 2, 0.6, z], [x + len / 2 - 1, -0.2, z], [x - len / 2 + 0.8, -0.2, z]], col, `stroke="#1d1d1d" stroke-width="1"`),
    ...box(c, x - len * 0.15, 0.6, z - 0.8, x + len * 0.15, 2.0, z + 0.8, "#e5e2da", L)])];
}
export function stall(c: Camera, L: Light, x: number, z: number, rng: Rng): F {
  const tarp = ["#c4513b", "#2f6f9a", "#d9a63a", "#3f7a45", "#8a3a6a"][Math.floor(rng() * 5)];
  const parts: F = [...table(c, L, x, z, 2.0, 1.0, 0.85, "#8a6a48")];
  for (const dx of [-0.95, 0.95]) for (const dz of [-0.45, 0.45]) parts.push(seg(c, [x + dx, 0, z + dz], [x + dx, 2.2, z + dz], "#4a3a2a", 0.05));
  parts.push(poly(c, [[x - 1.2, 2.2, z - 0.7], [x + 1.2, 2.2, z - 0.7], [x + 1.2, 2.35, z + 0.7], [x - 1.2, 2.35, z + 0.7]], tarp, `stroke="${hexShade(tarp, 0.6)}" stroke-width="1"`));
  parts.push(sprite(c, [x, 0.88, z], (px, py, s) => Array.from({ length: 14 }, (_, i) => `<circle cx="${r1(px + ((i % 7) - 3) * s * 0.26)}" cy="${r1(py - (i > 6 ? s * 0.12 : 0))}" r="${r1(s * 0.11)}" fill="${["#d9822b", "#c43b2f", "#e6c23a", "#5d8a3a", "#a8462a"][(i * 7 + Math.floor(rng() * 5)) % 5]}" stroke="#2a1d14" stroke-width="0.4"/>`).join("")));
  return [group(parts)];
}
export function motorbike(c: Camera, x: number, z: number): F {
  return [sprite(c, [x, 0, z], (px, py, s) => `<circle cx="${r1(px - s * 0.6)}" cy="${r1(py - s * 0.3)}" r="${r1(s * 0.3)}" fill="none" stroke="#1b1b1d" stroke-width="${r1(s * 0.08)}"/><circle cx="${r1(px + s * 0.6)}" cy="${r1(py - s * 0.3)}" r="${r1(s * 0.3)}" fill="none" stroke="#1b1b1d" stroke-width="${r1(s * 0.08)}"/><path d="M ${r1(px - s * 0.6)} ${r1(py - s * 0.3)} L ${r1(px - s * 0.1)} ${r1(py - s * 0.75)} L ${r1(px + s * 0.4)} ${r1(py - s * 0.75)} L ${r1(px + s * 0.6)} ${r1(py - s * 0.3)} M ${r1(px + s * 0.4)} ${r1(py - s * 0.75)} L ${r1(px + s * 0.5)} ${r1(py - s * 1.0)}" stroke="#7a2222" stroke-width="${r1(s * 0.1)}" fill="none" stroke-linecap="round"/>`)];
}
export function generator(c: Camera, L: Light, x: number, z: number): F {
  return [group([...box(c, x - 0.45, 0, z - 0.3, x + 0.45, 0.65, z + 0.3, "#c9a23a", L), ...box(c, x - 0.3, 0.65, z - 0.15, x + 0.3, 0.75, z + 0.15, "#2a2a2a", L)])];
}
export function wires(c: Camera, x0: number, x1: number, z0: number, z1: number, h: number): F {
  return [seg(c, [x0, h, z0], [x1, h - 0.8, z1], "#1d1d1d", 0.02), seg(c, [x0, h - 0.4, z0], [x1, h - 1.1, z1], "#1d1d1d", 0.02)];
}
export function sign(c: Camera, L: Light, x: number, z: number, w: number, h: number, y: number, col: string): F {
  return [group([...box(c, x - w / 2, y, z - 0.1, x + w / 2, y + h, z, col, L), seg(c, [x - w / 3, 0, z], [x - w / 3, y, z], "#3a3d40", 0.12), seg(c, [x + w / 3, 0, z], [x + w / 3, y, z], "#3a3d40", 0.12)])];
}
export function fenceWall(c: Camera, L: Light, x0: number, x1: number, z: number, h: number, col: string, gateAt: number | null = null): F {
  const parts: F = [];
  if (gateAt === null) parts.push(...box(c, x0, 0, z, x1, h, z + 0.25, col, L));
  else { parts.push(...box(c, x0, 0, z, gateAt - 1.8, h, z + 0.25, col, L), ...box(c, gateAt + 1.8, 0, z, x1, h, z + 0.25, col, L), poly(c, [[gateAt - 1.8, 0, z], [gateAt + 1.8, 0, z], [gateAt + 1.8, h - 0.1, z], [gateAt - 1.8, h - 0.1, z]], "#3a4a5a", `stroke="#1d1d1d" stroke-width="1.2"`)); }
  return [group(parts)];
}
export function person(c: Camera, x: number, z: number, col: string, rng: Rng): F {
  const h = 1.6 + rng() * 0.2;
  return [sprite(c, [x, 0, z], (px, py, s) => {
    const H = s * h, w = s * 0.42;
    return `<g opacity="0.92"><circle cx="${r1(px)}" cy="${r1(py - H + w * 0.32)}" r="${r1(w * 0.3)}" fill="#3b2a22"/><path d="M ${r1(px - w / 2)} ${r1(py - H * 0.25)} L ${r1(px - w * 0.45)} ${r1(py - H * 0.78)} Q ${r1(px)} ${r1(py - H * 0.86)} ${r1(px + w * 0.45)} ${r1(py - H * 0.78)} L ${r1(px + w / 2)} ${r1(py - H * 0.25)} Z" fill="${col}"/><path d="M ${r1(px - w * 0.3)} ${r1(py - H * 0.27)} L ${r1(px - w * 0.22)} ${r1(py)} M ${r1(px + w * 0.3)} ${r1(py - H * 0.27)} L ${r1(px + w * 0.22)} ${r1(py)}" stroke="#2a2a30" stroke-width="${r1(w * 0.28)}" stroke-linecap="round"/></g>`;
  })];
}
export { box, poly, seg, sprite, group };
