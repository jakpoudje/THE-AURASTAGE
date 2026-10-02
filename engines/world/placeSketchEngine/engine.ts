// engines/world/placeSketchEngine — AuraSketch for places (owner, 2026-10-02: "locations and environments are the worst at
// the moment … must intelligently reflect real description of locations, environments, props"). Reads the place
// (read.ts) and builds it in 3D: a room with walls, floor, ceiling, windows and doors in true perspective, furnished for
// what it is (an office has desks, monitors, files and strip lights; a bedroom a bed, wardrobe and lamp; a bar a counter,
// bottles and stools …) plus every object the description names; or an exterior — a street of buildings, a market of
// stalls, a harbour with containers and cranes, a compound behind its wall — under the sky for the time of day, the
// weather and the film's genre. Materials, colours, condition (worn, derelict) and wealth change what is drawn.
// Deterministic (same place + view → same drawing). Not AI.
import { box, hexMix, hexShade, paint, poly, seg, sprite, type Camera, type Face, type Light } from "./camera";
import * as O from "./objects";
import { readPlace, type PlaceSpec, type PlaceType } from "./read";
import { ENGINE_VERSION } from "./version";

export type PlaceView = "establishing" | "wide" | "medium" | "detail";
export interface PlaceSketchInput {
  name: string;
  description?: string | null;
  int_ext?: string[];
  time?: string | null;
  view?: PlaceView;
  /** Look of the film (AuraSketch style id: thriller, horror, romance …); grades light and colour. */
  style?: { id: string; sat: number; warmth: number; shadow: number; key: string; shade: string; grade: number } | null;
  width: number;
  height: number;
  seed?: string;
}
export interface PlaceSketchOutput { svg: string; place: PlaceSpec; engine_version: string }

