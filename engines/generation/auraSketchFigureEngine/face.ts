// AuraSketch 3 — faces that look like the person (owner, 2026-10-02: "all character sketches just look the same").
// Face shape, eyes (shape, size, spacing, tilt, colour), brows, nose, lips, cheekbones, jaw and chin come from the
// Casting description, or are varied from the character's identity seed (characterAppearanceEngine ≥ 1.1.0). Drawn with
// soft volume (light from the upper left), eye detail (iris, pupil, catchlight, lids, lashes), shaped and tinted lips,
// age lines, freckles, dimples and a mole — and a mouth that can speak (visemes) and eyes that blink.
import type { Appearance, Face } from "../../character/characterAppearanceEngine/engine";
import type { SketchStyle } from "./style";
import type { Viseme, VisemeKey } from "./speech";

export const NEUTRAL_FACE: Face = {
  shape: "oval", eyes: { size: 1, spacing: 1, tilt: 0, shape: "almond", colour: "#3a2618" }, brows: { thickness: 1, arch: 0.5, tilt: 0 },
  nose: { length: 1, width: 1, bridge: "straight" }, lips: { fullness: 1, width: 1, upper: 0.85 }, cheekbones: 0.5, jaw: 1, chin: "round", ears: 1,
  freckles: false, dimples: false, lines: 0, mole: null,
};
export const faceOf = (a: Appearance): Face => a.face ?? { ...NEUTRAL_FACE, lines: a.life_stage === "elder" ? 0.85 : a.life_stage === "middle" ? 0.45 : 0 };

export type MouthMode =
  | { kind: "still" }
  | { kind: "talking"; track: VisemeKey[]; seconds: number; blinks: number[] };

const f = (n: number) => Math.round(n * 1000) / 1000;
const pts = (...xy: number[]) => xy.map(f).join(" ");
export const shade = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
};
export const mix = (a: string, b: string, t: number) => {
  const p = (h: string) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const x = p(a), y = p(b);
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
};
function seeded(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return (h % 10000) / 10000; };
}

const SHAPE: Record<Face["shape"], { rxK: number; jawK: number; cheekK: number; chinY: number; chinFlat: number }> = {
  oval: { rxK: 1, jawK: 1, cheekK: 1, chinY: 1.0, chinFlat: 0.5 },
  round: { rxK: 1.05, jawK: 1.22, cheekK: 1.03, chinY: 0.985, chinFlat: 0.75 },
  square: { rxK: 1.02, jawK: 1.32, cheekK: 1, chinY: 0.99, chinFlat: 1 },
  heart: { rxK: 1.03, jawK: 0.76, cheekK: 1.02, chinY: 1.0, chinFlat: 0.2 },
  long: { rxK: 0.92, jawK: 0.95, cheekK: 0.98, chinY: 1.05, chinFlat: 0.5 },
  diamond: { rxK: 0.96, jawK: 0.8, cheekK: 1.07, chinY: 1.0, chinFlat: 0.3 },
};
const CHIN_FLAT: Record<Face["chin"], number> = { round: 1, pointed: 0.45, square: 1.5, cleft: 1.1 };

export interface FaceGeo {
  rx: number; r2: number; jawHalf: number; chinY: number; chinX: number; cheekK: number; chinFlat: number;
  eyeY: number; eyes: { x: number; s: number; dir: number }[]; es: number; eh: number; tipY: number; my: number; mx: number; mouthHalf: number;
}

/** Where everything on the face sits (shared with glasses, facial hair and the ears in the figure engine). */
export function faceGeometry(fc: Face, hx: number, rxBase: number, jwBase: number, side: boolean, st: SketchStyle): FaceGeo {
  const sh = SHAPE[fc.shape];
  const rx = rxBase * sh.rxK, r2 = side ? rx * 0.86 : rx;
  const jawHalf = (jwBase + 0.06) * sh.jawK * fc.jaw;
  const sp = fc.eyes.spacing;
  const eyes = side ? [{ x: hx - 0.07 * sp, s: 1, dir: -1 }, { x: hx + 0.19 * sp, s: 0.72, dir: 1 }] : [{ x: hx - 0.13 * sp, s: 1, dir: -1 }, { x: hx + 0.13 * sp, s: 1, dir: 1 }];
  const es = 0.067 * fc.eyes.size * st.eyeScale;
  const eh = { almond: 0.032, round: 0.04, hooded: 0.027, narrow: 0.021, deep_set: 0.03 }[fc.eyes.shape] * fc.eyes.size * st.eyeScale;
  const tipY = 0.555 + 0.15 * fc.nose.length;
  const my = Math.max(tipY + 0.1, 0.82) + (sh.chinY - 1) * 0.5;
  return {
    rx, r2, jawHalf, chinY: sh.chinY, chinX: hx + (side ? 0.05 : 0), cheekK: sh.cheekK, chinFlat: sh.chinFlat * CHIN_FLAT[fc.chin],
    eyeY: 0.53, eyes, es, eh, tipY, my, mx: hx + (side ? 0.05 : 0), mouthHalf: 0.075 * fc.lips.width * (side ? 0.85 : 1),
  };
}

