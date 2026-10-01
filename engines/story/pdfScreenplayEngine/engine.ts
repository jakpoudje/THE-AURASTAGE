// engines/story/pdfScreenplayEngine
// PDF script import (BUILD_PLAN §8 item 13). A screenplay PDF has no structure, only text placed on the page — but the
// format is strict: scene headings and action sit at the left margin (1.5"), dialogue about 1" in, parentheticals about
// 1.6" in, character cues about 2.2" in, transitions at the right. This engine takes the text runs with their positions
// (read from the PDF by the API) and rebuilds Fountain: it finds the page's left margin, groups runs into lines,
// classifies each line by its indent and case, joins wrapped dialogue and action, and drops page furniture (page
// numbers, (MORE), repeated CONT'D cues, revision headers). Anything it can't place goes in as action, never lost.
import { z } from "zod";
import { ENGINE_VERSION } from "./version";

export const PdfScreenplayInputSchema = z.object({
  pages: z.array(z.object({
    width: z.number().positive().default(612), height: z.number().positive().default(792),
    items: z.array(z.object({ x: z.number(), y: z.number(), text: z.string().max(2000) })).max(20000),
  })).min(1).max(600),
});
export type PdfScreenplayInput = z.input<typeof PdfScreenplayInputSchema>;
export interface PdfScreenplayOutput { source_text: string; pages: number; lines: number; counts: Record<string, number>; warnings: string[]; engine_version: string }

type Kind = "heading" | "action" | "character" | "parenthetical" | "dialogue" | "transition" | "centered";
const HEADING = /^(INT|EXT|EST|INT\.?\/EXT|I\/E)[.\s]/i;
const TRANSITION = /^[A-Z0-9 .'’-]+TO:$|^(FADE (IN|OUT)|CUT TO BLACK|SMASH CUT|MATCH CUT|DISSOLVE TO)[.:]?$/;
const PAGE_NO = /^\d{1,3}\.?$/;
const CUE_EXT = /\s*\((CONT'?D|CONT’D|CONTINUED|MORE)\)\s*$/i;

export function pdfScreenplayEngine(raw: PdfScreenplayInput): PdfScreenplayOutput {
  const { pages } = PdfScreenplayInputSchema.parse(raw);
  const warnings: string[] = [];
  const counts: Record<string, number> = {};
  const out: { kind: Kind; text: string }[] = [];
  let lastCue = "";

  pages.forEach((pg, pi) => {
    // Lines: runs on the same baseline (within 2pt), left to right.
    const rows = new Map<number, { x: number; text: string }[]>();
    for (const it of pg.items) {
      if (!it.text.trim()) continue;
      const key = [...rows.keys()].find((y) => Math.abs(y - it.y) <= 2) ?? it.y;
      (rows.get(key) ?? rows.set(key, []).get(key)!).push({ x: it.x, text: it.text });
    }
    const lines = [...rows.entries()].sort((a, b) => b[0] - a[0]).map(([y, runs]) => {
      runs.sort((a, b) => a.x - b.x);
      return { y, x: runs[0].x, text: runs.map((r) => r.text).join(runs.length > 1 ? " " : "").replace(/\s+/g, " ").trim() };
    }).filter((l) => l.text);
    if (!lines.length) return;
    // The left margin: the most common indent among lines that start near the left of the page.
    const left = lines.map((l) => Math.round(l.x)).filter((x) => x < pg.width * 0.35);
    const freq = new Map<number, number>();
    for (const x of left) { const b = Math.round(x / 4) * 4; freq.set(b, (freq.get(b) ?? 0) + 1); }
    const margin = [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 108;
    const unit = pg.width / 8.5; // points per inch

    lines.forEach((l, li) => {
      const t = l.text;
      // Page furniture: a page number alone at the top or bottom, (MORE), revision headers.
      if ((li === 0 || li === lines.length - 1) && PAGE_NO.test(t)) return;
      if (/^\(MORE\)$/i.test(t) || /^(revised|revision|draft)\b.*\d/i.test(t) && li === 0) return;
      const off = (l.x - margin) / unit;
      const upper = t === t.toUpperCase() && /[A-Z]/.test(t);
      let kind: Kind;
      if (HEADING.test(t) && off < 0.5) kind = "heading";
      else if (upper && TRANSITION.test(t) && (off > 3 || /TO:$/.test(t))) kind = "transition";
      else if (upper && off >= 1.7 && off < 3.6 && t.length <= 50 && !/[.!?]$/.test(t.replace(CUE_EXT, ""))) kind = "character";
      else if (t.startsWith("(") && off >= 0.9 && off < 2.2) kind = "parenthetical";
      else if (off >= 0.7 && off < 1.7) kind = "dialogue";
      else if (off >= 1.7 && upper && t.length <= 60) kind = "centered";
      else kind = "action";
      // A cue repeated at the top of a page after (MORE) is the same speech carrying on.
      if (kind === "character") {
        const name = t.replace(CUE_EXT, "").trim();
        if (CUE_EXT.test(t) && name === lastCue && out[out.length - 1]?.kind !== "heading") { counts.continued = (counts.continued ?? 0) + 1; return; }
        lastCue = name;
      } else if (kind === "heading" || kind === "transition") lastCue = "";
      // Wrapped lines join their element: dialogue under dialogue, action under action (same paragraph, no gap).
      const prev = out[out.length - 1];
      const prevLine = lines[li - 1];
      const tight = prevLine && prevLine.y - l.y < 16;
      if (prev && tight && ((kind === "dialogue" && prev.kind === "dialogue") || (kind === "action" && prev.kind === "action"))) { prev.text += ` ${t}`; return; }
      out.push({ kind, text: t });
      counts[kind] = (counts[kind] ?? 0) + 1;
    });
    if (pi === 0 && !out.some((x) => x.kind === "heading")) warnings.push("No scene heading on the first page — a title page is fine; the script starts at the first INT./EXT.");
  });

  // Fountain: a blank line between elements, none inside a speech (cue → parenthetical → dialogue).
  const parts: string[] = [];
  out.forEach((e, i) => {
    const prev = out[i - 1];
    const inSpeech = prev && (e.kind === "dialogue" || e.kind === "parenthetical") && ["character", "parenthetical", "dialogue"].includes(prev.kind);
    const text = e.kind === "heading" ? e.text.toUpperCase() : e.kind === "transition" ? `> ${e.text}` : e.kind === "centered" ? `> ${e.text} <` : e.text;
    parts.push(inSpeech ? `\n${text}` : `${i ? "\n\n" : ""}${text}`);
  });
  if (!counts.heading) warnings.push("No scene headings were found — is this a screenplay PDF? Everything was kept as action so nothing is lost.");
  if (!counts.character) warnings.push("No character cues were found — dialogue may be indented differently in this PDF; check the speeches.");
  return { source_text: parts.join("").trim() + "\n", pages: pages.length, lines: out.length, counts, warnings, engine_version: ENGINE_VERSION };
}
