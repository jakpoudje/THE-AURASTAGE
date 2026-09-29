// engines/rendering/titleSequenceEngine — the film's opening title card and end-credits roll (owner, 2026-09-29: "what
// about … titles and credits"). Both are plain SVG the render worker rasterises: the card is held with a fade in and
// out; the roll is one tall image that scrolls up at a steady speed. Only credits that are actually set are shown —
// nothing is invented — and the tools that made sound or pictures are credited as they were.
import { TitleSequenceInputSchema, type TitleSequenceInput } from "./input.schema";
import { ENGINE_VERSION } from "./version";

export interface TitleCard { seconds: number; frames: number; svg: string }
export interface CreditRoll { seconds: number; frames: number; svg: string; image_height: number; lines: { kind: "heading" | "role" | "name" | "note"; text: string }[] }
export interface TitleSequenceOutput { opening: TitleCard | null; end_credits: CreditRoll | null; engine_version: string }

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const FONT = "DejaVu Sans, Noto Sans, Helvetica, Arial, sans-serif";
// Scroll speeds in screen heights per 10 seconds (medium ≈ a line every half second on a 1080p frame).
const SPEED = { slow: 0.9, medium: 1.3, fast: 1.8 } as const;

export function titleSequenceEngine(raw: TitleSequenceInput | unknown): TitleSequenceOutput {
  const i = TitleSequenceInputSchema.parse(raw);
  const W = i.width, H = i.height, u = H / 1080; // sizes are designed for 1080 lines and scale with the frame

  let opening: TitleCard | null = null;
  if (i.opening.enabled) {
    const frames = Math.round(i.opening.seconds * i.fps);
    const presents = i.credits.company ? `<text x="${W / 2}" y="${H * 0.36}" font-size="${28 * u}" fill="#bdbdbd" letter-spacing="${6 * u}" text-anchor="middle">${esc(i.credits.company.toUpperCase())} PRESENTS</text>` : "";
    const sub = i.opening.subtitle ? `<text x="${W / 2}" y="${H * 0.58}" font-size="${30 * u}" fill="#cfcfcf" font-style="italic" text-anchor="middle">${esc(i.opening.subtitle)}</text>` : "";
    const size = Math.min(110 * u, (W * 0.85) / Math.max(4, i.title.length * 0.6));
    opening = {
      seconds: frames / i.fps, frames,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}"><rect width="100%" height="100%" fill="#000"/>${presents}<text x="${W / 2}" y="${H * 0.5}" font-size="${size}" font-weight="bold" fill="#fff" letter-spacing="${4 * u}" text-anchor="middle">${esc(i.title.toUpperCase())}</text>${sub}</svg>`,
    };
  }

  let end_credits: CreditRoll | null = null;
  if (i.end_credits.enabled) {
    const lines: CreditRoll["lines"] = [];
    const role = (r: string, n: string | null | undefined) => { if (n) lines.push({ kind: "role", text: r }, { kind: "name", text: n }); };
    lines.push({ kind: "heading", text: i.title });
    role("Directed by", i.credits.director);
    role("Written by", i.credits.writer);
    role("Produced by", i.credits.producer);
    role("Music by", i.credits.composer);
    if (i.cast.length) {
      lines.push({ kind: "heading", text: "Cast" });
      for (const c of i.cast) lines.push({ kind: "name", text: c.performer ? `${c.character} — ${c.performer}` : c.character });
    }
    if (i.made_with.length) { lines.push({ kind: "heading", text: "Made with" }); for (const m of i.made_with) lines.push({ kind: "note", text: m }); }
    if (i.credits.thanks) { lines.push({ kind: "heading", text: "Thanks" }); for (const t of i.credits.thanks.split(/\n+/).map((s) => s.trim()).filter(Boolean).slice(0, 20)) lines.push({ kind: "note", text: t }); }
    const tail = [i.credits.company, i.credits.country, i.credits.year ? String(i.credits.year) : null].filter(Boolean).join(" · ");
    if (tail) lines.push({ kind: "heading", text: tail });
    if (i.credits.copyright) lines.push({ kind: "note", text: i.credits.copyright });

    // Layout: the roll starts below the frame and ends when the last line has left the top.
    const size = { heading: 44 * u, role: 26 * u, name: 38 * u, note: 28 * u };
    const gap = { heading: 90 * u, role: 46 * u, name: 58 * u, note: 44 * u };
    let y = H; // first line enters from the bottom
    const texts: string[] = [];
    for (const l of lines) {
      y += gap[l.kind];
      const fill = l.kind === "role" ? "#9a9a9a" : l.kind === "note" ? "#c8c8c8" : "#fff";
      const weight = l.kind === "heading" ? ` font-weight="bold" letter-spacing="${3 * u}"` : "";
      texts.push(`<text x="${W / 2}" y="${y.toFixed(1)}" font-size="${size[l.kind].toFixed(1)}" fill="${fill}"${weight} text-anchor="middle">${esc(l.kind === "heading" ? l.text.toUpperCase() : l.text)}</text>`);
    }
    const image_height = Math.ceil(y + H); // blank frame after the last line so the roll ends on black
    const travel = image_height - H;
    const seconds = Math.max(4, Math.round((travel / (H * SPEED[i.end_credits.speed] / 10)) * 10) / 10);
    const frames = Math.round(seconds * i.fps);
    end_credits = {
      seconds: frames / i.fps, frames, image_height, lines,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${image_height}" viewBox="0 0 ${W} ${image_height}" font-family="${FONT}"><rect width="100%" height="100%" fill="#000"/>${texts.join("")}</svg>`,
    };
  }
  return { opening, end_credits, engine_version: ENGINE_VERSION };
}