/** Lip colours from the skin: a natural tint, a touch warmer when the style has blush. */
function lipColours(skin: string, a: Appearance, st: SketchStyle) {
  const tint = 0.18 + (a.presentation === "feminine" ? 0.2 : 0.05) + st.blush * 0.1;
  const lower = mix(shade(skin, 0.8), "#a8505a", tint);
  return { upper: shade(lower, 0.85), lower, inside: "#2a1416", teeth: "#efe9df" };
}

/** One mouth shape, front or three-quarter. */
export function mouthShape(shape: Viseme, g: FaceGeo, fc: Face, skin: string, a: Appearance, st: SketchStyle, ink: string, lw: number): string {
  const { mx, my } = g;
  let hw = g.mouthHalf;
  const tu = 0.016 * fc.lips.fullness * fc.lips.upper, tl = 0.022 * fc.lips.fullness;
  const c = lipColours(skin, a, st);
  const open = { rest: 0, closed: 0, a: 0.05, e: 0.026, o: 0.044, l: 0.02, fv: 0.012 }[shape];
  if (shape === "o") hw *= 0.62;
  if (shape === "e") hw *= 1.06;
  if (shape === "closed") hw *= 0.96;
  const out: string[] = [];
  const up = shape === "closed" ? tu * 0.7 : tu;
  // Upper lip with a cupid's bow.
  const upper = `M ${pts(mx - hw, my)} Q ${pts(mx - hw * 0.45, my - up * 1.15, mx - hw * 0.13, my - up)} Q ${pts(mx, my - up * 0.55, mx + hw * 0.13, my - up)} Q ${pts(mx + hw * 0.45, my - up * 1.15, mx + hw, my)} Q ${pts(mx, my + 0.004, mx - hw, my)} Z`;
  if (open > 0) {
    // Open: the dark inside, upper teeth for wide vowels, then the lower lip dropped by the opening.
    out.push(`<path d="M ${pts(mx - hw * 0.92, my)} Q ${pts(mx, my - 0.006, mx + hw * 0.92, my)} Q ${pts(mx + hw * 0.7, my + open * 1.05, mx, my + open * 1.1)} Q ${pts(mx - hw * 0.7, my + open * 1.05, mx - hw * 0.92, my)} Z" fill="${c.inside}"/>`);
    if (shape === "a" || shape === "e" || shape === "fv") out.push(`<path d="M ${pts(mx - hw * 0.62, my + 0.002)} Q ${pts(mx, my - 0.002, mx + hw * 0.62, my + 0.002)} L ${pts(mx + hw * 0.55, my + Math.min(0.013, open * 0.45))} Q ${pts(mx, my + Math.min(0.016, open * 0.5), mx - hw * 0.55, my + Math.min(0.013, open * 0.45))} Z" fill="${c.teeth}"/>`);
    if (shape === "l") out.push(`<ellipse cx="${f(mx)}" cy="${f(my + open * 0.75)}" rx="${f(hw * 0.35)}" ry="${f(open * 0.3)}" fill="#a04650"/>`);
  }
  out.push(`<path d="${upper}" fill="${c.upper}" stroke="${ink}" stroke-width="${f(0.008 * lw)}" stroke-linejoin="round"/>`);
  const ly = my + open + (shape === "fv" ? -0.006 : 0);
  const lowT = shape === "closed" ? tl * 0.75 : shape === "fv" ? tl * 0.8 : tl;
  out.push(`<path d="M ${pts(mx - hw * 0.9, ly)} Q ${pts(mx, ly + lowT * 1.9, mx + hw * 0.9, ly)} Q ${pts(mx, ly + 0.005, mx - hw * 0.9, ly)} Z" fill="${c.lower}" stroke="${ink}" stroke-width="${f(0.007 * lw)}" stroke-opacity="0.6"/>`);
  out.push(`<ellipse cx="${f(mx - hw * 0.15)}" cy="${f(ly + lowT * 0.7)}" rx="${f(hw * 0.25)}" ry="${f(lowT * 0.22)}" fill="#ffffff" opacity="0.22"/>`);
  out.push(`<path d="M ${pts(mx - hw, my)} Q ${pts(mx, my + (open ? 0.002 : 0.006), mx + hw, my)}" fill="none" stroke="${ink}" stroke-width="${f((shape === "closed" ? 0.02 : 0.014) * lw)}" stroke-linecap="round"/>`);
  return out.join("");
}

