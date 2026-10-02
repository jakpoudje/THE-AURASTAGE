// apps/api/src/providers/sketch/sketchAdapter.ts
// "AuraStage Sketch": a built-in, deterministic storyboard-frame renderer. It is
// NOT an AI model and is labelled as a sketch everywhere. It lets the whole
// generation pipeline (package -> job -> worker -> storage -> take -> approval)
// run with no external account, and gives every shot a readable frame.
import type { GenerateRequest, GenerateResult, ProviderAdapter, StillRequest } from "../types";
import { ProviderError } from "../types";
import { characterAppearanceEngine, drawAuraSketchFigure, placeSketchEngine, sketchStyleFor } from "@aurastage/engines";
import type { SketchAngle, SketchSize } from "@aurastage/engines";

const RATIO: Record<string, [number, number]> = { "16:9": [1280, 720], "9:16": [720, 1280], "1:1": [1024, 1024], "2.39:1": [1434, 600], "4:3": [1024, 768] };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function wrap(text: string, max: number, lines: number) {
  const out: string[] = [];
  let cur = "";
  for (const w of text.split(/\s+/)) {
    if ((cur + " " + w).trim().length > max) {
      out.push(cur.trim());
      cur = w;
      if (out.length === lines) break;
    } else cur += " " + w;
  }
  if (out.length < lines && cur.trim()) out.push(cur.trim());
  return out;
}

