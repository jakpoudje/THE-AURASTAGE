// apps/api/src/providers/sketch/sketchAdapter.ts
// "AuraStage Sketch": a built-in, deterministic storyboard-frame renderer. It is
// NOT an AI model and is labelled as a sketch everywhere. It lets the whole
// generation pipeline (package -> job -> worker -> storage -> take -> approval)
// run with no external account, and gives every shot a readable frame.
import type { GenerateRequest, GenerateResult, ProviderAdapter, StillRequest } from "../types";
import { ProviderError } from "../types";

const RATIO: Record<string, [number, number]> = { "16:9": [1280, 720], "9:16": [720, 1280], "1:1": [1024, 1024], "2.39:1": [1434, 600], "4:3": [1024, 768] };
const HEAD: Record<string, { r: number; y: number }> = {
  EWS: { r: 0.02, y: 0.66 }, WS: { r: 0.035, y: 0.55 }, FULL: { r: 0.06, y: 0.3 }, MWS: { r: 0.08, y: 0.33 }, COWBOY: { r: 0.09, y: 0.33 },
  MS: { r: 0.12, y: 0.36 }, MCU: { r: 0.17, y: 0.4 }, CU: { r: 0.27, y: 0.48 }, ECU: { r: 0.5, y: 0.52 }, TWO_SHOT: { r: 0.1, y: 0.36 },
  THREE_SHOT: { r: 0.08, y: 0.36 }, GROUP: { r: 0.06, y: 0.38 }, OTS: { r: 0.15, y: 0.4 }, POV: { r: 0.08, y: 0.4 }, CUTAWAY: { r: 0.1, y: 0.4 },
};
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
  const s = HEAD[size];
  const n = size === "TWO_SHOT" ? 2 : size === "THREE_SHOT" ? 3 : size === "GROUP" ? 4 : Math.max(1, Math.min(3, p.characters.length || 1));
  const people = ["CU", "ECU", "MCU", "OTS", "POV", "CUTAWAY"].includes(size) ? 1 : n;
  const angle = p.camera.angle;
  const horizon = ["high", "overhead", "birds_eye"].includes(angle) ? 0.35 : ["low", "worms_eye"].includes(angle) ? 0.8 : 0.62;
  const tilt = angle === "dutch" ? 12 : 0;
  const night = /night|dusk|evening/i.test(p.scene.time_of_day ?? "");
  const seed = req.seed ?? 0;
  const bg = night ? "#0d1220" : "#1d1c22";
  const figures: string[] = [];
  if (size === "INSERT") figures.push(`<rect x="${W * 0.3}" y="${H * 0.25}" width="${W * 0.4}" height="${H * 0.5}" rx="12" fill="#8a8a95"/>`);
  else if (s) {
    for (let i = 0; i < people; i++) {
      const cx = size === "OTS" ? W * 0.64 : W * ((i + 1) / (people + 1)) + ((seed * 37 + i * 11) % 21) - 10;
      const r = H * s.r, cy = H * s.y;
      figures.push(
        `<g fill="#9a9aa6"><circle cx="${cx}" cy="${cy}" r="${r}"/><path d="M ${cx - r * 2.2} ${cy + r * 5} Q ${cx - r * 2.1} ${cy + r * 1.3} ${cx} ${cy + r * 1.25} Q ${cx + r * 2.1} ${cy + r * 1.3} ${cx + r * 2.2} ${cy + r * 5} Z"/></g>`
      );
    }
    if (size === "OTS") figures.push(`<ellipse cx="${W * 0.12}" cy="${H * 0.75}" rx="${W * 0.2}" ry="${H * 0.45}" fill="#55555f"/>`);
  }
  const caption = wrap(p.performance.action || p.camera.size_label, Math.round(W / 16), 2);
  const who = p.characters.map((c) => c.name).join(", ");
  const meta = [p.camera.size_label, p.camera.lens_mm ? `${p.camera.lens_mm}mm` : null, `${p.camera.duration_seconds}s`].filter(Boolean).join(" · ");
  const fs = Math.round(H / 26);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<rect width="${W}" height="${H}" fill="${bg}"/>