/** A mouth that speaks (each shape shown at its time, looping with a pause) or stays at rest. */
function mouth(mode: MouthMode, g: FaceGeo, fc: Face, skin: string, a: Appearance, st: SketchStyle, ink: string, lw: number) {
  if (mode.kind === "still") return mouthShape("rest", g, fc, skin, a, st, ink, lw);
  const dur = mode.seconds + 1.2;
  const keys = mode.track.filter((k, i, all) => i === 0 || k.t > all[i - 1].t);
  const kt = keys.map((k) => f(Math.min(0.999, k.t / dur))).join(";");
  const shapes = [...new Set(keys.map((k) => k.shape).concat("rest"))] as Viseme[];
  return shapes.map((sh) => {
    const vals = keys.map((k) => (k.shape === sh ? 1 : 0)).join(";");
    return `<g opacity="${sh === "rest" ? 1 : 0}"><animate attributeName="opacity" calcMode="discrete" dur="${f(dur)}s" repeatCount="indefinite" keyTimes="${kt}" values="${vals}"/>${mouthShape(sh, g, fc, skin, a, st, ink, lw)}</g>`;
  }).join("");
}

/** Head outline (front / three-quarter), shading and every feature. Ears, hair, headwear and facial hair stay in the figure engine. */
export function drawFace(a: Appearance, hx: number, rxBase: number, jwBase: number, side: boolean, skin: string, st: SketchStyle, uid: string, mode: MouthMode, lw: number): { svg: string; geo: FaceGeo } {
  const fc = faceOf(a);
  const g = faceGeometry(fc, hx, rxBase, jwBase, side, st);
  const ink = st.ink;
  const { rx, r2, jawHalf, chinY, chinX, cheekK, chinFlat } = g;
  const jr = side ? jawHalf * 0.9 : jawHalf;
  const cf = Math.min(0.5, 0.3 * chinFlat);
  const out: string[] = [];
  const light = mix(mix(skin, "#ffffff", 0.14), st.key, 0.35 * st.grade), dark = mix(shade(skin, 0.8), st.shade, 0.3 * st.grade);
  const shadowCol = mix(shade(skin, 0.68), st.shade, 0.45 * st.grade);
  out.push(`<defs><radialGradient id="sk${uid}" cx="0.36" cy="0.34" r="0.78"><stop offset="0" stop-color="${light}"/><stop offset="0.55" stop-color="${skin}"/><stop offset="1" stop-color="${dark}"/></radialGradient></defs>`);
  // The chin's shadow falls on the neck (drawn first so the head covers its top).
  // Kept within the neck (centred on the neck, not the turned chin) so it never spills onto the collar.
  out.push(`<ellipse cx="${f(hx)}" cy="${f(chinY + 0.015)}" rx="0.1" ry="0.045" fill="${shadowCol}" opacity="${f(0.32 * st.shadow)}"/>`);
  const outline = `M ${pts(hx - rx, 0.48)} C ${pts(hx - rx, 0.02, hx + r2, 0.02, hx + r2, 0.48)} C ${pts(hx + r2 * cheekK, 0.72, chinX + jr, 0.86, chinX + jr * 0.6, 0.95)} C ${pts(chinX + jr * cf, chinY, chinX - jawHalf * cf, chinY, chinX - jawHalf * 0.6, 0.95)} C ${pts(chinX - jawHalf, 0.86, hx - rx * cheekK, 0.72, hx - rx, 0.48)} Z`;
  out.push(`<path d="${outline}" fill="url(#sk${uid})" stroke="${ink}" stroke-width="${f(0.022 * lw)}" stroke-linejoin="round"/>`);
  // Shadow side (light from the upper left), cheekbone shadows and a rim light on the dark edge.
  out.push(`<path d="M ${pts(hx + r2 * 0.55, 0.16)} Q ${pts(hx + r2 * 1.02, 0.3, hx + r2, 0.5)} C ${pts(hx + r2 * cheekK, 0.72, chinX + jr, 0.86, chinX + jr * 0.6, 0.95)} Q ${pts(chinX + jr * 0.3, 0.86, hx + r2 * 0.62, 0.66)} Q ${pts(hx + r2 * 0.72, 0.4, hx + r2 * 0.55, 0.16)} Z" fill="${shadowCol}" opacity="${f(Math.min(0.75, (0.28 + 0.25 * st.grade) * st.shadow))}"/>`);
  const cb = 0.12 + 0.22 * fc.cheekbones;
  for (const s of side ? [1] : [-1, 1]) out.push(`<ellipse cx="${f(hx + s * r2 * 0.62)}" cy="0.705" rx="0.1" ry="0.028" transform="rotate(${s * -22} ${f(hx + s * r2 * 0.62)} 0.705)" fill="${shadowCol}" opacity="${f(cb * 0.45 * st.shadow)}"/>`);
  // Highlights where the key light catches: forehead, cheekbones, chin.
  out.push(`<ellipse cx="${f(hx - r2 * 0.25)}" cy="0.26" rx="0.12" ry="0.06" fill="${light}" opacity="${f(0.35 + 0.2 * st.grade)}"/>`);
  for (const s of side ? [-1] : [-1, 1]) out.push(`<ellipse cx="${f(hx + s * r2 * 0.5)}" cy="0.64" rx="0.05" ry="0.022" fill="${light}" opacity="${f((0.25 + 0.3 * fc.cheekbones) * (s < 0 ? 1 : 0.5))}"/>`);
  out.push(`<ellipse cx="${f(chinX - 0.01)}" cy="${f(chinY - 0.05)}" rx="0.04" ry="0.018" fill="${light}" opacity="0.3"/>`);
  if (st.rim) out.push(`<path d="M ${pts(hx + r2 * 0.99, 0.56)} C ${pts(hx + r2 * cheekK, 0.72, chinX + jr, 0.86, chinX + jr * 0.6, 0.95)}" fill="none" stroke="${st.rim}" stroke-width="${f(0.018 * lw)}" stroke-linecap="round" opacity="0.65"/>`);
  if (st.blush > 0) for (const s of side ? [1] : [-1, 1]) out.push(`<ellipse cx="${f(hx + s * r2 * 0.55)}" cy="0.7" rx="0.08" ry="0.045" fill="#d9766f" opacity="${f(0.13 * st.blush * (a.presentation === "feminine" ? 1 : 0.55))}"/>`);

  // Eyes: socket shadow, white, iris (clipped to the lids), pupil, catchlight, lids, crease, lashes; blinking when talking.
  const brow = shade(a.hair.grey ? "#9a9a9e" : a.hair.colour, a.hair.grey ? 1 : 0.85);
  const bt = 0.022 * fc.brows.thickness * (a.presentation === "masculine" ? 1.22 : 1) * lw;
  g.eyes.forEach((e, i) => {
    const es = g.es * e.s, eh = g.eh * (side && e.dir > 0 ? 0.9 : 1), y = g.eyeY;
    const inner = [e.x - e.dir * es, y + 0.003], outer = [e.x + e.dir * es, y - fc.eyes.tilt * 0.012];
    const almond = `M ${pts(inner[0], inner[1])} Q ${pts(e.x - e.dir * es * 0.1, y - eh * 1.45, outer[0], outer[1])} Q ${pts(e.x + e.dir * es * 0.1, y + eh * 1.2, inner[0], inner[1])} Z`;
    out.push(`<ellipse cx="${f(e.x)}" cy="${f(y - eh * 1.2)}" rx="${f(es * 1.05)}" ry="${f(eh * 1.6)}" fill="${shade(skin, 0.7)}" opacity="${f((fc.eyes.shape === "deep_set" ? 0.45 : 0.22) * st.shadow)}"/>`);
    out.push(`<clipPath id="ec${uid}${i}"><path d="${almond}"/></clipPath>`);
    out.push(`<path d="${almond}" fill="#f3ede4"/>`);
    const ir = Math.min(eh * 1.05, es * 0.5), ix = e.x + (side ? 0.012 : 0);
    out.push(`<g clip-path="url(#ec${uid}${i})"><circle cx="${f(ix)}" cy="${f(y)}" r="${f(ir)}" fill="${fc.eyes.colour}" stroke="${shade(fc.eyes.colour, 0.6)}" stroke-width="0.004"/><circle cx="${f(ix)}" cy="${f(y)}" r="${f(ir * 0.45)}" fill="#111"/><circle cx="${f(ix - ir * 0.35)}" cy="${f(y - ir * 0.35)}" r="${f(ir * 0.22)}" fill="#fff" opacity="0.9"/><path d="M ${pts(e.x - es, y - eh * 1.4)} L ${pts(e.x + es, y - eh * 1.4)} L ${pts(e.x + es, y - eh * 0.55)} L ${pts(e.x - es, y - eh * 0.55)} Z" fill="#000" opacity="0.12"/></g>`);
    out.push(`<path d="M ${pts(inner[0], inner[1])} Q ${pts(e.x - e.dir * es * 0.1, y - eh * 1.45, outer[0], outer[1])}" fill="none" stroke="${ink}" stroke-width="${f(0.02 * lw)}" stroke-linecap="round"/>`);
    out.push(`<path d="M ${pts(inner[0], inner[1])} Q ${pts(e.x + e.dir * es * 0.1, y + eh * 1.2, outer[0], outer[1])}" fill="none" stroke="${ink}" stroke-width="${f(0.008 * lw)}" opacity="0.45"/>`);
    const crease = fc.eyes.shape === "hooded" ? 1.55 : 2.1;
    out.push(`<path d="M ${pts(e.x - e.dir * es * 0.75, y - eh * crease * 0.75)} Q ${pts(e.x, y - eh * crease * 1.05, e.x + e.dir * es * 0.95, y - eh * crease * 0.6)}" fill="none" stroke="${ink}" stroke-width="${f((fc.eyes.shape === "hooded" ? 0.014 : 0.009) * lw)}" opacity="0.55"/>`);
    if (a.presentation === "feminine") for (let k = 0; k < 3; k++) out.push(`<path d="M ${pts(e.x + e.dir * es * (0.45 + k * 0.22), y - eh * (1.1 - k * 0.15) - fc.eyes.tilt * 0.006 * k)} l ${pts(e.dir * 0.016, -0.018 + k * 0.004)}" stroke="${ink}" stroke-width="${f(0.007 * lw)}" stroke-linecap="round"/>`);
    // Brow over this eye.
    const by = 0.445 - 0.008 * fc.brows.arch;
    out.push(`<path d="M ${pts(e.x - e.dir * es * 0.95, by + 0.014 + fc.brows.tilt * 0.01)} Q ${pts(e.x + e.dir * es * 0.25, by - 0.022 - 0.03 * fc.brows.arch, e.x + e.dir * es * 1.2, by + 0.01)}" fill="none" stroke="${brow}" stroke-width="${f(bt * e.s)}" stroke-linecap="round"/>`);
    if (mode.kind === "talking" && mode.blinks.length) {
      const dur = mode.seconds + 1.2;
      const times: number[] = [], vals: number[] = [];
      times.push(0); vals.push(0);
      for (const b of mode.blinks) { times.push(b / dur, (b + 0.12) / dur); vals.push(1, 0); }
      out.push(`<g opacity="0"><animate attributeName="opacity" calcMode="discrete" dur="${f(dur)}s" repeatCount="indefinite" keyTimes="${times.map((t) => f(Math.min(0.999, t))).join(";")}" values="${vals.join(";")}"/><path d="${almond}" fill="${skin}"/><path d="M ${pts(inner[0], inner[1])} Q ${pts(e.x, y + eh * 0.5, outer[0], outer[1])}" fill="none" stroke="${ink}" stroke-width="${f(0.016 * lw)}"/></g>`);
    }
  });

  // Nose: bridge on the shadow side, base and nostrils (wider, longer, curved, flat or upturned), tip highlight.
  const nw = 0.045 * fc.nose.width, ty = g.tipY + (fc.nose.bridge === "upturned" ? -0.012 : 0);
  if (side) {
    const tx = hx + 0.085 + 0.035 * fc.nose.length + (fc.nose.bridge === "curved" ? 0.008 : 0) + (fc.nose.bridge === "flat" ? -0.01 : 0);
    out.push(`<path d="M ${pts(hx + 0.06, 0.6)} ${fc.nose.bridge === "curved" ? `Q ${pts(tx + 0.006, ty - 0.06, tx, ty)}` : `Q ${pts(tx - 0.008, ty - 0.05, tx, ty)}`} Q ${pts(tx + 0.006, ty + 0.028, tx - 0.025 - nw * 0.3, ty + 0.03)}" fill="none" stroke="${ink}" stroke-width="${f(0.013 * lw)}" stroke-linecap="round" opacity="0.8"/>`);
    out.push(`<path d="M ${pts(hx + 0.055, ty - 0.03)} Q ${pts(tx - 0.01, ty - 0.01, tx - 0.02, ty + 0.025)} L ${pts(hx + 0.04, ty + 0.03)} Z" fill="${shadowCol}" opacity="${f(0.3 * st.shadow)}"/>`);
    out.push(`<ellipse cx="${f(tx - 0.03)}" cy="${f(ty + 0.02)}" rx="${f(nw * 0.32)}" ry="0.008" fill="${shade(skin, 0.45)}"/>`);
    out.push(`<path d="M ${pts(hx - 0.01, ty + 0.012)} Q ${pts(hx - 0.02, ty + 0.03, hx + 0.005, ty + 0.032)}" fill="none" stroke="${ink}" stroke-width="${f(0.01 * lw)}" opacity="0.6"/>`);
  } else {
    out.push(`<path d="M ${pts(hx + 0.03, 0.56)} Q ${pts(hx + 0.05 + (fc.nose.bridge === "curved" ? 0.012 : 0), ty - 0.06, hx + nw * 0.55, ty)}" fill="none" stroke="${ink}" stroke-width="${f(0.011 * lw)}" opacity="${fc.nose.bridge === "flat" ? 0.3 : 0.55}"/>`);
    out.push(`<path d="M ${pts(hx + 0.012, 0.58)} Q ${pts(hx + 0.04, ty - 0.03, hx + nw * 0.9, ty + 0.01)} L ${pts(hx + nw * 0.4, ty + 0.025)} Q ${pts(hx + 0.02, ty - 0.02, hx + 0.012, 0.58)} Z" fill="${shade(skin, 0.72)}" opacity="${f(0.25 * st.shadow)}"/>`);
    out.push(`<path d="M ${pts(hx - nw, ty - 0.004)} Q ${pts(hx - nw * 0.95, ty + 0.03, hx - nw * 0.35, ty + 0.022)} Q ${pts(hx, ty + 0.04, hx + nw * 0.35, ty + 0.022)} Q ${pts(hx + nw * 0.95, ty + 0.03, hx + nw, ty - 0.004)}" fill="none" stroke="${ink}" stroke-width="${f(0.014 * lw)}" stroke-linecap="round"/>`);
    const nr = fc.nose.bridge === "upturned" ? 1.4 : fc.nose.bridge === "flat" ? 1.2 : 1;
    for (const s of [-1, 1]) out.push(`<ellipse cx="${f(hx + s * nw * 0.45)}" cy="${f(ty + 0.017)}" rx="${f(0.011 * nr * fc.nose.width)}" ry="${f(0.006 * nr)}" fill="${shade(skin, 0.42)}"/>`);
    out.push(`<ellipse cx="${f(hx - 0.006)}" cy="${f(ty - 0.012)}" rx="${f(nw * 0.35)}" ry="0.01" fill="${light}" opacity="0.55"/>`);
    for (const s of [-1, 1]) out.push(`<path d="M ${pts(hx + s * nw * 0.8, ty - 0.03)} Q ${pts(hx + s * nw * 1.12, ty, hx + s * nw * 0.85, ty + 0.022)}" fill="none" stroke="${ink}" stroke-width="${f(0.009 * lw)}" opacity="0.55"/>`);
  }
  // Under the nose and the lower lip: soft shadows. Then the mouth.
  out.push(`<ellipse cx="${f(g.mx)}" cy="${f(g.my + 0.05)}" rx="${f(g.mouthHalf * 0.6)}" ry="0.014" fill="${shade(skin, 0.7)}" opacity="${f(0.3 * st.shadow)}"/>`);
  out.push(mouth(mode, g, fc, skin, a, st, ink, lw));
  if (fc.dimples) for (const s of side ? [1] : [-1, 1]) out.push(`<path d="M ${pts(g.mx + s * (g.mouthHalf + 0.02), g.my - 0.012)} q ${pts(s * 0.012, 0.012, 0, 0.026)}" fill="none" stroke="${ink}" stroke-width="${f(0.008 * lw)}" opacity="0.45"/>`);

  // Age lines: forehead, crow's feet, under the eyes and the folds from nose to mouth.
  if (fc.lines > 0.05) {
    const o = Math.min(0.75, 0.2 + 0.5 * fc.lines);
    out.push(`<path d="M ${pts(hx - 0.14, 0.3)} Q ${pts(hx, 0.27, hx + 0.14, 0.3)} M ${pts(hx - 0.12, 0.35)} Q ${pts(hx, 0.32, hx + 0.12, 0.35)}" fill="none" stroke="${ink}" stroke-width="${f(0.009 * lw)}" opacity="${f(o * (fc.lines > 0.5 ? 1 : 0.6))}"/>`);
    for (const e of g.eyes) out.push(`<path d="M ${pts(e.x + e.dir * g.es * 1.15 * e.s, g.eyeY - 0.01)} l ${pts(e.dir * 0.03, -0.012)} M ${pts(e.x + e.dir * g.es * 1.15 * e.s, g.eyeY + 0.005)} l ${pts(e.dir * 0.03, 0.008)} M ${pts(e.x - g.es * 0.6, g.eyeY + g.eh * 1.9)} Q ${pts(e.x, g.eyeY + g.eh * 2.5, e.x + g.es * 0.6, g.eyeY + g.eh * 1.9)}" fill="none" stroke="${ink}" stroke-width="${f(0.008 * lw)}" opacity="${f(o * 0.8)}"/>`);
    for (const s of side ? [1] : [-1, 1]) out.push(`<path d="M ${pts(hx + s * nw * 1.3, g.tipY + 0.01)} Q ${pts(hx + s * (g.mouthHalf + 0.05), g.my - 0.04, g.mx + s * (g.mouthHalf + 0.03), g.my + 0.03)}" fill="none" stroke="${ink}" stroke-width="${f(0.01 * lw)}" opacity="${f(o * 0.75)}"/>`);
  }
  if (fc.freckles) {
    const r = seeded(`${a.identity_seed ?? ""}:freckles`);
    for (let k = 0; k < 16; k++) { const s = k % 2 ? 1 : -1; out.push(`<circle cx="${f(hx + s * (0.05 + r() * 0.17))}" cy="${f(0.6 + r() * 0.09)}" r="${f(0.004 + r() * 0.004)}" fill="${shade(skin, 0.62)}" opacity="0.6"/>`); }
  }
  if (fc.mole) out.push(`<circle cx="${f(hx + fc.mole.x * (side ? 0.7 : 1))}" cy="${f(fc.mole.y)}" r="0.009" fill="${shade(skin, 0.35)}"/>`);
  return { svg: out.join(""), geo: g };
}

