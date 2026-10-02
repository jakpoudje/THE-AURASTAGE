// engines/generation/auraSketchFigureEngine — AuraSketch 2 (owner, 2026-09-29: "AuraSketch should be one of the advanced
// sketching character engines that enables us to have our own inbuilt image sketcher rather than circles and heads").
// Draws a character as an inked, washed concept-sheet figure from the appearance facts (characterAppearanceEngine):
// proportions by life stage, build and presentation; face with eyes, brows, nose, mouth, ears and jaw; twelve hair
// styles; headwear (gele, hijab, turban, headscarf, caps and hats); facial hair; glasses, scars, earrings; layered
// clothing (shirt under an open jacket with lapels and tie, coats, hoodies, dresses, robes, kaftans/agbada, skirts,
// jeans, shorts) in the described colours. Four angles (front, three-quarter, profile, back), framed for close-up,
// medium close-up, medium and full length. Deterministic SVG in "head units" (crown y=0, chin y=1). Not AI.
import type { Appearance } from "../../character/characterAppearanceEngine/engine";
import { ENGINE_VERSION } from "./version";
import { drawFace, drawProfileFace, faceOf, type MouthMode } from "./face";
import { gradeSvg, SKETCH_STYLES, type SketchStyle } from "./style";

export type SketchAngle = "front" | "three_quarter" | "profile" | "back";
export type SketchSize = "CU" | "MCU" | "MS" | "FULL" | "WIDE";
export interface FigureBox { x: number; y: number; width: number; height: number }

const INK = "#2b2622";
const NEUTRAL_SKIN = "#d6c7b8";
const TOP_DEFAULT: Record<Appearance["clothing"]["top"], string> = {
  tshirt: "#6f7d8c", shirt: "#e7e3da", blouse: "#e9d9d0", sweater: "#7b6a5a", hoodie: "#5d6470", jacket: "#6b5a45", suit: "#3b3f4c",
  coat: "#5a4f45", dress: "#7a3f52", robe: "#8a7a64", uniform: "#56604a", kaftan: "#c9b27a",
};
const f = (n: number) => Math.round(n * 1000) / 1000;
const pts = (...xy: number[]) => xy.map(f).join(" ");
const shade = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
};

interface Geo {
  heads: number;
  sy: (y: number) => number;
  sw: number; ww: number; hw: number; nw: number; rx: number; jw: number;
  bs: number; // horizontal squash for the angle
  fx: number; // face shift for three-quarter
}

function geometry(a: Appearance, angle: SketchAngle): Geo {
  const heads = { child: 5.6, teen: 7.0, adult: 7.5, middle: 7.4, elder: 7.2 }[a.life_stage];
  const k = (heads - 1) / 6.5;
  const small = a.life_stage === "child" ? 0.8 : a.life_stage === "teen" ? 0.92 : 1;
  const p = a.presentation;
  const w = Math.max(0.78, Math.min(1.4, a.width));
  const sw = (p === "masculine" ? 0.95 : p === "feminine" ? 0.8 : 0.87) * w * small + (a.muscular ? 0.07 : 0) - (a.life_stage === "elder" ? 0.04 : 0);
  const ww = (p === "masculine" ? 0.7 : p === "feminine" ? 0.55 : 0.62) * w * small;
  const hw = (p === "masculine" ? 0.68 : p === "feminine" ? 0.8 : 0.72) * w * small;
  return {
    heads, sy: (y: number) => (y <= 1 ? y : 1 + (y - 1) * k), sw, ww, hw,
    nw: p === "masculine" ? 0.15 : 0.12, rx: a.life_stage === "child" ? 0.38 : p === "masculine" ? 0.36 : p === "feminine" ? 0.33 : 0.345,
    jw: p === "masculine" ? 0.18 : 0.13, bs: angle === "profile" ? 0.5 : angle === "three_quarter" ? 0.82 : 1, fx: angle === "three_quarter" ? 0.07 : 0,
  };
}

export interface FigureOptions {
  /** The film's look (sketchStyleFor(genre)); natural drama light by default. */
  style?: SketchStyle;
  /** A mouth that speaks a line (visemesFor) with blinking, or a still mouth. */
  mouth?: MouthMode;
}
/** A short id for this figure's gradients and clips (same person + angle + style → same id, so repeats are harmless). */
function figureUid(a: Appearance, angle: SketchAngle, st: SketchStyle, talking: boolean) {
  let h = 5381;
  for (const ch of `${a.identity_seed ?? ""}|${a.skin}|${a.hair.colour}|${angle}|${st.id}|${talking}`) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return h.toString(36);
}