/** Deterministic: the same package + seed always gives the same frame. */
export function renderSketch(req: GenerateRequest): string {
  const [W, H] = RATIO[req.aspect_ratio] ?? RATIO["16:9"];
  const p = req.package;
  const size = p.camera.size;
  const n = size === "TWO_SHOT" ? 2 : size === "THREE_SHOT" ? 3 : size === "GROUP" ? 4 : Math.max(1, Math.min(3, p.characters.length || 1));
  const people = ["CU", "ECU", "MCU", "OTS", "POV", "CUTAWAY"].includes(size) ? 1 : n;
  const angle = p.camera.angle;
  const horizon = ["high", "overhead", "birds_eye"].includes(angle) ? 0.35 : ["low", "worms_eye"].includes(angle) ? 0.8 : 0.62;
  const tilt = angle === "dutch" ? 12 : 0;
  const night = /night|dusk|evening/i.test(p.scene.time_of_day ?? "");
  const seed = req.seed ?? 0;
  // AuraSketch 3: the film's genre sets the look of every figure and the frame.
  const style = sketchStyleFor(p.project.genre, p.project.tone);
  const fo = { style };
  const bg = night ? "#0d1220" : style.frame;
  const figures: string[] = [];
  // AuraSketch 2: the characters in frame, drawn from their Casting description, wardrobe for the scene and age.
  const cast = p.characters.map((c) => characterAppearanceEngine({
    name: c.name, age: c.age, gender: c.gender ?? null, description: c.description, wardrobe: c.wardrobe,
    age_state: c.age_state ? { age: c.age ?? "", description: c.age_state.description } : null,
  }));
  const neutral = characterAppearanceEngine({});
  const personAt = (i: number) => cast[i] ?? cast[0] ?? neutral;
  // Figure size for the shot: how much of the body is in frame and how tall the figure stands in the frame.
  const FR: Record<string, { crop: SketchSize; h: number; floor: number }> = {
    EWS: { crop: "FULL", h: 0.22, floor: 0.7 }, WS: { crop: "FULL", h: 0.45, floor: 0.78 }, FULL: { crop: "FULL", h: 0.82, floor: 0.92 },
    MWS: { crop: "FULL", h: 0.95, floor: 1.0 }, COWBOY: { crop: "MS", h: 0.95, floor: 1.0 }, MS: { crop: "MS", h: 0.95, floor: 1.0 },
    TWO_SHOT: { crop: "MS", h: 0.95, floor: 1.0 }, THREE_SHOT: { crop: "MS", h: 0.9, floor: 1.0 }, GROUP: { crop: "FULL", h: 0.7, floor: 0.9 },
    MCU: { crop: "MCU", h: 1, floor: 1.0 }, OTS: { crop: "MCU", h: 0.95, floor: 1.0 }, POV: { crop: "MS", h: 0.7, floor: 0.95 },
    CU: { crop: "CU", h: 1, floor: 1.0 }, ECU: { crop: "CU", h: 1.25, floor: 1.1 }, CUTAWAY: { crop: "MS", h: 0.8, floor: 1.0 },
  };
  const fr = FR[size];
  if (size === "INSERT") figures.push(`<rect x="${W * 0.3}" y="${H * 0.25}" width="${W * 0.4}" height="${H * 0.5}" rx="12" fill="#8a8a95"/>`);
  else if (fr) {
    const fh = H * fr.h, bottom = H * fr.floor;
    if (size === "OTS") {
      // Over the shoulder: the other person seen from behind in the foreground, the subject facing us.
      figures.push(drawAuraSketchFigure(personAt(0), "three_quarter", "MCU", { x: W * 0.42, y: bottom - fh, width: W * 0.45, height: fh }, fo).svg);
      figures.push(drawAuraSketchFigure(personAt(1), "back", "MCU", { x: -W * 0.08, y: H * 0.2, width: W * 0.5, height: H * 1.05 }, fo).svg);
    } else {
      const n = people;
      const bw = Math.min(W / n, fh * (fr.crop === "FULL" ? 0.55 : fr.crop === "MS" ? 0.75 : 1.1));
      for (let i = 0; i < n; i++) {
        const cx = W * ((i + 1) / (n + 1)) + ((seed * 37 + i * 11) % 21) - 10;
        const angle: SketchAngle = n === 1 ? "front" : "three_quarter";
        const fig = drawAuraSketchFigure(personAt(i), angle, fr.crop, { x: -bw / 2, y: 0, width: bw, height: fh }, fo).svg;
        // In two- and three-shots the people turn towards each other (the right-hand side is mirrored).
        const mirror = n > 1 && cx > W / 2;
        figures.push(`<g transform="translate(${cx} ${bottom - fh})${mirror ? " scale(-1 1)" : ""}">${fig}</g>`);
      }
    }
  }
  const caption = wrap(p.performance.action || p.camera.size_label, Math.round(W / 16), 2);
  const who = p.characters.map((c) => c.name).join(", ");
  const meta = [p.camera.size_label, p.camera.lens_mm ? `${p.camera.lens_mm}mm` : null, `${p.camera.duration_seconds}s`].filter(Boolean).join(" · ");
  const fs = Math.round(H / 26);
  // AuraSketch places: the scene's location, built from its description, behind the characters — wide for wide shots,
  // closer for medium shots, the main surface for close-ups and inserts.
  const placeView = ["EWS", "WS", "FULL", "MWS", "GROUP"].includes(size) ? "wide" : ["CU", "ECU", "INSERT"].includes(size) ? "detail" : "medium";
  const place = placeSketchEngine({
    name: p.world?.location?.name ?? p.scene.location, description: [p.world?.location?.description, p.scene.atmosphere, p.scene.weather].filter(Boolean).join(". "),
    int_ext: p.scene.int_ext.split(/[./ ]+/).filter((x) => x === "INT" || x === "EXT"), time: p.scene.time_of_day, view: placeView, width: W, height: H, style, seed: p.world?.location?.id ?? p.scene.location,
  }).svg;
  void bg; void horizon;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
${place}
<g transform="rotate(${tilt} ${W / 2} ${H / 2})">${figures.join("")}</g>
<rect x="0" y="${H - fs * 4.2}" width="${W}" height="${fs * 4.2}" fill="#000" opacity="0.72"/>
${caption.map((l, i) => `<text x="${fs}" y="${H - fs * (3 - i * 1.25)}" font-family="Helvetica,Arial,sans-serif" font-size="${fs}" fill="#f2f2f2">${esc(l)}</text>`).join("")}
<text x="${fs}" y="${fs * 1.6}" font-family="Helvetica,Arial,sans-serif" font-size="${Math.round(fs * 0.8)}" fill="#e8b84b">AURASTAGE SKETCH · Scene ${p.scene.number} · ${esc(meta)}</text>
${who ? `<text x="${W - fs}" y="${fs * 1.6}" text-anchor="end" font-family="Helvetica,Arial,sans-serif" font-size="${Math.round(fs * 0.8)}" fill="#bbbbc4">${esc(who)}</text>` : ""}
</svg>`;
}

/**
 * AuraSketch 2 character sheet: the character drawn from their appearance (build, age, hair, face, headwear, clothes and
 * colours from the Casting profile and wardrobe) for the angle, framed for the shot size, on a concept-sheet page.
 * Deterministic. Labelled as a sketch, not AI.
 */
export function renderCharacterSketch(req: StillRequest): string {
  const [W, H] = RATIO[req.aspect_ratio] ?? RATIO["1:1"];
  const s0 = req.sketch;
  const k = s0 && (s0.kind ?? "character") === "character" ? (s0 as Extract<NonNullable<StillRequest["sketch"]>, { angle: string }>) : { title: "Reference", subtitle: "", angle: "front" as const, size: "MS" as const, lines: [] as string[], appearance: undefined };
  const appearance = k.appearance ?? characterAppearanceEngine({ description: k.lines.join(". ") });
  const fs = Math.round(Math.min(W, H) / 30);
  const lines = k.lines.flatMap((l) => wrap(l, Math.round(W / (fs * 0.55)), 2)).slice(0, 3);
  const headH = fs * 3.9, footH = fs * (lines.length * 1.3 + 1.2);
  const style = sketchStyleFor("genre" in k ? k.genre : null);
  const fig = drawAuraSketchFigure(appearance, k.angle, k.size, { x: W * 0.04, y: headH, width: W * 0.92, height: H - headH - footH }, { style }).svg;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<rect width="${W}" height="${H}" fill="${style.paper}"/>
<rect x="${fs * 0.5}" y="${fs * 0.5}" width="${W - fs}" height="${H - fs}" fill="none" stroke="#d9d2c3" stroke-width="2"/>
${fig}
<rect x="0" y="${H - footH}" width="${W}" height="${footH}" fill="#2b2622" opacity="0.88"/>
${lines.map((l, i) => `<text x="${fs}" y="${H - fs * ((lines.length - i) * 1.3 - 0.4)}" font-family="Helvetica,Arial,sans-serif" font-size="${fs}" fill="#f3efe6">${esc(l)}</text>`).join("")}
<text x="${fs}" y="${fs * 1.9}" font-family="Helvetica,Arial,sans-serif" font-size="${Math.round(fs * 1.1)}" font-weight="bold" fill="#2b2622">${esc(k.title)}</text>
<text x="${fs}" y="${fs * 3.2}" font-family="Helvetica,Arial,sans-serif" font-size="${Math.round(fs * 0.85)}" fill="#6b645a">${esc(k.subtitle)} · AURASKETCH (not AI)</text>
</svg>`;
}