function rngFrom(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => { h += 0x6d2b79f5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const r1 = (n: number) => Math.round(n * 10) / 10;

const SKY: Record<PlaceSpec["lit"], [string, string]> = { day: ["#5d86b3", "#c4d6e6"], dawn: ["#3a3550", "#e0a070"], dusk: ["#2c2442", "#d27a52"], night: ["#060a16", "#1a2340"] };

function sizeOf(p: PlaceSpec): { w: number; d: number; h: number } {
  const tall = ["church", "mosque", "warehouse", "hall", "courtroom"].includes(p.type);
  if (p.type === "corridor") return { w: 2.4, d: 16, h: 2.8 };
  const base = p.size === "small" ? { w: 3.4, d: 3.8 } : p.size === "large" ? { w: 10, d: 13 } : { w: 5.2, d: 6.2 };
  if (["newsroom", "classroom", "church", "mosque", "hall", "warehouse", "courtroom", "restaurant", "bar"].includes(p.type)) { base.w *= 1.5; base.d *= 1.5; }
  return { ...base, h: tall ? (p.size === "large" ? 9 : 6) : p.wealth === "luxury" ? 3.3 : 2.8 };
}

// ---- Surfaces (walls, floors) with material texture and condition ----
function wallTexture(c: Camera, p: PlaceSpec, quad: [number, number, number][], u: "x" | "z", from: number, to: number, fixed: number, h: number, rng: () => number): (Face | null)[] {
  const out: (Face | null)[] = [];
  const at = (a: number, y: number): [number, number, number] => (u === "x" ? [a, y, fixed] : [fixed, y, a]);
  const joint = hexShade(p.wall.colour, 0.7);
  if (p.wall.mat === "brick") {
    for (let y = 0.075, row = 0; y < h; y += 0.075 * 2, row++) {
      out.push(O.seg(c, at(from, y), at(to, y), joint, 0.006, `opacity="0.6"`));
      for (let a = from + (row % 2 ? 0.11 : 0); a < to; a += 0.22) out.push(O.seg(c, at(a, y), at(a, Math.min(h, y + 0.15)), joint, 0.005, `opacity="0.45"`));
    }
  } else if (p.wall.mat === "wood") {
    for (let a = from + 0.3; a < to; a += 0.3) out.push(O.seg(c, at(a, 0), at(a, h), hexShade(p.wall.colour, 0.75), 0.006, `opacity="0.7"`));
  } else if (p.wall.mat === "tile") {
    for (let y = 0.25; y < Math.min(h, 1.6); y += 0.25) out.push(O.seg(c, at(from, y), at(to, y), "#ffffff", 0.006, `opacity="0.5"`));
    for (let a = from + 0.25; a < to; a += 0.25) out.push(O.seg(c, at(a, 0), at(a, 1.6), "#ffffff", 0.006, `opacity="0.4"`));
  } else if (p.wall.mat === "concrete") {
    for (let i = 0; i < 6; i++) { const a = from + rng() * (to - from), y = rng() * h; out.push(O.seg(c, at(a, y), at(a + 0.4, y + 0.02), hexShade(p.wall.colour, 0.8), 0.01, `opacity="0.35"`)); }
  } else if (p.wall.mat === "metal" || p.wall.mat === "zinc") {
    for (let a = from + 0.15; a < to; a += 0.15) out.push(O.seg(c, at(a, 0), at(a, h), hexShade(p.wall.colour, 0.75), 0.008, `opacity="0.6"`));
  }
  // Skirting, and wear: stains, peeling patches and cracks on worn or derelict walls.
  out.push(O.seg(c, at(from, 0.08), at(to, 0.08), hexShade(p.wall.colour, 0.6), 0.03));
  if (p.condition === "worn" || p.condition === "derelict") {
    const n = p.condition === "derelict" ? 9 : 4;
    for (let i = 0; i < n; i++) {
      const a = from + rng() * (to - from), y = 0.4 + rng() * (h - 0.6), s = 0.2 + rng() * 0.5;
      out.push(O.poly(c, [at(a, y), at(a + s, y + 0.05), at(a + s * 0.8, y - s * 0.6), at(a + 0.05, y - s * 0.5)], hexShade(p.wall.colour, 0.72), `opacity="0.35"`));
      if (i % 2 === 0) out.push(O.seg(c, at(a, y), at(a + s * 0.3, y - s * 0.4), "#3a3028", 0.008, `opacity="0.5"`));
    }
  }
  void quad;
  return out;
}
function floorTexture(c: Camera, p: PlaceSpec, w: number, d: number): (Face | null)[] {
  const out: (Face | null)[] = [];
  const line = hexShade(p.floor.colour, 0.72);
  if (p.floor.mat === "tile" || p.floor.mat === "marble") {
    const s = p.floor.mat === "marble" ? 0.8 : 0.5;
    for (let x = -w / 2 + s; x < w / 2; x += s) out.push(O.seg(c, [x, 0.002, 0], [x, 0.002, d], line, 0.006, `opacity="0.55"`));
    for (let z = s; z < d; z += s) out.push(O.seg(c, [-w / 2, 0.002, z], [w / 2, 0.002, z], line, 0.006, `opacity="0.55"`));
  } else if (p.floor.mat === "wood") {
    for (let x = -w / 2 + 0.18; x < w / 2; x += 0.18) out.push(O.seg(c, [x, 0.002, 0], [x, 0.002, d], line, 0.005, `opacity="0.5"`));
  } else if (p.floor.mat === "concrete") {
    for (let z = 2; z < d; z += 3) out.push(O.seg(c, [-w / 2, 0.002, z], [w / 2, 0.002, z], line, 0.008, `opacity="0.4"`));
  }
  return out;
}

// ---- Interiors ----
function interior(c: Camera, p: PlaceSpec, view: PlaceView, rng: () => number): string {
  const { w, d, h } = sizeOf(p);
  const night = p.lit === "night";
  const L: Light = { x: w / 2, z: d * 0.5, key: night ? 0.72 : 1 };
  const faces: (Face | null)[] = [];
  const wallCol = p.wall.colour, sideCol = hexShade(wallCol, 0.88), ceilCol = hexShade(hexMix(wallCol, "#ffffff", 0.3), 0.92);
  // Room shell: back wall, two side walls, floor, ceiling (painted first — they are the farthest).
  const shell = [
    O.poly(c, [[-w / 2, 0, d], [w / 2, 0, d], [w / 2, h, d], [-w / 2, h, d]], wallCol),
    O.poly(c, [[-w / 2, 0, -1], [-w / 2, 0, d], [-w / 2, h, d], [-w / 2, h, -1]], hexShade(sideCol, 0.95)),
    O.poly(c, [[w / 2, 0, -1], [w / 2, 0, d], [w / 2, h, d], [w / 2, h, -1]], sideCol),
    O.poly(c, [[-w / 2, 0, -1], [w / 2, 0, -1], [w / 2, 0, d], [-w / 2, 0, d]], p.floor.colour),
    O.poly(c, [[-w / 2, h, -1], [w / 2, h, -1], [w / 2, h, d], [-w / 2, h, d]], ceilCol),
  ].map((f) => f && { ...f, depth: 1e6 + f.depth });
  const shellSvg = paint(shell);
  const tex = paint([...floorTexture(c, p, w, d), ...wallTexture(c, p, [], "x", -w / 2, w / 2, d - 0.005, h, rng), ...wallTexture(c, p, [], "z", -1, d, -w / 2 + 0.005, h, rng), ...wallTexture(c, p, [], "z", -1, d, w / 2 - 0.005, h, rng)]);
  const sky = night ? "#18213a" : p.lit === "dawn" ? "#e0b48a" : p.lit === "dusk" ? "#c98a6a" : "#bcd3e6";
  const has = (o: string) => p.objects.includes(o);
  const curt = p.wealth === "poor" ? "#b8a888" : hexMix("#7a3a4a", "#3a5a6a", rng());

  // A window on the right wall lets the key light in (a shaft across the floor by day).
  const winZ0 = d * 0.35, winZ1 = d * 0.35 + Math.min(2.2, d * 0.3);
  if (!["cell", "interrogation", "corridor", "studio", "car", "bus"].includes(p.type) || has("window")) {
    faces.push(...O.windowOn(c, { x: w / 2 }, winZ0, winZ1, 1.0, Math.min(h - 0.4, 2.3), sky, has("curtains") || ["bedroom", "living_room", "hotel_room"].includes(p.type) ? curt : null, p.lit));
    if (!night) faces.push(O.poly(c, [[w / 2, 2.2, winZ0], [w / 2, 2.2, winZ1], [w / 2 - 2.6, 0.003, winZ1 + 0.4], [w / 2 - 2.6, 0.003, winZ0 + 0.4]], "#fff6dc", `opacity="${p.lit === "day" ? 0.16 : 0.22}"`));
  }
  if (p.type !== "car" && p.type !== "bus") faces.push(...O.door(c, { x: -w / 2 + 0.01 }, d * 0.75, p.wealth === "luxury" ? "#4e3424" : "#7a5a40"));

  const T: PlaceType = p.type;
  const zc = d * 0.55;
  switch (T) {
    case "office": case "boardroom": case "newsroom": {
      if (T === "boardroom") {
        faces.push(...O.table(c, L, 0, zc, Math.min(w * 0.6, 4), 1.3, 0.75, p.wealth === "luxury" ? "#3e2a1e" : O.WOOD));
        for (let i = 0; i < 4; i++) { const x = -1.3 + i * 0.86; faces.push(...O.chair(c, L, x, zc - 0.95, 1, O.BLACK, true), ...O.chair(c, L, x, zc + 0.95, -1, O.BLACK, true)); }
        faces.push(...O.tv(c, L, 0, 1.1, d - 0.01, 1.8, true));
      } else {
        const rows = T === "newsroom" ? 2 : 1, cols = T === "newsroom" ? 3 : 1;
        for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
          const x = cols === 1 ? -0.5 : -w / 3 + k * (w / 3), z = cols === 1 ? zc : d * 0.35 + r * d * 0.3;
          faces.push(...O.desk(c, L, x, z, 1.4, 0.7), ...O.monitor(c, L, x, 0.75, z + 0.12), ...O.chair(c, L, x, z - 0.65, 1, O.BLACK, true), ...O.papers(c, x - 0.45, 0.75, z - 0.05, rng));
          if (rng() < 0.5) faces.push(...O.lamp(c, L, x + 0.55, 0.75, z + 0.15, night));
        }
        if (T === "newsroom") { faces.push(...O.tv(c, L, -w / 4, 1.7, d - 0.01, 1.2), ...O.tv(c, L, w / 4, 1.7, d - 0.01, 1.2)); faces.push(...O.frames(c, rng, { z: d }, -0.3, 0.3, 2.55, 1)); }
        else faces.push(...O.bookshelf(c, L, w / 4, d, 1.6, 2.0, rng), ...O.cabinet(c, L, -w / 2 + 0.05, d * 0.25, -w / 2 + 0.55, d * 0.25 + 0.6), ...O.frames(c, rng, { z: d }, -w / 2 + 0.5, -0.4, 1.6, 2));
      }
      faces.push(...O.plant(c, L, w / 2 - 0.45, d - 0.45, 1.1, rng));
      break;
    }
    case "classroom": {
      faces.push(...O.board(c, d, -w / 3, w / 3, 0.95, 2.1, p.objects.includes("board") && /white/i.test(p.evidence.map((e) => e.from).join(" ")) ? "#f0f0ec" : "#2f4a3a"));
      faces.push(...O.desk(c, L, w / 3, d - 1.2, 1.3, 0.65));
      for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) { const x = -w / 2 + 1.0 + k * ((w - 2) / 3), z = 1.6 + r * 1.3; faces.push(...O.desk(c, L, x, z, 0.8, 0.5, "#9a7a50"), ...O.chair(c, L, x, z - 0.5, 1)); }
      break;
    }
    case "hospital": {
      for (let i = 0; i < (p.size === "small" ? 1 : 2); i++) {
        const x = -w / 4 + i * (w / 2);
        faces.push(...O.bed(c, L, x, d - 0.1, 1.0, 2.1, "#9fb7c4", true), O.seg(c, [x + 0.75, 0, d - 0.6], [x + 0.75, 1.9, d - 0.6], "#9aa0a6", 0.025), O.sprite(c, [x + 0.75, 1.85, d - 0.6], (px, py, s) => `<rect x="${r1(px - s * 0.08)}" y="${r1(py)}" width="${r1(s * 0.16)}" height="${r1(s * 0.24)}" rx="${r1(s * 0.03)}" fill="#e6f0f2" stroke="#7a8a90" stroke-width="0.6"/>`));
        faces.push(...O.monitor(c, L, x - 0.7, 1.2, d - 0.2, "#4fd08a"));
      }
      faces.push(O.seg(c, [-w / 2, h - 0.2, d * 0.5], [w / 2, h - 0.2, d * 0.5], "#9aa0a6", 0.02));
      break;
    }
    case "church": case "mosque": case "hall": case "courtroom": {
      if (T === "mosque") {
        for (let k = 0; k < 6; k++) faces.push(O.seg(c, [-w / 2, 0.003, 1 + k * 1.2], [w / 2, 0.003, 1 + k * 1.2], "#c9a24a", 0.03, `opacity="0.7"`));
        faces.push(O.poly(c, [[-0.8, 0, d - 0.01], [0.8, 0, d - 0.01], [0.8, 2.4, d - 0.01], [0, 3.2, d - 0.01], [-0.8, 2.4, d - 0.01]], "#3f6b6a", `stroke="#c9a24a" stroke-width="3"`));
      } else {
        const front = T === "courtroom" ? "#4e3424" : "#6b4a33";
        faces.push(...O.counter(c, L, -1.5, d - 2.2, 1.5, d - 1.4, T === "courtroom" ? 1.3 : 1.0, front, hexShade(front, 0.8)));
        if (T === "church") faces.push(O.seg(c, [0, 1.6, d - 0.02], [0, 3.6, d - 0.02], "#c9a24a", 0.08), O.seg(c, [-0.5, 3.0, d - 0.02], [0.5, 3.0, d - 0.02], "#c9a24a", 0.08));
        for (let r = 0; r < 5; r++) for (const side of [-1, 1]) {
          const z = 1.2 + r * ((d - 4) / 5), x0 = side < 0 ? -w / 2 + 0.6 : 0.6, x1 = side < 0 ? -0.6 : w / 2 - 0.6;
          faces.push(...(T === "hall" ? [x0 + 0.4, (x0 + x1) / 2, x1 - 0.4].flatMap((x) => O.chair(c, L, x, z, 1)) : O.counter(c, L, x0, z, x1, z + 0.45, 0.48, O.DARK_WOOD, O.DARK_WOOD)));
        }
        for (const side of [-1, 1]) for (let k = 0; k < 3; k++) faces.push(...O.windowOn(c, { x: side * w / 2 }, 2 + k * (d / 3.2), 2 + k * (d / 3.2) + 1.0, 2.0, h - 1.0, night ? "#1a2340" : "#d9c7a0", null, p.lit));
      }
      break;
    }
    case "bar": case "restaurant": {
      faces.push(...O.counter(c, L, -w / 2 + 0.5, d - 1.3, w / 2 - 1.5, d - 0.7, 1.05, "#5a3a28", "#2e2420"));
      faces.push(...O.bottles(c, -w / 2 + 0.7, w / 2 - 1.7, 1.6, d - 0.05, rng), ...O.bottles(c, -w / 2 + 0.7, w / 2 - 1.7, 2.1, d - 0.05, rng));
      if (T === "bar") for (let i = 0; i < 4; i++) faces.push(...O.chair(c, L, -w / 2 + 1.2 + i * 0.9, d - 1.75, -1, "#2a2a2a"));
      for (let i = 0; i < (T === "restaurant" ? 4 : 2); i++) { const x = -w / 3 + (i % 2) * (w / 2.2), z = 1.6 + Math.floor(i / 2) * 1.8; faces.push(...O.table(c, L, x, z, 0.9, 0.9, 0.74, O.WOOD, T === "restaurant" ? "#e8e2d6" : undefined), ...O.chair(c, L, x - 0.6, z, 1), ...O.chair(c, L, x + 0.6, z, -1)); }
      if (T === "bar" || p.practical === "neon") faces.push(O.sprite(c, [0, 2.4, d - 0.03], (px, py, s) => `<rect x="${r1(px - s * 0.8)}" y="${r1(py - s * 0.15)}" width="${r1(s * 1.6)}" height="${r1(s * 0.3)}" rx="${r1(s * 0.15)}" fill="none" stroke="#ff4fa0" stroke-width="${r1(s * 0.05)}"/><rect x="${r1(px - s * 0.8)}" y="${r1(py - s * 0.15)}" width="${r1(s * 1.6)}" height="${r1(s * 0.3)}" rx="${r1(s * 0.15)}" fill="none" stroke="#ff4fa0" stroke-width="${r1(s * 0.2)}" opacity="0.25"/>`));
      break;
    }
    case "shop": {
      for (const side of [-1, 1]) faces.push(...O.bookshelf(c, L, side * (w / 2) - side * 0.01, d / 2, d * 0.8, 2.0, () => rng() * 0.6 + 0.2, "x"));
      faces.push(...O.counter(c, L, -1.2, 1.8, 1.2, 2.4, 0.95, "#8a6a48"));
      break;
    }
    case "cell": case "interrogation": {
      if (T === "cell") { faces.push(...O.bed(c, L, -w / 2 + 0.5, d - 0.05, 0.8, 1.9, "#6b6b5a")); faces.push(...O.bars(c, -w / 2, w / 2, 0.4, h)); }
      else { faces.push(...O.table(c, L, 0, zc, 1.2, 0.8, 0.74, "#6b6b68"), ...O.chair(c, L, 0, zc - 0.7, 1, "#4a4a48"), ...O.chair(c, L, 0, zc + 0.7, -1, "#4a4a48")); faces.push(O.seg(c, [0, h, zc], [0, 1.9, zc], "#2a2a2a", 0.01), O.sprite(c, [0, 1.85, zc], (px, py, s) => `<path d="M ${r1(px - s * 0.25)} ${r1(py)} L ${r1(px + s * 0.25)} ${r1(py)} L ${r1(px + s * 0.12)} ${r1(py - s * 0.15)} L ${r1(px - s * 0.12)} ${r1(py - s * 0.15)} Z" fill="#3a3a3a"/><circle cx="${r1(px)}" cy="${r1(py + s * 0.6)}" r="${r1(s * 1.6)}" fill="url(#glow)" opacity="0.6"/>`)); faces.push(O.poly(c, [[w / 2 - 0.01, 1.0, d * 0.3], [w / 2 - 0.01, 1.0, d * 0.7], [w / 2 - 0.01, 2.0, d * 0.7], [w / 2 - 0.01, 2.0, d * 0.3]], "#1b2128", `stroke="#4a4a4a" stroke-width="3"`)); }
      break;
    }
    case "warehouse": {
      for (let i = 0; i < 7; i++) { const x = -w / 2 + 1 + rng() * (w - 2), z = 2 + rng() * (d - 3); faces.push(...O.crate(c, L, x, z, 0.8 + rng() * 0.6)); if (rng() < 0.4) faces.push(...O.crate(c, L, x, z, 0.7).map((f) => f && { ...f, svg: f.svg.replace(/(points="[^"]*")/g, (m) => m) })); }
      for (let k = 0; k < 4; k++) faces.push(O.seg(c, [-w / 2, h - 0.3, 2 + k * (d / 4)], [w / 2, h - 0.3, 2 + k * (d / 4)], "#5a5f62", 0.15));
      break;
    }
    case "corridor": {
      for (let k = 0; k < 5; k++) for (const side of [-1, 1]) faces.push(...O.door(c, { x: side * (w / 2 - 0.01) }, 2 + k * 3 + (side > 0 ? 1.5 : 0)));
      break;
    }
    case "studio": {
      faces.push(...O.desk(c, L, 0, zc, 2.2, 0.8, "#2a2c32"), ...O.chair(c, L, -0.5, zc + 0.6, -1, O.BLACK, true), ...O.chair(c, L, 0.5, zc + 0.6, -1, O.BLACK, true));
      faces.push(...O.tv(c, L, 0, 1.2, d - 0.01, 2.4, true), ...O.monitor(c, L, -0.6, 0.75, zc - 0.1, "#7ab0e0"));
      break;
    }
    case "kitchen": {
      faces.push(...O.counter(c, L, -w / 2 + 0.05, d - 0.65, w / 2 - 1.0, d - 0.05), ...O.fridge(c, L, w / 2 - 0.85, d - 0.75, w / 2 - 0.1, d - 0.05));
      faces.push(...O.counter(c, L, -w / 2 + 0.05, 1.5, -w / 2 + 0.65, d - 0.65));
      faces.push(...box(c, -w / 2 + 0.05, 1.5, d - 0.4, w / 2 - 1.0, 2.2, d - 0.05, hexMix(p.wall.colour, "#8a6a48", 0.5), L));
      faces.push(O.sprite(c, [-0.4, 0.93, d - 0.35], (px, py, s) => `<circle cx="${r1(px - s * 0.15)}" cy="${r1(py)}" r="${r1(s * 0.1)}" fill="none" stroke="#2a2a2a" stroke-width="${r1(s * 0.03)}"/><circle cx="${r1(px + s * 0.15)}" cy="${r1(py)}" r="${r1(s * 0.1)}" fill="none" stroke="#2a2a2a" stroke-width="${r1(s * 0.03)}"/>`));
      faces.push(...O.table(c, L, 0.4, 1.8, 1.0, 0.8), ...O.chair(c, L, 0.4, 1.2, 1));
      break;
    }
    case "bedroom": case "hotel_room": {
      faces.push(...O.bed(c, L, -0.2, d - 0.05, p.wealth === "poor" ? 1.0 : 1.6, 2.0, hexMix("#5a6a8a", "#8a5a6a", rng())));
      faces.push(...O.table(c, L, -1.4, d - 0.35, 0.45, 0.45, 0.55, O.DARK_WOOD), ...O.lamp(c, L, -1.4, 0.55, d - 0.35, night));
      if (T === "bedroom") faces.push(...O.wardrobe(c, L, -w / 2 + 0.05, 0.9, -w / 2 + 0.65, 2.1));
      else faces.push(...O.desk(c, L, w / 2 - 0.5, 1.4, 1.0, 0.5), ...O.tv(c, L, w / 2 - 0.5, 0.77, 1.6, 0.8));
      faces.push(...O.rug(c, -0.2, d - 2.4, 2.2, 1.4, hexMix("#7a3a34", "#3a4a6a", rng())), ...O.frames(c, rng, { z: d }, -0.9, 0.5, 1.75, 1));
      break;
    }
    case "car": case "bus": {
      // From the back seat: dashboard, windscreen with the road outside, wheel and the front seats.
      faces.length = 0;
      const out = `<rect width="${c.W}" height="${c.H}" fill="url(#skyg)"/><polygon points="${r1(c.W * 0.2)},${r1(c.H * 0.62)} ${r1(c.W * 0.8)},${r1(c.H * 0.62)} ${r1(c.W * 0.53)},${r1(c.H * 0.42)} ${r1(c.W * 0.47)},${r1(c.H * 0.42)}" fill="#4a4a4e"/>`;
      const car = `<path d="M 0 ${r1(c.H * 0.18)} Q ${r1(c.W * 0.5)} ${r1(c.H * 0.05)} ${c.W} ${r1(c.H * 0.18)} L ${c.W} 0 L 0 0 Z" fill="#2a2a2e"/><rect x="0" y="0" width="${r1(c.W * 0.08)}" height="${c.H}" fill="#2a2a2e"/><rect x="${r1(c.W * 0.92)}" y="0" width="${r1(c.W * 0.08)}" height="${c.H}" fill="#2a2a2e"/>
<path d="M 0 ${r1(c.H * 0.6)} Q ${r1(c.W * 0.5)} ${r1(c.H * 0.52)} ${c.W} ${r1(c.H * 0.6)} L ${c.W} ${c.H} L 0 ${c.H} Z" fill="#1f1f22"/>
<circle cx="${r1(c.W * 0.32)}" cy="${r1(c.H * 0.66)}" r="${r1(c.H * 0.14)}" fill="none" stroke="#111" stroke-width="${r1(c.H * 0.025)}"/>
<path d="M ${r1(c.W * 0.05)} ${c.H} L ${r1(c.W * 0.1)} ${r1(c.H * 0.68)} Q ${r1(c.W * 0.22)} ${r1(c.H * 0.6)} ${r1(c.W * 0.36)} ${r1(c.H * 0.7)} L ${r1(c.W * 0.4)} ${c.H} Z" fill="#3a3a40"/><path d="M ${r1(c.W * 0.6)} ${c.H} L ${r1(c.W * 0.64)} ${r1(c.H * 0.7)} Q ${r1(c.W * 0.78)} ${r1(c.H * 0.6)} ${r1(c.W * 0.9)} ${r1(c.H * 0.68)} L ${r1(c.W * 0.95)} ${c.H} Z" fill="#3a3a40"/>`;
      return out + car;
    }
    default: { // living room
      faces.push(...O.sofa(c, L, -0.3, d * 0.42, Math.min(2.2, w * 0.45), 1, hexMix(O.FABRIC, "#8a6a4a", rng())));
      faces.push(...O.table(c, L, -0.3, d * 0.62, 1.0, 0.55, 0.42, O.WOOD), ...O.tv(c, L, -0.3, 0.55, d - 0.02, 1.3, !night || rng() < 0.6));
      faces.push(...box(c, -1.1, 0, d - 0.45, 0.5, 0.55, d - 0.02, O.DARK_WOOD, L));
      faces.push(...O.sofa(c, L, w / 2 - 0.8, d * 0.6, 0.9, -1, hexMix(O.FABRIC, "#6a4a3a", 0.6)));
      faces.push(...O.rug(c, -0.3, d * 0.58, 2.6, 1.8, hexMix("#7a3a34", "#4a5a3a", rng())), ...O.frames(c, rng, { x: -w / 2 + 0.01 }, d * 0.25, d * 0.6, 1.6, 2), ...O.plant(c, L, w / 2 - 0.45, d - 0.45, 1.2, rng));
      if (p.wealth !== "luxury") faces.push(...O.ceilingFan(c, -0.3, h, d * 0.5));
    }
  }
  // What the description names that the type didn't already include.
  if (has("ceiling_fan") && !["living_room"].includes(T)) faces.push(...O.ceilingFan(c, 0, h, d * 0.5));
  if (has("laptop")) faces.push(...O.laptop(c, L, -0.2, 0.75, zc));
  if (has("bookshelf") && !["office", "shop"].includes(T)) faces.push(...O.bookshelf(c, L, -w / 4, d, 1.4, 1.9, rng));
  if (has("cabinet") && !["office"].includes(T)) faces.push(...O.cabinet(c, L, w / 2 - 0.65, d - 0.6, w / 2 - 0.05, d - 0.05));
  if (has("plant") && !["office", "newsroom", "boardroom", "living_room"].includes(T)) faces.push(...O.plant(c, L, -w / 2 + 0.45, d - 0.45, 1, rng));
  if (has("frames") && !["living_room", "bedroom", "hotel_room", "office"].includes(T)) faces.push(...O.frames(c, rng, { z: d }, -w / 3, w / 3, 1.7, 3));
  if (has("tv") && !["living_room", "boardroom", "studio", "newsroom", "hotel_room"].includes(T)) faces.push(...O.tv(c, L, w / 4, 1.5, d - 0.02, 1.0));
  if (has("clock")) faces.push(O.sprite(c, [0, h - 0.6, d - 0.02], (px, py, s) => `<circle cx="${r1(px)}" cy="${r1(py)}" r="${r1(s * 0.16)}" fill="#f2efe8" stroke="#2a2a2a" stroke-width="${r1(s * 0.025)}"/><path d="M ${r1(px)} ${r1(py)} L ${r1(px)} ${r1(py - s * 0.1)} M ${r1(px)} ${r1(py)} L ${r1(px + s * 0.07)} ${r1(py)}" stroke="#2a2a2a" stroke-width="${r1(s * 0.02)}"/>`));
  if (has("rug") && !["living_room", "bedroom", "hotel_room"].includes(T)) faces.push(...O.rug(c, 0, d * 0.5, 2.0, 1.4));
  if (p.practical === "fluorescent") for (let z = 1.5; z < d; z += 2.5) faces.push(...O.tubeLight(c, 0, h, z));
  if (p.practical === "candle") faces.push(O.sprite(c, [0.5, 0.78, zc], (px, py, s) => `<rect x="${r1(px - s * 0.02)}" y="${r1(py - s * 0.1)}" width="${r1(s * 0.04)}" height="${r1(s * 0.1)}" fill="#efe6cf"/><ellipse cx="${r1(px)}" cy="${r1(py - s * 0.13)}" rx="${r1(s * 0.015)}" ry="${r1(s * 0.03)}" fill="#ffcf5a"/><circle cx="${r1(px)}" cy="${r1(py - s * 0.13)}" r="${r1(s * 1.2)}" fill="url(#glow)" opacity="0.9"/>`));
  if (p.practical === "lamp" && !["bedroom", "hotel_room", "office"].includes(T)) faces.push(...O.lamp(c, L, w / 2 - 0.5, 0, 1.0, true, true));
  void view;
  return shellSvg + tex + paint(faces);
}

// ---- Exteriors ----
function exterior(c: Camera, p: PlaceSpec, view: PlaceView, rng: () => number): string {
  const night = p.lit === "night";
  const L: Light = { x: p.lit === "dusk" ? -40 : 40, z: 60, key: night ? 0.55 : 1 };
  const faces: (Face | null)[] = [];
  const ground = (col: string, far = 400) => O.poly(c, [[-far, 0, 0], [far, 0, 0], [far, 0, far], [-far, 0, far]], col);
  const bld = (rng2: () => number) => hexMix(p.wealth === "luxury" ? "#8a9aa8" : p.condition === "worn" || p.wealth === "poor" ? "#a89878" : "#c8bba0", "#e0d8c8", rng2());
  const T = p.type;
  let base = "";
  switch (T) {
    case "harbour": case "beach": {
      // Quay (or sand) in front, the water beyond; containers stacked to one side, a crane, ships out on the water.
      const shore = T === "beach" ? 16 : 22;
      base = paint([ground(T === "beach" ? "#d8c49a" : "#7d7b75")]);
      const water = O.poly(c, [[-400, 0.001, shore], [400, 0.001, shore], [400, 0.001, 400], [-400, 0.001, 400]], night ? "#0e1a2c" : "#3f6f8a");
      faces.push(water && { ...water, depth: 1e6 });
      for (let k = 0; k < 22; k++) { const z = shore + 1 + k * k * 0.7; faces.push(O.seg(c, [-70 + rng() * 50, 0.01, z], [-20 + rng() * 90, 0.01, z], night ? "#2a3c55" : "#8fb4c8", 0.06, `opacity="0.5"`)); }
      if (T === "harbour") {
        faces.push(O.seg(c, [-80, 0.05, shore], [80, 0.05, shore], "#4a4844", 0.3));
        const cols = ["#b5462e", "#2f5f8a", "#3f7a45", "#c9a23a", "#6a6f75", "#8a3a4a"];
        for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) for (let lvl = 0; lvl < (i % 2 ? 3 : 2); lvl++) faces.push(...O.container(c, L, -34 + i * 6.4, 9 + j * 3.0, cols[(i * 3 + j + lvl * 2) % 6], "x", lvl * 2.6));
        // A far quay across the water with its cranes and container stacks, so the cranes read whole at a distance.
        const fq = shore + 38;
        faces.push(...O.box(c, -10, 0, fq, 120, 1.2, fq + 10, "#77756f", L));
        faces.push(...O.crane(c, 10, fq + 5, 30), ...O.crane(c, 36, fq + 5, 30, "#b5462e"), ...O.crane(c, 62, fq + 5, 30));
        for (let i = 0; i < 6; i++) faces.push(...O.container(c, L, 70 + i * 6.4, fq + 2, cols[i % 6], "x", 1.2));
        faces.push(...O.boat(c, L, -6, shore + 16, 30, "#7a2a2a"), ...O.boat(c, L, 40, shore + 30, 50, "#2f4e6e"), ...O.boat(c, L, -50, shore + 70, 30, "#3f3f45"));
        for (let i = 0; i < 8; i++) faces.push(O.sprite(c, [-20 + i * 6, 0, shore - 0.6], (px, py, sc) => `<rect x="${r1(px - sc * 0.15)}" y="${r1(py - sc * 0.5)}" width="${r1(sc * 0.3)}" height="${r1(sc * 0.5)}" rx="${r1(sc * 0.1)}" fill="#2a2a2a"/>`));
        for (let i = 0; i < 3; i++) faces.push(...O.person(c, 2 + i * 2.5, 6 + i * 3, i % 2 ? "#d9a63a" : "#c4513b", rng));
      } else {
        for (let i = 0; i < 5; i++) faces.push(...O.tree(c, -14 + i * 7 + rng() * 2, 4 + rng() * 6, 7 + rng() * 3, rng, true));
        for (let k = 0; k < 3; k++) faces.push(O.seg(c, [-80, 0.02, shore + 0.5 + k * 1.5], [80, 0.02, shore + 0.5 + k * 1.5], "#f2f2ec", 0.12, `opacity="0.7"`));
      }
      break;
    }
    case "market": {
      base = paint([ground(p.condition === "kept" ? "#7a7064" : "#8a7458")]);
      for (let r = 0; r < 4; r++) for (const side of [-1, 1]) faces.push(...O.stall(c, L, side * 3.2, 4 + r * 3.4, rng));
      for (let i = 0; i < 9; i++) faces.push(...O.person(c, (rng() - 0.5) * 3.5, 3 + rng() * 12, hexMix("#c4513b", "#2f5f8a", rng()), rng));
      for (const side of [-1, 1]) for (let k = 0; k < 4; k++) faces.push(...O.building(c, L, side * 7, 2 + k * 8, side * 7 + side * 6, 8 + k * 8, 3 + Math.floor(rng() * 3) * 3, bld(rng), night, rng, p.wealth === "poor" ? "zinc" : "flat"));
      break;
    }
    case "forest": case "field": case "park": case "village": {
      base = paint([ground(T === "field" ? "#8a9a4a" : T === "village" ? "#9a7a55" : "#4f6a38")]);
      const n = T === "forest" ? 40 : T === "park" ? 12 : 8;
      for (let i = 0; i < n; i++) { const x = (rng() - 0.5) * (T === "forest" ? 40 : 60), z = 4 + rng() * 50; if (T !== "forest" && Math.abs(x) < 3) continue; faces.push(...O.tree(c, x, z, 6 + rng() * 6, rng, T === "village" && rng() < 0.4)); }
      if (T === "village") for (let i = 0; i < 6; i++) faces.push(...O.building(c, L, -16 + i * 6, 10 + (i % 2) * 6, -12 + i * 6, 14 + (i % 2) * 6, 2.6, hexMix("#b08a5a", "#c9b08a", rng()), night, rng, "zinc"));
      if (T === "field") for (let x = -30; x <= 30; x += 2.5) faces.push(O.seg(c, [x, 0, 6], [x, 1.2, 6], "#6b5236", 0.06)), faces.push(O.seg(c, [-30, 1.0, 6], [30, 1.0, 6], "#6b5236", 0.04));
      if (T === "park") for (let i = 0; i < 3; i++) faces.push(...O.counter(c, L, -3 + i * 3, 6 + i * 2, -2 + i * 3, 6.5 + i * 2, 0.45, "#7a5638", "#7a5638"));
      if (T === "forest") faces.push(O.poly(c, [[-1.2, 0.01, 0], [1.2, 0.01, 0], [0.4, 0.01, 60], [-0.4, 0.01, 60]], "#8a7458", `opacity="0.8"`));
      break;
    }
    case "rooftop": {
      base = paint([]);
      for (let i = 0; i < 18; i++) faces.push(...O.building(c, L, -90 + i * 10 + rng() * 3, 40 + rng() * 40, -84 + i * 10, 46 + rng() * 40, 10 + rng() * 40, bld(rng), night, rng, "flat", rng() < 0.3));
      faces.push(...O.box(c, -20, -1, 0, 20, 0, 8, "#7d7b75", L), ...O.box(c, -20, 0, 7.8, 20, 1.1, 8.1, "#8a8882", L));
      faces.push(...O.box(c, 3, 0, 3, 4.6, 1.8, 4.6, "#4f6e94", L));
      break;
    }
    case "compound": case "building_ext": {
      base = paint([ground(p.wealth === "poor" ? "#9a7a55" : "#8a8a80")]);
      const h = T === "building_ext" ? (p.size === "large" ? 15 : 9) : p.wealth === "luxury" ? 7 : 3.4;
      faces.push(...O.building(c, L, -7, 14, 7, 24, h, bld(rng), night, rng, T === "compound" ? (p.wealth === "poor" ? "zinc" : "gable") : "flat", p.wealth === "luxury"));
      if (T === "compound") faces.push(...O.fenceWall(c, L, -16, 16, 8, 2.3, hexMix("#c8bba0", "#e0d8c8", rng()), 0), ...O.generator(c, L, 9, 6), ...O.tree(c, -11, 11, 8, rng, rng() < 0.5));
      else faces.push(...O.sign(c, L, 0, 12.5, 6, 1.0, 3.4, "#2f4e6e"));
      faces.push(...O.car(c, L, 5, 4, hexMix("#8a2a2a", "#2a3a5a", rng()), "x"));
      break;
    }
    default: { // street, alley, highway
      const road = T === "highway" ? 14 : T === "alley" ? 3 : 8;
      base = paint([ground(p.condition === "worn" || p.wealth === "poor" ? "#8a7a60" : "#77736a")]);
      faces.push(O.poly(c, [[-road / 2, 0.005, 0], [road / 2, 0.005, 0], [road / 2, 0.005, 400], [-road / 2, 0.005, 400]], night ? "#2a2a2e" : "#4a4a4e"));
      if (T !== "alley") for (let z = 2; z < 140; z += 6) faces.push(O.poly(c, [[-0.08, 0.01, z], [0.08, 0.01, z], [0.08, 0.01, z + 3], [-0.08, 0.01, z + 3]], "#e6e2c8"));
      if (T !== "highway") for (const side of [-1, 1]) for (let k = 0; k < 9; k++) {
        const x0 = side * (road / 2 + (T === "alley" ? 0 : 2)), z0 = 2 + k * 9 + rng() * 2, hgt = (p.wealth === "luxury" ? 15 : 4) + Math.floor(rng() * (p.wealth === "luxury" ? 6 : 3)) * 3.1;
        faces.push(...O.building(c, L, Math.min(x0, x0 + side * 9), z0, Math.max(x0, x0 + side * 9), z0 + 8, hgt, bld(rng), night, rng, "flat", p.wealth === "luxury" && rng() < 0.6));
      }
      else for (let i = 0; i < 14; i++) faces.push(...O.building(c, L, -80 + i * 12, 120 + rng() * 40, -74 + i * 12, 126 + rng() * 40, 8 + rng() * 30, bld(rng), night, rng, "flat"));
      if (T !== "alley") for (let k = 0; k < 6; k++) faces.push(...O.streetlight(c, (k % 2 ? 1 : -1) * (road / 2 + 0.6), 4 + k * 12, night));
      if (T === "street") { faces.push(...O.car(c, L, road / 4, 9, hexMix("#c9a23a", "#8a2a2a", rng())), ...O.car(c, L, -road / 4, 22, hexMix("#3a5a7a", "#d8d4cc", rng()))); faces.push(...O.wires(c, -road / 2 - 1, road / 2 + 1, 6, 30, 7)); for (let i = 0; i < 4; i++) faces.push(...O.person(c, (i % 2 ? 1 : -1) * (road / 2 + 1 + rng()), 5 + i * 4, hexMix("#c4513b", "#2f5f8a", rng()), rng)); }
      if (T === "highway") faces.push(...O.box(c, -road / 2 - 0.5, 0, 2, -road / 2, 0.8, 200, "#9a9a96", L), ...O.box(c, road / 2, 0, 2, road / 2 + 0.5, 0.8, 200, "#9a9a96", L), ...O.sign(c, L, road / 2 + 3, 30, 5, 2, 5, "#2f6f4a"));
    }
  }
  // What the description names.
  if (p.objects.includes("motorbike")) faces.push(...O.motorbike(c, -2, 6));
  if (p.objects.includes("generator") && T !== "compound") faces.push(...O.generator(c, L, 4, 5));
  if (p.objects.includes("car") && !["street", "compound", "building_ext"].includes(T)) faces.push(...O.car(c, L, 3, 7, "#7a2a2a"));
  if (p.objects.includes("palm") && !["beach"].includes(T)) for (let i = 0; i < 3; i++) faces.push(...O.tree(c, -12 + i * 12, 14 + rng() * 6, 8, rng, true));
  if (p.objects.includes("sign") && !["building_ext", "highway"].includes(T)) faces.push(...O.sign(c, L, 6, 16, 4, 1.5, 3.5, "#c4513b"));
  if (p.objects.includes("boat") && T !== "harbour") faces.push(...O.boat(c, L, 6, 30, 10, "#2f4e6e"));
  void view;
  return base + paint(faces);
}

/** The camera for the view: wide from the doorway, medium closer in, detail close to the main surface, establishing from outside. */
function cameraFor(p: PlaceSpec, view: PlaceView, W: number, H: number): Camera {
  if (p.interior) {
    const { w, d } = sizeOf(p);
    void w;
    if (view === "detail") return { x: -0.2, y: 1.35, z: d * 0.55 - 1.6, yaw: 0, f: W * 1.25, W, H, horizon: H * 0.18 };
    if (view === "medium") return { x: 0.2, y: 1.55, z: d * 0.18, yaw: 0.05, f: W * 0.82, W, H, horizon: H * 0.45 };
    return { x: 0.3, y: 1.6, z: -0.6, yaw: 0.06, f: W * 0.52, W, H, horizon: H * 0.47 };
  }
  if (view === "establishing") return { x: 0, y: 9, z: -14, yaw: 0, f: W * 0.6, W, H, horizon: H * 0.42 };
  if (view === "medium") return { x: 1, y: 1.6, z: 1, yaw: -0.05, f: W * 0.85, W, H, horizon: H * 0.55 };
  if (view === "detail") return { x: 0, y: 1.2, z: 2.5, yaw: 0, f: W * 1.2, W, H, horizon: H * 0.3 };
  return { x: 0.5, y: 1.7, z: -2, yaw: 0.03, f: W * 0.6, W, H, horizon: H * 0.52 };
}

export function placeSketchEngine(input: PlaceSketchInput): PlaceSketchOutput {
  const view: PlaceView = input.view ?? "wide";
  const W = input.width, H = input.height;
  let place = readPlace(input.name, input.description ?? "", input.int_ext ?? [], input.time ?? null);
  // An interior's establishing view is the building from outside.
  const drawn = place.interior && view === "establishing" && place.type !== "car" && place.type !== "bus" ? { ...place, type: "building_ext" as const, interior: false } : place;
  const rng = rngFrom(`${input.seed ?? input.name}|${view}`);
  const c = cameraFor(drawn, view, W, H);
  const [top, bottom] = SKY[drawn.lit];
  const st = input.style ?? null;
  const defs = `<defs><linearGradient id="skyg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>
<radialGradient id="glow"><stop offset="0" stop-color="#ffe2a0" stop-opacity="0.9"/><stop offset="1" stop-color="#ffe2a0" stop-opacity="0"/></radialGradient>
<linearGradient id="vign" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.25"/><stop offset="0.5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.3"/></linearGradient>
${st ? `<filter id="grade" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="${st.sat}"/><feColorMatrix type="matrix" values="${1 + st.warmth * 0.08} 0 0 0 0  0 1 0 0 0  0 0 ${1 - st.warmth * 0.08} 0 0  0 0 0 1 0"/></filter>` : ""}</defs>`;
  const sky = `<rect width="${W}" height="${H}" fill="url(#skyg)"/>${drawn.lit === "night" ? Array.from({ length: 24 }, () => `<circle cx="${r1(rng() * W)}" cy="${r1(rng() * c.horizon * 0.8)}" r="${r1(0.6 + rng())}" fill="#e8ecf5" opacity="${r1(0.4 + rng() * 0.5)}"/>`).join("") : drawn.lit === "day" ? `<circle cx="${r1(W * 0.82)}" cy="${r1(H * 0.12)}" r="${r1(H * 0.05)}" fill="#fff4cf" opacity="0.9"/>` : `<circle cx="${r1(W * 0.75)}" cy="${r1(c.horizon - H * 0.04)}" r="${r1(H * 0.06)}" fill="#ffb877" opacity="0.9"/>`}`;
  const body = drawn.interior ? interior(c, drawn, view, rng) : exterior(c, drawn, view, rng);
  // Light and weather over everything: night darkens, dawn/dusk warm, rain streaks, fog and dust haze, a vignette.
  const over: string[] = [];
  if (drawn.lit === "night") over.push(`<rect width="${W}" height="${H}" fill="#0b1226" opacity="${drawn.interior ? 0.3 : 0.35}"/>`);
  if (drawn.lit === "dawn" || drawn.lit === "dusk") over.push(`<rect width="${W}" height="${H}" fill="#ff9a50" opacity="0.12"/>`);
  if (drawn.practical === "fluorescent") over.push(`<rect width="${W}" height="${H}" fill="#cfe6ff" opacity="0.06"/>`);
  if (drawn.weather === "rain" || drawn.weather === "storm") over.push(Array.from({ length: drawn.interior ? 0 : 160 }, () => { const x = rng() * W, y = rng() * H; return `<line x1="${r1(x)}" y1="${r1(y)}" x2="${r1(x - 4)}" y2="${r1(y + 18)}" stroke="#c9d6e6" stroke-width="1" opacity="0.45"/>`; }).join(""), `<rect width="${W}" height="${H}" fill="#5a6a7a" opacity="0.12"/>`);
  if (drawn.weather === "fog") over.push(`<rect width="${W}" height="${H}" fill="#e6e8ea" opacity="0.32"/>`);
  if (drawn.weather === "dust") over.push(`<rect width="${W}" height="${H}" fill="#d9b98a" opacity="0.3"/>`);
  if (st) over.push(`<rect width="${W}" height="${H}" fill="${st.shade}" opacity="${r1(st.grade * 0.18 * 100) / 100}" style="mix-blend-mode:multiply"/>`);
  over.push(`<rect width="${W}" height="${H}" fill="url(#vign)"/>`);
  const svg = `${defs}<g${st ? ` filter="url(#grade)"` : ""}>${sky}${body}${over.join("")}</g>`;
  return { svg, place: drawn, engine_version: ENGINE_VERSION };
}
void sprite; void seg; void hexShade;