/** The whole figure, in head units, facing the viewer (front) or turned. */
export function auraSketchFigureShapes(a: Appearance, angle: SketchAngle, opts: FigureOptions = {}): string {
  const st = opts.style ?? SKETCH_STYLES.drama;
  const mode: MouthMode = opts.mouth ?? { kind: "still" };
  const uid = figureUid(a, angle, st, mode.kind === "talking");
  const lw = st.line;
  const INK = st.ink;
  const g = geometry(a, angle);
  const { sy, bs } = g;
  const X = (x: number) => x * bs;
  const skin = a.skin ?? NEUTRAL_SKIN, skinDark = shade(skin, 0.82);
  const cols = a.clothing.colours;
  const top = a.clothing.top;
  const layered = top === "jacket" || top === "suit" || top === "coat";
  const nm = a.clothing.named ?? {};
  const used = new Set(Object.values(nm));
  const free = cols.filter((c) => !used.has(c));
  const outer = nm.top ?? free[0] ?? TOP_DEFAULT[top];
  const inner = layered ? nm.inner ?? (nm.top ? free[0] : free[1]) ?? "#e7e3da" : outer;
  const bottomCol = nm.bottom ?? (top === "suit" ? outer : a.clothing.bottom === "jeans" ? "#3f5577" : "#3b3b42");
  const tieCol = nm.tie ?? "#7a2230";
  const hwc = nm.headwear ?? (nm.top ? free[0] : free[1]) ?? "#c9a24a";
  const hair = a.hair.colour;
  const out: string[] = [];
  const S = `stroke="${INK}" stroke-width="${f(0.022 * lw)}" stroke-linejoin="round" stroke-linecap="round"`;
  const path = (d: string, fill: string, extra = "") => out.push(`<path d="${d}" fill="${fill}" ${S} ${extra}/>`);
  const line = (d: string, w = 0.018, op = 1) => out.push(`<path d="${d}" fill="none" stroke="${INK}" stroke-width="${f(w * lw)}" stroke-linecap="round" opacity="${op}"/>`);

  // ---- behind the body: long hair, afro, hoodie hood ----
  const long = ["long", "braids", "locs"].includes(a.hair.style) && !["hijab", "gele", "headscarf", "turban"].includes(a.headwear);
  if (long) {
    const end = sy(a.hair.style === "locs" ? 2.1 : a.hair.style === "braids" ? 2.5 : 2.3);
    path(`M ${pts(-g.rx - 0.08, 0.35)} C ${pts(-g.rx - 0.2, 1.0, X(-g.sw * 0.75), sy(1.4), X(-g.sw * 0.62), end)} L ${pts(X(g.sw * 0.62), end)} C ${pts(X(g.sw * 0.75), sy(1.4), g.rx + 0.2, 1.0, g.rx + 0.08, 0.35)} Z`, hair);
  }
  if (a.hair.style === "afro" && a.headwear === "none") out.push(`<ellipse cx="${f(g.fx)}" cy="0.4" rx="${f(g.rx + 0.3)}" ry="0.64" fill="${hair}" ${S}/>`);
  if (top === "hoodie" && angle !== "profile") path(`M ${pts(X(-g.sw * 0.7), sy(1.4))} C ${pts(-0.62, 0.9, -0.55, 0.25, 0, 0.2)} C ${pts(0.55, 0.25, 0.62, 0.9, X(g.sw * 0.7), sy(1.4))} Z`, shade(outer, 0.85));

  // ---- legs / lower garments ----
  const hip = sy(3.55), crotch = sy(3.95), knee = sy(5.6), ankle = sy(7.2), feet = sy(7.45);
  const full = top === "robe" || top === "kaftan";
  const dress = top === "dress";
  const legSkin = a.clothing.bottom === "shorts" || a.clothing.bottom === "skirt" || dress;
  const leg = (s: number, fill: string, to = ankle) => {
    const lx = s * g.hw * 0.52;
    path(`M ${pts(X(s * g.hw), hip)} L ${pts(X(s * 0.03), hip)} L ${pts(X(s * 0.05), crotch)} L ${pts(X(lx - s * 0.06), knee)} L ${pts(X(lx - s * 0.02), to)} L ${pts(X(lx + s * 0.17), to)} L ${pts(X(lx + s * 0.2), knee)} L ${pts(X(s * g.hw * 0.98), sy(4.2))} Z`, fill);
  };
  if (!full) {
    const order = angle === "profile" ? [1] : [-1, 1];
    for (const s of order) {
      leg(s, legSkin ? skin : bottomCol);
      if (a.clothing.bottom === "shorts") leg(s, bottomCol, sy(4.8));
      const lx = s * g.hw * 0.52;
      const toe = angle === "profile" ? 0.22 : 0.05 * s;
      path(`M ${pts(X(lx - s * 0.03) + toe * 0, ankle - 0.02)} Q ${pts(X(lx + s * 0.08) + toe, feet + 0.04, X(lx + s * 0.2) + toe, ankle)} Z`, INK);
      out.push(`<ellipse cx="${f(X(lx + s * 0.07) + toe)}" cy="${f(feet)}" rx="${f(angle === "profile" ? 0.22 : 0.15)}" ry="0.08" fill="${INK}"/>`);
    }
    if (a.clothing.bottom === "jeans") for (const s of order) line(`M ${pts(X(s * g.hw * 0.6), hip + 0.1)} L ${pts(X(s * g.hw * 0.5), knee)}`, 0.01, 0.35);
    if (a.clothing.bottom === "skirt") path(`M ${pts(X(-g.ww), sy(2.95))} L ${pts(X(g.ww), sy(2.95))} L ${pts(X(g.hw + 0.18), sy(5.3))} L ${pts(X(-g.hw - 0.18), sy(5.3))} Z`, bottomCol);
  }

  // ---- arms (far arm first in three-quarter) ----
  const sleeveCol = top === "tshirt" ? outer : layered ? outer : outer;
  const arm = (s: number) => {
    const ax = s * g.sw;
    const wide = full;
    const wrist = sy(3.72);
    const sleeveEnd = top === "tshirt" ? sy(2.05) : wrist;
    const p = (x: number) => X(ax + s * x);
    if (wide) path(`M ${pts(p(0), sy(1.38))} L ${pts(p(0.55), sy(3.3))} L ${pts(p(-0.2), sy(3.35))} L ${pts(p(-0.14), sy(1.7))} Z`, outer);
    else {
      path(`M ${pts(p(0), sy(1.38))} C ${pts(p(0.19), sy(1.55), p(0.2), sy(2.3), p(0.17), sy(2.9))} L ${pts(p(0.13), wrist)} L ${pts(p(-0.1), wrist)} L ${pts(p(-0.1), sy(2.9))} C ${pts(p(-0.12), sy(2.3), p(-0.1), sy(1.8), p(-0.13), sy(1.62))} Z`, skin);
      path(`M ${pts(p(0), sy(1.38))} C ${pts(p(0.19), sy(1.55), p(0.2), sy(2.0), p(0.19), sleeveEnd === wrist ? sy(2.9) : sleeveEnd)} L ${pts(p(sleeveEnd === wrist ? 0.14 : 0.19), sleeveEnd)} L ${pts(p(-0.11), sleeveEnd)} L ${pts(p(-0.11), sy(2.1))} C ${pts(p(-0.12), sy(1.9), p(-0.1), sy(1.75), p(-0.13), sy(1.62))} Z`, sleeveCol);
    }
    out.push(`<ellipse cx="${f(p(0.02))}" cy="${f(sy(3.93))}" rx="0.09" ry="0.15" fill="${skin}" ${S}/>`);
  };
  if (angle === "profile") arm(0.15 / g.bs);
  else { arm(-1); if (angle !== "three_quarter") arm(1); }

  // ---- torso ----
  const nl = g.nw * 1.35;
  const hem = full ? sy(7.05) : dress ? sy(5.55) : top === "coat" ? sy(5.35) : sy(3.6);
  const flare = full ? 0.45 : dress ? 0.3 : top === "coat" ? 0.18 : 0;
  const torso = (fill: string, hemY: number, fl: number) =>
    path(`M ${pts(X(-nl), sy(1.2))} Q ${pts(X(-g.sw * 0.7), sy(1.22), X(-g.sw), sy(1.4))} L ${pts(X(-(g.sw - 0.08)), sy(2.1))} Q ${pts(X(-g.ww), sy(2.6), X(-g.ww), sy(2.92))} Q ${pts(X(-g.ww), sy(3.25), X(-(g.hw + fl)), hemY)} L ${pts(X(g.hw + fl), hemY)} Q ${pts(X(g.ww), sy(3.25), X(g.ww), sy(2.92))} Q ${pts(X(g.ww), sy(2.6), X(g.sw - 0.08), sy(2.1))} L ${pts(X(g.sw), sy(1.4))} Q ${pts(X(g.sw * 0.7), sy(1.22), X(nl), sy(1.2))} Q ${pts(0, sy(1.34), X(-nl), sy(1.2))} Z`, fill);
  // Neck first (under the collar).
  path(`M ${pts(X(-g.nw) + g.fx, 0.85)} L ${pts(X(-g.nw) + g.fx, sy(1.3))} L ${pts(X(g.nw) + g.fx, sy(1.3))} L ${pts(X(g.nw) + g.fx, 0.85)} Z`, skinDark);
  torso(inner, layered ? sy(3.6) : hem, layered ? 0 : flare);
  if (a.presentation === "feminine" && angle !== "back" && !full) line(`M ${pts(X(-0.32), sy(1.95))} Q ${pts(X(-0.18), sy(2.08), X(-0.04), sy(1.97))} M ${pts(X(0.04), sy(1.97))} Q ${pts(X(0.18), sy(2.08), X(0.32), sy(1.95))}`, 0.014, 0.5);
  if (a.clothing.tie && angle !== "back") path(`M ${pts(X(-0.05), sy(1.28))} L ${pts(X(0.05), sy(1.28))} L ${pts(X(0.07), sy(2.6))} L ${pts(0, sy(2.75))} L ${pts(X(-0.07), sy(2.6))} Z`, tieCol);
  if (top === "shirt" || top === "blouse" || top === "uniform") {
    if (angle !== "back") { line(`M ${pts(X(-nl), sy(1.2))} L ${pts(X(-0.02), sy(1.42))} L ${pts(X(nl), sy(1.2))}`, 0.016); for (let b = 0; b < 4; b++) out.push(`<circle cx="${f(X(0.0))}" cy="${f(sy(1.6 + b * 0.45))}" r="0.018" fill="${INK}"/>`); }
    if (top === "uniform") for (const s of [-1, 1]) out.push(`<rect x="${f(X(s * 0.35) - 0.12)}" y="${f(sy(1.85))}" width="0.24" height="0.18" fill="${shade(outer, 0.85)}" ${S}/>`);
  }
  if (layered) {
    // Jacket / suit / coat panels over the shirt, open at the front with lapels (closed from the back).
    const jHem = top === "coat" ? sy(5.35) : sy(3.85);
    if (angle === "back" || angle === "profile" || !a.clothing.open_jacket) torso(outer, jHem, flare);
    else {
      for (const s of [-1, 1]) {
        path(`M ${pts(X(s * nl), sy(1.2))} Q ${pts(X(s * g.sw * 0.7), sy(1.22), X(s * g.sw), sy(1.4))} L ${pts(X(s * (g.sw - 0.08)), sy(2.1))} Q ${pts(X(s * g.ww), sy(2.6), X(s * (g.ww + 0.02)), sy(2.92))} Q ${pts(X(s * (g.ww + 0.02)), sy(3.3), X(s * (g.hw + flare)), jHem)} L ${pts(X(s * 0.06), jHem)} L ${pts(X(s * 0.07), sy(2.7))} Z`, outer);
        path(`M ${pts(X(s * nl), sy(1.2))} L ${pts(X(s * 0.3), sy(1.75))} L ${pts(X(s * 0.18), sy(1.85))} L ${pts(X(s * 0.07), sy(2.7))} Z`, shade(outer, 0.8));
      }
      out.push(`<circle cx="${f(X(-0.1))}" cy="${f(sy(3.05))}" r="0.025" fill="${INK}"/>`);
    }
  }
  if (top === "kaftan" && angle !== "back") line(`M ${pts(X(-0.18), sy(1.25))} Q ${pts(0, sy(1.9), X(0.18), sy(1.25))} M ${pts(X(-0.12), sy(1.5))} Q ${pts(0, sy(2.1), X(0.12), sy(1.5))}`, 0.016, 0.8);
  if (top === "hoodie" && angle !== "back") line(`M ${pts(X(-0.08), sy(1.3))} L ${pts(X(-0.09), sy(1.9))} M ${pts(X(0.08), sy(1.3))} L ${pts(X(0.09), sy(1.9))} M ${pts(X(-0.35), sy(2.9))} L ${pts(X(0.35), sy(2.9))} L ${pts(X(0.3), sy(3.3))} L ${pts(X(-0.3), sy(3.3))} Z`, 0.014, 0.7);
  // Pencil hatching on the shadow side.
  for (let i = 0; i < 7; i++) { const y = sy(1.7 + i * 0.28); if (y < hem - 0.1) line(`M ${pts(X(g.sw * 0.55), y)} L ${pts(X(g.sw * 0.75), y - 0.16)}`, 0.012, Math.min(0.6, 0.28 * st.shadow)); }

  // ---- a hijab frames the face from behind ----
  const hcx = angle === "profile" ? -0.02 : g.fx;
  if (a.headwear === "hijab") path(`M ${pts(hcx - g.rx - 0.1, 0.5)} C ${pts(hcx - g.rx - 0.12, -0.14, hcx + g.rx + 0.12, -0.14, hcx + g.rx + 0.1, 0.5)} C ${pts(hcx + g.rx + 0.12, 0.95, X(g.sw * 0.75), sy(1.2), X(g.sw * 0.8), sy(1.5))} L ${pts(X(-g.sw * 0.8), sy(1.5))} C ${pts(X(-g.sw * 0.75), sy(1.2), hcx - g.rx - 0.12, 0.95, hcx - g.rx - 0.1, 0.5)} Z`, hwc);

  // ---- head ----
  const hx = g.fx;
  const rx = g.rx * (angle === "profile" ? 1 : angle === "three_quarter" ? 0.96 : 1);
  if (angle === "back") {
    const bald = a.hair.style === "bald" && a.headwear === "none";
    out.push(`<ellipse cx="${f(hx)}" cy="0.5" rx="${f(rx)}" ry="0.5" fill="${bald ? skin : a.headwear === "hijab" ? hwc : hair}" ${S}/>`);
    for (const s of [-1, 1]) out.push(`<ellipse cx="${f(s * (rx + 0.01))}" cy="0.56" rx="0.05" ry="0.1" fill="${skin}" ${S}/>`);
  } else if (angle === "profile") {
    out.push(`<ellipse cx="-0.04" cy="0.56" rx="${f(0.06 * faceOf(a).ears)}" ry="${f(0.11 * faceOf(a).ears)}" fill="${skin}" ${S}/>`);
    out.push(drawProfileFace(a, skin, st, uid, mode, lw));
  } else {
    const side = angle === "three_quarter";
    const ek = faceOf(a).ears;
    out.push(`<ellipse cx="${f(hx - rx - 0.01)}" cy="0.56" rx="${f(0.05 * ek)}" ry="${f(0.1 * ek)}" fill="${skin}" ${S}/>`);
    if (!side) out.push(`<ellipse cx="${f(hx + rx + 0.01)}" cy="0.56" rx="${f(0.05 * ek)}" ry="${f(0.1 * ek)}" fill="${skin}" ${S}/>`);
    const fd = drawFace(a, hx, rx, g.jw, side, skin, st, uid, mode, lw);
    out.push(fd.svg);
    const r2 = fd.geo.r2, mx = fd.geo.mx;
    const ex = fd.geo.eyes.map((e) => [e.x - hx, e.s] as const);
    if (a.scar) { const s = a.scar === "left" ? 1 : -1; line(`M ${pts(hx + s * 0.1, 0.38)} L ${pts(hx + s * 0.16, 0.5)}`, 0.016, 0.9); }
    if (a.earrings) for (const s of side ? [-1] : [-1, 1]) out.push(`<circle cx="${f(hx + s * (rx + 0.01))}" cy="0.69" r="0.03" fill="none" stroke="#c9a24a" stroke-width="0.018"/>`);
    // Facial hair.
    const fh = a.facial_hair, fc = a.hair.colour;
    if (fh === "stubble") out.push(`<path d="M ${pts(hx - rx + 0.02, 0.62)} C ${pts(hx - rx + 0.02, 0.9, hx - 0.1, 1.0, hx, 1.0)} C ${pts(hx + 0.1, 1.0, hx + r2 - 0.02, 0.9, hx + r2 - 0.02, 0.62)} Q ${pts(hx, 0.9, hx - rx + 0.02, 0.62)} Z" fill="${fc}" opacity="0.22"/>`);
    if (fh === "beard" || fh === "full_beard") {
      const low = fh === "full_beard" ? 1.18 : 1.05;
      path(`M ${pts(hx - rx + 0.01, 0.58)} C ${pts(hx - rx, 0.95, hx - 0.14, low, hx, low)} C ${pts(hx + 0.14, low, hx + r2, 0.95, hx + r2 - 0.01, 0.58)} L ${pts(hx + r2 - 0.06, 0.66)} Q ${pts(hx + 0.1, 0.8, hx, 0.76)} Q ${pts(hx - 0.1, 0.8, hx - rx + 0.06, 0.66)} Z`, fc);
      out.push(`<path d="M ${pts(mx - 0.07, 0.83)} Q ${pts(mx, 0.87, mx + 0.07, 0.83)}" fill="none" stroke="${shade(skin, 0.6)}" stroke-width="0.03"/>`);
    }
    if (fh === "moustache" || fh === "goatee") path(`M ${pts(hx - 0.1, 0.8)} Q ${pts(hx, 0.74, hx + 0.1, 0.8)} Q ${pts(hx, 0.78, hx - 0.1, 0.8)} Z`, fc);
    if (fh === "goatee") path(`M ${pts(hx - 0.06, 0.9)} Q ${pts(hx, 1.08, hx + 0.06, 0.9)} Z`, fc);
    if (a.glasses) {
      for (const [x] of ex) out.push(`<rect x="${f(hx + x - 0.085)}" y="0.475" width="0.17" height="0.11" rx="0.035" fill="#ffffff" fill-opacity="0.18" stroke="${INK}" stroke-width="0.022"/>`);
      line(`M ${pts(hx + ex[0][0] + 0.085, 0.52)} L ${pts(hx + ex[1][0] - 0.085, 0.52)}`, 0.02);
    }
  }

  // ---- hair on top ----
  if (a.headwear === "none" && angle !== "back") {
    const st = a.hair.style;
    const top0 = st === "cropped" || st === "shaved" ? -0.02 : -0.08, line0 = st === "cropped" || st === "shaved" ? 0.2 : 0.27;
    const r3 = rx + (st === "cropped" || st === "shaved" ? 0.01 : 0.04);
    const cx = angle === "profile" ? -0.02 : hx;
    if (st !== "bald" && st !== "afro") {
      path(`M ${pts(cx - r3, 0.52)} C ${pts(cx - r3 - 0.02, top0, cx + r3 + 0.02, top0, cx + r3, angle === "profile" ? 0.3 : 0.52)} C ${pts(cx + r3 - 0.08, line0, cx - r3 + 0.08, line0, cx - r3, 0.52)} Z`, hair, st === "shaved" ? `opacity="0.4"` : "");
      if (st !== "shaved") {
        // Strands and a sheen where the light catches (AuraSketch 3), following the curve of the head.
        for (let k = 0; k < 7; k++) {
          // The cap's crown sits at about 0.13 + 0.75·top0; strands run from there down to the hairline, inside the hair.
          const t = (k + 0.5) / 7, x0 = cx + (2 * t - 1) * r3 * 0.78, crown = 0.13 + 0.75 * top0 + 0.03;
          line(`M ${pts(cx + (x0 - cx) * 0.3, crown)} Q ${pts(x0, crown + 0.04, x0 + (x0 - cx) * 0.08, line0 - 0.01)}`, 0.008, 0.3);
        }
        out.push(`<path d="M ${pts(cx - r3 * 0.65, 0.2)} Q ${pts(cx - r3 * 0.25, 0.1, cx + r3 * 0.2, 0.11)}" fill="none" stroke="#ffffff" stroke-width="${f(0.03 * lw)}" stroke-linecap="round" opacity="0.18"/>`);
      }
      if (st === "medium") for (const s of angle === "profile" ? [-1] : [-1, 1]) path(`M ${pts(cx + s * r3, 0.4)} Q ${pts(cx + s * (r3 + 0.06), 0.8, cx + s * (r3 - 0.02), 1.02)} L ${pts(cx + s * (r3 - 0.1), 0.95)} Q ${pts(cx + s * (r3 - 0.04), 0.7, cx + s * (r3 - 0.06), 0.45)} Z`, hair);
      if (st === "curly") for (let i = 0; i < 13; i++) { const t = Math.PI * (0.92 + (1.16 * i) / 12); out.push(`<circle cx="${f(cx + (r3 + 0.01) * Math.cos(t))}" cy="${f(0.5 + 0.56 * Math.sin(t))}" r="0.1" fill="${hair}" stroke="${INK}" stroke-width="0.016"/>`); }
      if (st === "bun") out.push(`<circle cx="${f(cx)}" cy="-0.1" r="0.17" fill="${hair}" ${S}/>`);
      if (st === "ponytail" && angle !== "front") path(`M ${pts(cx - r3 + 0.02, 0.35)} Q ${pts(cx - r3 - 0.25, 0.8, cx - r3 - 0.05, 1.6)} L ${pts(cx - r3 + 0.05, 1.55)} Q ${pts(cx - r3 - 0.1, 0.8, cx - r3 + 0.12, 0.4)} Z`, hair);
      if (st === "braids" || st === "locs") for (const s of angle === "profile" ? [-1] : [-1, 1]) for (let k = 0; k < 3; k++) {
        // Strands fall beside the face (never across it), fanning out over the shoulders.
        const x0 = cx + s * (r3 + 0.01 + k * 0.045), y0 = 0.35 + k * 0.08, len = st === "locs" ? 1.9 : 2.3;
        line(`M ${pts(x0, y0)} L ${pts(x0 + s * (0.1 + k * 0.06), sy(len))}`, st === "locs" ? 0.07 : 0.05, 1);
        out.push(`<path d="M ${pts(x0, y0)} L ${pts(x0 + s * (0.1 + k * 0.06), sy(len))}" stroke="${hair}" stroke-width="${st === "locs" ? 0.05 : 0.034}" stroke-dasharray="0.05 0.03" fill="none"/>`);
      }
      if (st === "long") for (const s of angle === "profile" ? [-1] : [-1, 1]) path(`M ${pts(cx + s * r3, 0.4)} Q ${pts(cx + s * (r3 + 0.1), 1.0, cx + s * (g.sw * 0.55), sy(2.1))} L ${pts(cx + s * (g.sw * 0.35), sy(2.05))} Q ${pts(cx + s * (r3 - 0.02), 1.0, cx + s * (r3 - 0.07), 0.45)} Z`, hair);
    }
    if (st === "afro") path(`M ${pts(cx - rx - 0.28, 0.6)} C ${pts(cx - rx - 0.36, -0.35, cx + rx + 0.36, -0.35, cx + rx + 0.28, 0.6)} C ${pts(cx + rx, 0.3, cx - rx, 0.3, cx - rx - 0.28, 0.6)} Z`, hair);
    if (st === "bald") line(`M ${pts(cx - 0.12, 0.12)} Q ${pts(cx - 0.05, 0.07, cx + 0.02, 0.1)}`, 0.02, 0.35);
  }
  if (angle === "back" && a.headwear === "none" && a.hair.style === "bun") out.push(`<circle cx="${f(hx)}" cy="0.25" r="0.16" fill="${hair}" ${S}/>`);

  // ---- headwear ----
  const hc = angle === "profile" ? -0.02 : hx;
  switch (a.headwear) {
    case "gele":
      path(`M ${pts(hc - 0.6, 0.28)} C ${pts(hc - 0.88, -0.35, hc - 0.25, -0.78, hc + 0.1, -0.58)} C ${pts(hc + 0.55, -0.8, hc + 0.9, -0.3, hc + 0.62, 0.28)} C ${pts(hc + 0.3, 0.14, hc - 0.3, 0.14, hc - 0.6, 0.28)} Z`, hwc);
      line(`M ${pts(hc - 0.35, 0.15)} Q ${pts(hc - 0.4, -0.3, hc - 0.1, -0.45)} M ${pts(hc + 0.3, 0.15)} Q ${pts(hc + 0.45, -0.3, hc + 0.2, -0.55)} M ${pts(hc, 0.12)} Q ${pts(hc + 0.05, -0.3, hc + 0.05, -0.55)}`, 0.016, 0.6);
      break;
    case "hijab":
      if (angle !== "back") path(`M ${pts(hc - rx - 0.02, 0.42)} C ${pts(hc - rx, 0.02, hc + rx, 0.02, hc + rx + 0.02, 0.42)} C ${pts(hc + rx - 0.04, 0.2, hc - rx + 0.04, 0.2, hc - rx - 0.02, 0.42)} Z`, hwc);
      break;
    case "turban":
      out.push(`<ellipse cx="${f(hc)}" cy="0.12" rx="${f(rx + 0.09)}" ry="0.36" fill="${hwc}" ${S}/>`);
      line(`M ${pts(hc - rx, 0.25)} Q ${pts(hc, 0.05, hc + rx, 0.2)} M ${pts(hc - rx + 0.05, 0.05)} Q ${pts(hc, -0.12, hc + rx - 0.02, 0.02)}`, 0.016, 0.6);
      break;
    case "headscarf":
      path(`M ${pts(hc - rx - 0.05, 0.5)} C ${pts(hc - rx - 0.06, -0.08, hc + rx + 0.06, -0.08, hc + rx + 0.05, 0.5)} C ${pts(hc + rx - 0.05, 0.28, hc - rx + 0.05, 0.28, hc - rx - 0.05, 0.5)} Z`, hwc);
      break;
    case "cap":
      path(`M ${pts(hc - rx - 0.02, 0.32)} C ${pts(hc - rx, -0.08, hc + rx, -0.08, hc + rx + 0.02, 0.32)} Z`, cols[0] ?? "#3f64a0");
      path(angle === "profile" ? `M ${pts(hc + 0.2, 0.3)} L ${pts(hc + 0.62, 0.34)} L ${pts(hc + 0.2, 0.36)} Z` : `M ${pts(hc - rx - 0.02, 0.32)} Q ${pts(hc, 0.44, hc + rx + 0.02, 0.32)} Z`, shade(cols[0] ?? "#3f64a0", 0.8));
      break;
    case "hat":
      out.push(`<ellipse cx="${f(hc)}" cy="0.22" rx="0.72" ry="0.09" fill="${cols[0] ?? "#4f3526"}" ${S}/>`);
      path(`M ${pts(hc - 0.36, 0.22)} L ${pts(hc - 0.32, -0.2)} Q ${pts(hc, -0.28, hc + 0.32, -0.2)} L ${pts(hc + 0.36, 0.22)} Z`, cols[0] ?? "#4f3526");
      break;
    case "beanie":
      path(`M ${pts(hc - rx - 0.03, 0.34)} C ${pts(hc - rx - 0.02, -0.15, hc + rx + 0.02, -0.15, hc + rx + 0.03, 0.34)} Z`, cols[0] ?? "#6b4a8f");
      out.push(`<rect x="${f(hc - rx - 0.04)}" y="0.22" width="${f(2 * rx + 0.08)}" height="0.12" fill="${shade(cols[0] ?? "#6b4a8f", 0.8)}" ${S}/>`);
      break;
    case "beret":
      out.push(`<ellipse cx="${f(hc + 0.08)}" cy="0.1" rx="${f(rx + 0.1)}" ry="0.16" fill="${cols[0] ?? "#8e2233"}" ${S} transform="rotate(-8 ${f(hc)} 0.1)"/>`);
      break;
    case "helmet":
      path(`M ${pts(hc - rx - 0.05, 0.45)} C ${pts(hc - rx - 0.05, -0.15, hc + rx + 0.05, -0.15, hc + rx + 0.05, 0.45)} Z`, cols[0] ?? "#56604a");
      break;
  }
  return out.join("");
}