type Sk = NonNullable<StillRequest["sketch"]>;
const SKY: Record<string, [string, string]> = {
  NIGHT: ["#070b16", "#141c33"], DAWN: ["#3a2c3f", "#c98b5f"], DUSK: ["#2b1f33", "#b8674a"], MORNING: ["#5e7fa1", "#b8cbe0"],
  EVENING: ["#2f2a40", "#a9674d"], AFTERNOON: ["#4f7ca8", "#a9c6e0"], DAY: ["#4f7ca8", "#a9c6e0"],
};
function frame(W: number, H: number, k: Sk, body: string) {
  const fs = Math.round(Math.min(W, H) / 30);
  const lines = k.lines.flatMap((l) => wrap(l, Math.round(W / (fs * 0.55)), 2)).slice(0, 3);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
${body}
<rect x="0" y="${H - fs * (lines.length * 1.3 + 1.2)}" width="${W}" height="${fs * (lines.length * 1.3 + 1.2)}" fill="#000" opacity="0.7"/>
${lines.map((l, i) => `<text x="${fs}" y="${H - fs * ((lines.length - i) * 1.3 - 0.4)}" font-family="Helvetica,Arial,sans-serif" font-size="${fs}" fill="#eee">${esc(l)}</text>`).join("")}
<rect x="0" y="0" width="${W}" height="${fs * 3.8}" fill="#000" opacity="0.45"/>
<text x="${fs}" y="${fs * 1.7}" font-family="Helvetica,Arial,sans-serif" font-size="${Math.round(fs * 1.1)}" fill="#e8b84b">${esc(k.title)}</text>
<text x="${fs}" y="${fs * 3.1}" font-family="Helvetica,Arial,sans-serif" font-size="${Math.round(fs * 0.85)}" fill="#bbbbc4">${esc(k.subtitle)} · AURASTAGE SKETCH (not AI)</text>
</svg>`;
}

/**
 * A location sketch (AuraSketch for places, placeSketchEngine): the place read from its name and description and built in
 * 3D perspective — the right kind of room or exterior, furnished, with the materials, condition, light, time of day,
 * weather and the film's genre look. Deterministic. Labelled as a sketch.
 */
export function renderLocationSketch(req: StillRequest): string {
  const [W, H] = RATIO[req.aspect_ratio] ?? RATIO["16:9"];
  const k = req.sketch as Extract<Sk, { kind: "location" }>;
  const view = (["establishing", "wide", "medium", "detail"].includes(k.view) ? k.view : "wide") as "establishing" | "wide" | "medium" | "detail";
  const out = placeSketchEngine({ name: k.title, description: k.description ?? k.lines.join(". "), int_ext: k.int_ext, time: k.time, view, width: W, height: H, style: sketchStyleFor(k.genre ?? null), seed: k.seed ?? k.title });
  return frame(W, H, k, out.svg);
}

/** A labelled prop sketch: the object drawn for the view (a box, a vehicle silhouette), a hand for scale. Deterministic. */
export function renderPropSketch(req: StillRequest): string {
  const [W, H] = RATIO[req.aspect_ratio] ?? RATIO["1:1"];
  const k = req.sketch as Extract<Sk, { kind: "prop" }>;
  const cx = W / 2, cy = H * 0.5, parts: string[] = [`<rect width="${W}" height="${H}" fill="#2b2a31"/>`, `<ellipse cx="${cx}" cy="${H * 0.72}" rx="${W * 0.3}" ry="${H * 0.04}" fill="#1c1b21"/>`];
  const s = k.view === "detail" ? 1.8 : k.view === "in_hand" ? 0.7 : 1;
  if (k.category === "vehicle") {
    const w = W * 0.55 * s, h = H * 0.16 * s, y = H * 0.66 - h;
    parts.push(`<path d="M ${cx - w / 2} ${y + h} L ${cx - w / 2} ${y + h * 0.45} L ${cx - w * 0.25} ${y} L ${cx + w * 0.3} ${y} L ${cx + w / 2} ${y + h * 0.45} L ${cx + w / 2} ${y + h} Z" fill="#8a8795"/>`);
    parts.push(`<circle cx="${cx - w * 0.3}" cy="${y + h}" r="${h * 0.3}" fill="#1f1e24"/><circle cx="${cx + w * 0.3}" cy="${y + h}" r="${h * 0.3}" fill="#1f1e24"/>`);
    if (k.view === "in_hand") parts.push(`<circle cx="${cx + w * 0.75}" cy="${H * 0.66 - h * 2.3}" r="${h * 0.22}" fill="#b9b3ad"/><rect x="${cx + w * 0.7}" y="${H * 0.66 - h * 2.05}" width="${h * 0.2}" height="${h * 2.05}" fill="#7d7a88"/>`);
  } else {
    const w = W * 0.3 * s, h = H * 0.22 * s;
    const skew = k.view === "three_quarter" ? w * 0.25 : 0;
    if (k.view === "overhead") parts.push(`<rect x="${cx - w / 2}" y="${cy - w / 2}" width="${w}" height="${w}" rx="${w * 0.06}" fill="#8a8795" stroke="#55535e" stroke-width="4"/>`);
    else {
      parts.push(`<polygon points="${cx - w / 2},${cy - h / 2} ${cx + w / 2},${cy - h / 2} ${cx + w / 2},${cy + h / 2} ${cx - w / 2},${cy + h / 2}" fill="#8a8795"/>`);
      if (skew) parts.push(`<polygon points="${cx + w / 2},${cy - h / 2} ${cx + w / 2 + skew},${cy - h / 2 - skew * 0.5} ${cx + w / 2 + skew},${cy + h / 2 - skew * 0.5} ${cx + w / 2},${cy + h / 2}" fill="#6c6977"/>`);
      if (k.view === "detail") for (let i = 0; i < 5; i++) parts.push(`<line x1="${cx - w * 0.4}" x2="${cx + w * 0.4}" y1="${cy - h * 0.3 + i * h * 0.14}" y2="${cy - h * 0.3 + i * h * 0.14}" stroke="#55535e" stroke-width="3"/>`);
    }
    if (k.view === "in_hand") parts.push(`<path d="M ${cx - w * 0.9} ${cy + h * 1.4} Q ${cx - w * 0.7} ${cy + h * 0.3} ${cx - w * 0.45} ${cy + h * 0.2} L ${cx + w * 0.2} ${cy + h * 0.55} Q ${cx - w * 0.2} ${cy + h * 1.3} ${cx - w * 0.3} ${cy + h * 1.6} Z" fill="#b9b3ad"/>`);
  }
  return frame(W, H, k, parts.join(""));
}

export const sketchAdapter: ProviderAdapter = {
  id: "aurastage-sketch",
  name: "AuraStage Sketch",
  capabilities: ["image"],
  models: [{ id: "sketch-v1", capability: "image", label: "Storyboard sketch (built in, free)" }],
  note: "Built-in storyboard sketches drawn from the shot plan. Not AI — for layout and blocking.",
  isConfigured: () => true,
  async generate(req: GenerateRequest): Promise<GenerateResult> {
    if (req.capability !== "image") throw new ProviderError("AuraStage Sketch only draws still frames.");
    return { bytes: new TextEncoder().encode(renderSketch(req)), media_type: "image/svg+xml", provider_request_id: null, cost_usd: 0 };
  },
  async generateStill(req: StillRequest): Promise<GenerateResult> {
    const svg = req.sketch?.kind === "location" ? renderLocationSketch(req) : req.sketch?.kind === "prop" ? renderPropSketch(req) : renderCharacterSketch(req);
    return { bytes: new TextEncoder().encode(svg), media_type: "image/svg+xml", provider_request_id: null, cost_usd: 0 };
  },
};