<line x1="0" x2="${W}" y1="${H * horizon}" y2="${H * horizon}" stroke="#44444c" stroke-width="2"/>
<g transform="rotate(${tilt} ${W / 2} ${H / 2})">${figures.join("")}</g>
<rect x="0" y="${H - fs * 4.2}" width="${W}" height="${fs * 4.2}" fill="#000" opacity="0.72"/>
${caption.map((l, i) => `<text x="${fs}" y="${H - fs * (3 - i * 1.25)}" font-family="Helvetica,Arial,sans-serif" font-size="${fs}" fill="#f2f2f2">${esc(l)}</text>`).join("")}
<text x="${fs}" y="${fs * 1.6}" font-family="Helvetica,Arial,sans-serif" font-size="${Math.round(fs * 0.8)}" fill="#e8b84b">AURASTAGE SKETCH · Scene ${p.scene.number} · ${esc(meta)}</text>
${who ? `<text x="${W - fs}" y="${fs * 1.6}" text-anchor="end" font-family="Helvetica,Arial,sans-serif" font-size="${Math.round(fs * 0.8)}" fill="#bbbbc4">${esc(who)}</text>` : ""}
</svg>`;
}

/** A labelled reference figure: head and body drawn for the angle, framed for the shot size. Deterministic. */
export function renderCharacterSketch(req: StillRequest): string {
  const [W, H] = RATIO[req.aspect_ratio] ?? RATIO["1:1"];
  const k = req.sketch ?? { title: "Reference", subtitle: "", angle: "front", size: "MS", lines: [] };
  // How much of the body is in frame: head radius and head centre as fractions of the frame height.
  const frame = { CU: { r: 0.26, y: 0.5 }, MCU: { r: 0.15, y: 0.36 }, MS: { r: 0.1, y: 0.3 }, FULL: { r: 0.055, y: 0.16 } }[k.size];
  const cx = W / 2, r = H * frame.r, cy = H * frame.y;
  const skin = "#b9b3ad", cloth = "#7d7a88", fg: string[] = [];
  const bodyW = k.angle === "profile" ? r * 1.25 : k.angle === "three_quarter" ? r * 1.8 : r * 2.2;
  // Body: shoulders to hips, legs for full-length.
  fg.push(`<path d="M ${cx - bodyW} ${cy + r * 5.2} Q ${cx - bodyW} ${cy + r * 1.35} ${cx} ${cy + r * 1.25} Q ${cx + bodyW} ${cy + r * 1.35} ${cx + bodyW} ${cy + r * 5.2} Z" fill="${cloth}"/>`);
  if (k.size === "FULL") {
    fg.push(`<rect x="${cx - bodyW * 0.62}" y="${cy + r * 5.1}" width="${bodyW * 0.5}" height="${r * 6.2}" rx="${r * 0.2}" fill="#5f5c69"/>`);
    fg.push(`<rect x="${cx + bodyW * 0.12}" y="${cy + r * 5.1}" width="${bodyW * 0.5}" height="${r * 6.2}" rx="${r * 0.2}" fill="#5f5c69"/>`);
  }
  // Head, with the face turned by angle (the back view shows hair only).
  const hx = k.angle === "three_quarter" ? cx + r * 0.12 : cx;
  fg.push(`<ellipse cx="${hx}" cy="${cy}" rx="${k.angle === "profile" ? r * 0.85 : r * 0.92}" ry="${r}" fill="${k.angle === "back" ? "#3b3842" : skin}"/>`);
  if (k.angle !== "back") {
    fg.push(`<path d="M ${hx - r * 0.95} ${cy - r * 0.15} Q ${hx} ${cy - r * 1.45} ${hx + r * 0.95} ${cy - r * 0.15} Q ${hx} ${cy - r * 0.8} ${hx - r * 0.95} ${cy - r * 0.15} Z" fill="#3b3842"/>`);
    const eyes = k.angle === "front" ? [-0.33, 0.33] : k.angle === "three_quarter" ? [-0.05, 0.45] : [0.5];
    for (const e of eyes) fg.push(`<circle cx="${hx + r * e}" cy="${cy + r * 0.05}" r="${r * 0.07}" fill="#2a2830"/>`);
    if (k.angle === "profile") fg.push(`<path d="M ${hx + r * 0.8} ${cy} L ${hx + r * 1.05} ${cy + r * 0.3} L ${hx + r * 0.8} ${cy + r * 0.35} Z" fill="${skin}"/>`);
  }
  const fs = Math.round(Math.min(W, H) / 30);
  const lines = k.lines.flatMap((l) => wrap(l, Math.round(W / (fs * 0.55)), 2)).slice(0, 4);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<rect width="${W}" height="${H}" fill="#2b2a31"/>
<g>${fg.join("")}</g>
<rect x="0" y="${H - fs * (lines.length * 1.3 + 1.2)}" width="${W}" height="${fs * (lines.length * 1.3 + 1.2)}" fill="#000" opacity="0.7"/>
${lines.map((l, i) => `<text x="${fs}" y="${H - fs * ((lines.length - i) * 1.3 - 0.4)}" font-family="Helvetica,Arial,sans-serif" font-size="${fs}" fill="#eee">${esc(l)}</text>`).join("")}
<text x="${fs}" y="${fs * 1.7}" font-family="Helvetica,Arial,sans-serif" font-size="${Math.round(fs * 1.1)}" fill="#e8b84b">${esc(k.title)}</text>
<text x="${fs}" y="${fs * 3.1}" font-family="Helvetica,Arial,sans-serif" font-size="${Math.round(fs * 0.85)}" fill="#bbbbc4">${esc(k.subtitle)} · AURASTAGE SKETCH (not AI)</text>
</svg>`;
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
    return { bytes: new TextEncoder().encode(renderCharacterSketch(req)), media_type: "image/svg+xml", provider_request_id: null, cost_usd: 0 };
  },
};