/** Vertical crop (head units) for a shot size. */
export function figureCrop(a: Appearance, size: SketchSize): { top: number; bottom: number } {
  const g = geometry(a, "front");
  const tall = a.headwear === "gele" ? -0.85 : a.headwear === "hat" || a.hair.style === "bun" || a.hair.style === "afro" ? -0.45 : -0.25;
  switch (size) {
    case "CU": return { top: tall, bottom: g.sy(1.55) };
    case "MCU": return { top: tall - 0.05, bottom: g.sy(2.35) };
    case "MS": return { top: tall - 0.1, bottom: g.sy(3.9) };
    default: return { top: tall - 0.15, bottom: g.sy(7.5) + 0.3 };
  }
}

/** A complete nested <svg> drawing the character into a box, framed for the shot size. */
export function auraSketchFigure(a: Appearance, angle: SketchAngle, size: SketchSize, box: FigureBox, opts: FigureOptions = {}): { svg: string; engine_version: string } {
  const { top, bottom } = figureCrop(a, size);
  const h = bottom - top, w = h * (box.width / box.height);
  const shift = angle === "three_quarter" ? 0.05 : angle === "profile" ? 0.08 : 0;
  const st = opts.style ?? SKETCH_STYLES.drama;
  // The genre's colour treatment is applied to the whole figure; natural drama needs none.
  const fid = `fx${st.id}`;
  const body = auraSketchFigureShapes(a, angle, opts);
  // The genre's colour grade is applied to the colours themselves (no SVG filter — see gradeHex).
  const inner = st.id === "drama" ? body : gradeSvg(body, st);
  void fid;
  const svg = `<svg x="${f(box.x)}" y="${f(box.y)}" width="${f(box.width)}" height="${f(box.height)}" viewBox="${pts(-w / 2 + shift, top, w, h)}" preserveAspectRatio="xMidYMid meet" overflow="hidden">${inner}</svg>`;
  return { svg, engine_version: ENGINE_VERSION };
}
