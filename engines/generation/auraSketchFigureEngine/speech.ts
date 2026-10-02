// AuraSketch 3 — speech (owner, 2026-10-02: "including the ability to animate their speech"). A line of dialogue becomes
// timed mouth shapes (visemes) fitted to how long the line lasts — the real voice clip's length when there is one,
// otherwise an estimate from the words and the character's pace. Rule-based from the spelling (not AI, not
// phoneme-perfect); pauses at commas and full stops close the mouth.

export type Viseme = "rest" | "a" | "e" | "o" | "closed" | "fv" | "l";
export interface VisemeKey { t: number; shape: Viseme }

const VOWEL_A = /[aiä]/i, VOWEL_E = /[eyé]/i, VOWEL_O = /[ouwq]/i;
function shapeOf(ch: string, next: string): Viseme | null {
  const c = ch.toLowerCase();
  if ("mbp".includes(c)) return "closed";
  if ("fv".includes(c)) return "fv";
  if (c === "t" && next.toLowerCase() === "h") return "l";
  if ("ltdnr".includes(c)) return "l";
  if (VOWEL_O.test(c)) return "o";
  if (VOWEL_A.test(c)) return "a";
  if (VOWEL_E.test(c)) return "e";
  if (/[a-z]/i.test(c)) return "e"; // other consonants: lips slightly apart
  return null;
}

/** Seconds a line takes when no voice exists yet: ~2.6 words a second at medium pace, plus pauses at punctuation. */
export function estimateLineSeconds(text: string, pace: "slow" | "medium" | "fast" | string = "medium") {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const wps = pace === "slow" ? 2.1 : pace === "fast" ? 3.2 : 2.6;
  const pauses = (text.match(/[,;:]/g)?.length ?? 0) * 0.25 + (text.match(/[.!?…]/g)?.length ?? 0) * 0.4;
  return Math.max(0.8, Math.round((words / wps + pauses) * 100) / 100);
}

/** Timed mouth shapes for a line, spread over `seconds`. Repeated shapes merge; it always starts and ends at rest. */
export function visemesFor(text: string, seconds: number): VisemeKey[] {
  const units: { shape: Viseme; w: number }[] = [];
  const s = text.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (/[,;:]/.test(ch)) { units.push({ shape: "rest", w: 2.2 }); continue; }
    if (/[.!?…]/.test(ch)) { units.push({ shape: "rest", w: 3.5 }); continue; }
    if (/\s/.test(ch)) { units.push({ shape: "rest", w: 0.35 }); continue; }
    const sh = shapeOf(ch, s[i + 1] ?? "");
    if (!sh) continue;
    if (sh === "l" && ch.toLowerCase() === "t" && (s[i + 1] ?? "").toLowerCase() === "h") i++;
    units.push({ shape: sh, w: sh === "a" || sh === "o" ? 1.3 : sh === "e" ? 1 : 0.8 });
  }
  const total = units.reduce((n, u) => n + u.w, 0) || 1;
  const out: VisemeKey[] = [{ t: 0, shape: "rest" }];
  let at = 0.06; // a breath before the first sound
  const span = Math.max(0.2, seconds - 0.12);
  for (const u of units) {
    if (out[out.length - 1].shape !== u.shape) out.push({ t: Math.round(at * 1000) / 1000, shape: u.shape });
    at += (u.w / total) * span;
  }
  if (out[out.length - 1].shape !== "rest") out.push({ t: Math.round(Math.min(seconds, at) * 1000) / 1000, shape: "rest" });
  return out;
}

/** Natural blinks over a loop: one every ~3–5 s, each ~0.12 s, at fixed times so a sketch always blinks the same way. */
export function blinksFor(seconds: number): number[] {
  const out: number[] = [];
  for (let t = 1.6; t < seconds - 0.2; t += 3.4 + (out.length % 2) * 1.1) out.push(Math.round(t * 100) / 100);
  return out.length ? out : [Math.max(0.4, seconds * 0.6)];
}
