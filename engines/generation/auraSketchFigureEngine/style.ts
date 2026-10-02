// AuraSketch 3 — the look of a sketch follows the film's genre (owner, 2026-10-02: "do not forget that the platform has
// different types of movie genres"). Each style sets the ink, line weight, colour (saturation and warmth), how deep the
// shadows are, a rim light and the paper. Read from the project's genre (and tone) words; unknown genres draw naturally.

export interface SketchStyle {
  id: string;
  label: string;
  /** Ink colour for outlines. */
  ink: string;
  /** Line-weight multiplier. */
  line: number;
  /** Saturation (1 = as described). */
  sat: number;
  /** −1 cool … +1 warm. */
  warmth: number;
  /** Shadow strength multiplier on the face and clothes. */
  shadow: number;
  /** Cheek warmth (0 none … 1). */
  blush: number;
  /** Rim light colour on the lit edge, or none. */
  rim: string | null;
  /** Character-sheet paper colour. */
  paper: string;
  /** Storyboard frame background. */
  frame: string;
  /** Slight stylisation of the eyes (comedy and family films draw them a touch larger). */
  eyeScale: number;
  /** Colour of the key light on skin and cloth (mixed into highlights). */
  key: string;
  /** Colour the shadows lean towards (cool for thrillers, green for horror, warm for romance…). */
  shade: string;
  /** How strongly key and shade colour the picture (0 … 1). */
  grade: number;
}

const S = (s: SketchStyle) => s;
export const SKETCH_STYLES: Record<string, SketchStyle> = {
  drama: S({ id: "drama", label: "Drama — natural light, true colour", ink: "#2b2622", line: 1, sat: 1, warmth: 0.05, shadow: 1, blush: 0.25, rim: null, paper: "#f3efe6", frame: "#1d1c22", eyeScale: 1, key: "#fff3e0", shade: "#3a2a30", grade: 0.15 }),
  thriller: S({ id: "thriller", label: "Thriller — hard shadows, cool and muted", ink: "#1c1d22", line: 1.2, sat: 0.6, warmth: -0.35, shadow: 1.45, blush: 0.05, rim: "#9fb6d6", paper: "#e9eaec", frame: "#11131a", eyeScale: 1, key: "#d8e6ff", shade: "#0d1b33", grade: 0.55 }),
  noir: S({ id: "noir", label: "Noir — black-and-white, deep contrast", ink: "#0e0e10", line: 1.3, sat: 0.08, warmth: 0, shadow: 1.7, blush: 0, rim: "#f2f2f2", paper: "#e6e4df", frame: "#0b0b0d", eyeScale: 1, key: "#ffffff", shade: "#000000", grade: 0.6 }),
  horror: S({ id: "horror", label: "Horror — drained colour, heavy shadow", ink: "#141612", line: 1.3, sat: 0.32, warmth: -0.2, shadow: 1.8, blush: 0, rim: "#a8b89a", paper: "#dcdbd2", frame: "#0a0c0a", eyeScale: 1, key: "#d9f0c8", shade: "#0c1a10", grade: 0.6 }),
  romance: S({ id: "romance", label: "Romance — warm, soft light", ink: "#4a3530", line: 0.8, sat: 1.08, warmth: 0.45, shadow: 0.75, blush: 0.7, rim: "#ffd9b8", paper: "#f8eee6", frame: "#2a1d22", eyeScale: 1.02, key: "#ffd2b8", shade: "#5a2338", grade: 0.5 }),
  comedy: S({ id: "comedy", label: "Comedy — bright, clean lines", ink: "#2b2622", line: 1.1, sat: 1.25, warmth: 0.2, shadow: 0.7, blush: 0.5, rim: null, paper: "#fbf6ea", frame: "#25222c", eyeScale: 1.1, key: "#fff6d8", shade: "#4a3a5a", grade: 0.3 }),
  family: S({ id: "family", label: "Family / animation — bright and friendly", ink: "#33302b", line: 1.15, sat: 1.3, warmth: 0.25, shadow: 0.6, blush: 0.6, rim: null, paper: "#fdf8ec", frame: "#262433", eyeScale: 1.14, key: "#fff2c8", shade: "#3a4a7a", grade: 0.3 }),
  action: S({ id: "action", label: "Action — bold ink, punchy contrast", ink: "#151515", line: 1.35, sat: 1.05, warmth: 0.25, shadow: 1.35, blush: 0.1, rim: "#ffb36b", paper: "#efebe2", frame: "#16141a", eyeScale: 1, key: "#ffc184", shade: "#1f2a3a", grade: 0.55 }),
  war: S({ id: "war", label: "War — desaturated, gritty", ink: "#1d1c18", line: 1.3, sat: 0.5, warmth: 0.05, shadow: 1.5, blush: 0, rim: "#d9c9a3", paper: "#e3dfd2", frame: "#141410", eyeScale: 1, key: "#e8dcc0", shade: "#2a2a1c", grade: 0.5 }),
  epic: S({ id: "epic", label: "Epic / historical — golden, painterly", ink: "#3a2a1c", line: 1.05, sat: 0.85, warmth: 0.6, shadow: 1.15, blush: 0.2, rim: "#f0c674", paper: "#f2e6cf", frame: "#1f1912", eyeScale: 1, key: "#ffd98a", shade: "#3a2210", grade: 0.55 }),
  fantasy: S({ id: "fantasy", label: "Fantasy — rich colour, magical rim light", ink: "#2c2238", line: 1, sat: 1.2, warmth: 0.1, shadow: 1.1, blush: 0.35, rim: "#c6a8ff", paper: "#f1ecf6", frame: "#1b1626", eyeScale: 1.04, key: "#f0d8ff", shade: "#21153d", grade: 0.5 }),
  scifi: S({ id: "scifi", label: "Sci-fi — cool, clean, neon rim", ink: "#18202a", line: 1.05, sat: 0.9, warmth: -0.55, shadow: 1.2, blush: 0.05, rim: "#5fe0e6", paper: "#e8eef2", frame: "#0c131c", eyeScale: 1, key: "#b8fbff", shade: "#061c2e", grade: 0.6 }),
  documentary: S({ id: "documentary", label: "Documentary / realist — plain, true colour", ink: "#2b2622", line: 0.9, sat: 0.95, warmth: 0, shadow: 0.95, blush: 0.15, rim: null, paper: "#f1efea", frame: "#1d1c22", eyeScale: 1, key: "#ffffff", shade: "#2a2a2a", grade: 0.1 }),
};

