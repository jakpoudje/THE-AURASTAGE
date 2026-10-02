// engines/generation/promptCompilerEngine/compose.ts
// Ranked prompt blocks (2.0.0, realism R1). Providers accept different prompt lengths (Runway ~1,000 characters,
// MiniMax 2,000, Kling 2,500 … OpenAI 32,000). Cutting a long prompt at the end silently loses whatever came last
// (style, look, composition). Instead the compiler emits ranked blocks and each provider asks for a prompt that fits
// its limit: the lowest-ranked blocks are shortened at a sentence boundary first, then dropped; rank 1 (camera,
// action, identity, dialogue) is only shortened as a last resort. The result says exactly what was kept.

export type PromptMode = "image" | "video";
export interface PromptBlock {
  id: string;
  /** 1 = never dropped … 5 = first to go. */
  rank: 1 | 2 | 3 | 4 | 5;
  image: string;
  video: string;
}
export interface ComposedPrompt { text: string; kept: string[]; shortened: string[]; dropped: string[]; chars: number }

/** First sentence(s) of `t` within `max` characters, never cutting a word; "…" when shortened mid-sentence. */
export function shorten(t: string, max: number): string {
  const s = t.trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, Math.max(0, max - 1));
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (end > max * 0.4) return cut.slice(0, end + 1).replace(/;$/, ".");
  const word = cut.lastIndexOf(" ");
  return `${cut.slice(0, word > max * 0.4 ? word : cut.length).replace(/[\s,;:—-]+$/, "")}…`;
}

/** The prompt for one mode inside `max` characters (Infinity = everything). */
export function composePrompt(blocks: PromptBlock[], mode: PromptMode, max = Infinity): ComposedPrompt {
  const parts = blocks.map((b) => ({ id: b.id, rank: b.rank, text: (mode === "video" ? b.video : b.image).trim(), state: "kept" as "kept" | "shortened" | "dropped" }))
    .filter((p) => p.text);
  const len = () => parts.filter((p) => p.state !== "dropped").reduce((n, p, i, a) => n + p.text.length + (i < a.length - 1 ? 1 : 0), 0);
  // Lowest rank first, and within a rank the later block first (earlier blocks carry the essentials).
  const order = [...parts].sort((a, b) => b.rank - a.rank || parts.indexOf(b) - parts.indexOf(a));
  for (const p of order) {
    if (len() <= max) break;
    if (p.rank === 1) continue;
    const over = len() - max;
    const target = Math.max(40, p.text.length - over);
    if (target < p.text.length && target >= 40) { p.text = shorten(p.text, target); p.state = "shortened"; }
    if (len() > max) p.state = "dropped";
  }
  // Rank 1 last: shorten the longest essentials, never the camera header.
  for (const p of [...parts].filter((x) => x.rank === 1 && x.id !== "header").sort((a, b) => b.text.length - a.text.length)) {
    if (len() <= max) break;
    const target = Math.max(60, p.text.length - (len() - max));
    p.text = shorten(p.text, target);
    p.state = "shortened";
  }
  let text = parts.filter((p) => p.state !== "dropped").map((p) => p.text).join(" ");
  if (text.length > max) text = shorten(text, max);
  return {
    text, chars: text.length,
    kept: parts.filter((p) => p.state === "kept").map((p) => p.id),
    shortened: parts.filter((p) => p.state === "shortened").map((p) => p.id),
    dropped: parts.filter((p) => p.state === "dropped").map((p) => p.id),
  };
}