/** Profile: forehead, brow, nose (length and bridge), lips (fullness), chin and jaw from the face; an eye and brow; a speaking mouth. */
export function drawProfileFace(a: Appearance, skin: string, st: SketchStyle, uid: string, mode: MouthMode, lw: number): string {
  const fc = faceOf(a), ink = st.ink;
  const tx = 0.33 + 0.065 * fc.nose.length + (fc.nose.bridge === "flat" ? -0.02 : 0);
  const ty = 0.6 + 0.025 * (fc.nose.length - 1) + (fc.nose.bridge === "upturned" ? -0.012 : 0);
  const bridge = fc.nose.bridge === "curved" ? `Q ${pts(tx - 0.005, 0.5, tx, ty)}` : fc.nose.bridge === "upturned" ? `Q ${pts(tx - 0.035, ty - 0.02, tx, ty)}` : `L ${pts(tx, ty)}`;
  const ul = 0.3 + 0.025 * fc.lips.fullness, ll = 0.29 + 0.025 * fc.lips.fullness;
  const chin = fc.chin === "pointed" ? [0.28, 0.99] : fc.chin === "square" ? [0.26, 0.97] : [0.27, 0.97];
  const jaw = -0.1 - 0.05 * (fc.jaw - 1);
  const d = `M ${pts(-0.33, 0.5)} C ${pts(-0.35, 0.02, 0.3, -0.03, 0.32, 0.42)} ${bridge} L ${pts(0.32, ty + 0.03)} Q ${pts(ul + 0.02, 0.72, ul, 0.76)} Q ${pts(ll + 0.03, 0.81, ll - 0.01, 0.85)} Q ${pts(chin[0], chin[1], 0.12, 1.0)} Q ${pts(-0.04, 1.0, jaw, 0.9)} L ${pts(-0.19, 0.93)} C ${pts(-0.31, 0.84, -0.33, 0.7, -0.33, 0.5)} Z`;
  const out: string[] = [];
  out.push(`<defs><radialGradient id="sk${uid}" cx="0.62" cy="0.36" r="0.8"><stop offset="0" stop-color="${mix(skin, "#ffffff", 0.14)}"/><stop offset="0.6" stop-color="${skin}"/><stop offset="1" stop-color="${shade(skin, 0.8)}"/></radialGradient></defs>`);
  out.push(`<path d="${d}" fill="url(#sk${uid})" stroke="${ink}" stroke-width="${f(0.022 * lw)}" stroke-linejoin="round"/>`);
  if (st.rim) out.push(`<path d="M ${pts(0.32, 0.42)} ${bridge}" fill="none" stroke="${st.rim}" stroke-width="${f(0.016 * lw)}" opacity="0.6"/>`);
  out.push(`<ellipse cx="0.05" cy="0.75" rx="0.12" ry="0.12" fill="${shade(skin, 0.72)}" opacity="${f(0.2 * st.shadow)}"/>`);
  const ew = 0.04 * fc.eyes.size * st.eyeScale;
  out.push(`<path d="M ${pts(0.21 - ew, 0.525)} Q ${pts(0.21, 0.495, 0.21 + ew, 0.52)} Q ${pts(0.21, 0.55, 0.21 - ew, 0.525)} Z" fill="#f3ede4" stroke="${ink}" stroke-width="${f(0.012 * lw)}"/><circle cx="0.226" cy="0.522" r="${f(0.014 * fc.eyes.size)}" fill="${fc.eyes.colour}"/><circle cx="0.228" cy="0.522" r="0.007" fill="#111"/>`);
  const brow = shade(a.hair.grey ? "#9a9a9e" : a.hair.colour, a.hair.grey ? 1 : 0.85);
  out.push(`<path d="M 0.14 0.45 Q 0.21 ${f(0.42 - 0.02 * fc.brows.arch)} 0.29 0.445" fill="none" stroke="${brow}" stroke-width="${f(0.026 * fc.brows.thickness * lw)}" stroke-linecap="round"/>`);
  out.push(`<ellipse cx="${f(tx - 0.04)}" cy="${f(ty + 0.022)}" rx="0.012" ry="0.007" fill="${shade(skin, 0.45)}"/>`);
  // Mouth in profile: the lip line, opening for open sounds.
  const shapes: Viseme[] = mode.kind === "talking" ? ([...new Set(mode.track.map((k) => k.shape).concat("rest"))] as Viseme[]) : ["rest"];
  const lips = (sh: Viseme) => {
    const open = { rest: 0, closed: 0, a: 0.045, e: 0.022, o: 0.04, l: 0.018, fv: 0.01 }[sh];
    return open ? `<path d="M ${pts(ul - 0.06, 0.8)} L ${pts(ul - 0.005, 0.8 - open * 0.3)} L ${pts(ll - 0.01, 0.8 + open * 0.7)} Z" fill="#2a1416"/>` : `<path d="M ${pts(ul - 0.005, 0.8)} L ${pts(0.22, 0.81)}" stroke="${ink}" stroke-width="${f(0.016 * lw)}" stroke-linecap="round"/>`;
  };
  if (mode.kind === "still") out.push(lips("rest"));
  else {
    const dur = mode.seconds + 1.2;
    const keys = mode.track.filter((k, i, all) => i === 0 || k.t > all[i - 1].t);
    const kt = keys.map((k) => f(Math.min(0.999, k.t / dur))).join(";");
    for (const sh of shapes) out.push(`<g opacity="${sh === "rest" ? 1 : 0}"><animate attributeName="opacity" calcMode="discrete" dur="${f(dur)}s" repeatCount="indefinite" keyTimes="${kt}" values="${keys.map((k) => (k.shape === sh ? 1 : 0)).join(";")}"/>${lips(sh)}</g>`);
  }
  if (faceOf(a).lines > 0.4) out.push(`<path d="M 0.2 0.6 L 0.25 0.585 M 0.2 0.62 L 0.25 0.63" stroke="${ink}" stroke-width="${f(0.008 * lw)}" opacity="0.5"/>`);
  return out.join("");
}