const WORDS: [RegExp, string][] = [
  [/\bnoir\b/i, "noir"], [/\b(horror|slasher|supernatural|ghost)\b/i, "horror"], [/\b(sci[- ]?fi|science fiction|cyberpunk|space)\b/i, "scifi"],
  [/\b(fantasy|myth|magic)\b/i, "fantasy"], [/\b(war|military)\b/i, "war"], [/\b(epic|historical|period|biopic|western)\b/i, "epic"],
  [/\b(action|adventure|heist|martial)\b/i, "action"], [/\b(thriller|crime|mystery|suspense|detective|political)\b/i, "thriller"],
  [/\b(romance|romantic|love story|rom[- ]?com)\b/i, "romance"], [/\b(family|animation|animated|children|kids)\b/i, "family"],
  [/\b(comedy|comic|satire|parody|sitcom)\b/i, "comedy"], [/\b(documentary|realist|realism|docudrama)\b/i, "documentary"], [/\b(drama|melodrama)\b/i, "drama"],
];

/** The sketch style for a project's genre (first matching word; "romantic comedy" is romance). Unknown → drama. */
export function sketchStyleFor(genre: string | null | undefined, tone?: string | null): SketchStyle {
  const text = `${genre ?? ""}`;
  for (const [re, id] of WORDS) if (re.test(text)) return SKETCH_STYLES[id];
  if (tone) for (const [re, id] of WORDS) if (re.test(tone)) return SKETCH_STYLES[id];
  return SKETCH_STYLES.drama;
}

/** An SVG filter that applies the style's colour (saturation and warmth) to everything inside it. */
export function styleFilter(st: SketchStyle, id: string, region: { x: number; y: number; width: number; height: number } = { x: -6, y: -3, width: 12, height: 14 }) {
  const w = st.warmth * 0.08;
  // Saturation, then a gentle warm/cool shift of red and blue. A fixed region in user space: the render worker's
  // rasteriser (resvg) panics computing a region from very large drawings.
  return `<filter id="${id}" color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse" x="${region.x}" y="${region.y}" width="${region.width}" height="${region.height}"><feColorMatrix type="saturate" values="${Math.max(0, Math.min(2, st.sat))}"/>` +
    `<feColorMatrix type="matrix" values="${1 + w} 0 0 0 0  0 1 0 0 0  0 0 ${1 - w} 0 0  0 0 0 1 0"/></filter>`;
}

/**
 * The style's colour grade applied to one colour (saturation, then warm/cool) — used on the finished drawing instead of an
 * SVG filter, so it looks the same in the browser and in the render worker (resvg panics on some filtered drawings).
 */
export function gradeHex(hex: string, st: { sat: number; warmth: number }): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const L = 0.299 * r + 0.587 * g + 0.114 * b, s = Math.max(0, Math.min(2, st.sat)), w = st.warmth * 0.08;
  r = (L + (r - L) * s) * (1 + w); g = L + (g - L) * s; b = (L + (b - L) * s) * (1 - w);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}
/** Grades every #rrggbb colour in an SVG string. */
export const gradeSvg = (svg: string, st: { sat: number; warmth: number }) => (st.sat === 1 && st.warmth === 0 ? svg : svg.replace(/#[0-9a-fA-F]{6}\b/g, (h) => gradeHex(h, st)));
