// Page and timing heuristics. SRS §5.1: page count is an approximate
// heuristic only, never a hard rule. Industry convention: one formatted
// page (~55 lines) runs about one minute of screen time.

export const LINES_PER_PAGE = 55;
export const SECONDS_PER_PAGE = 60;
/** Approximate characters per line for each element type in standard screenplay layout. */
export const WRAP_WIDTH: Record<string, number> = {
  action: 60,
  dialogue: 35,
  parenthetical: 25,
  character: 40,
  scene_heading: 60,
  transition: 60,
  centered: 60,
  section: 60,
  note: 0,
};
/** Blank lines that follow each element type in standard layout. */
export const TRAILING_BLANK: Record<string, number> = {
  action: 1,
  dialogue: 1,
  parenthetical: 0,
  character: 0,
  scene_heading: 1,
  transition: 1,
  centered: 1,
  section: 0,
  note: 0,
};

export function estimateLines(type: string, text: string): number {
  const width = WRAP_WIDTH[type] ?? 60;
  if (width === 0) return 0;
  const wrapped = text
    .split("\n")
    .reduce((sum, l) => sum + Math.max(1, Math.ceil(l.length / width)), 0);
  return wrapped + (TRAILING_BLANK[type] ?? 0);
}

export function parseHeading(heading: string): { int_ext: "INT" | "EXT" | "INT/EXT" | "UNKNOWN"; location: string; time_of_day: string | null } {
  const h = heading.trim().toUpperCase();
  let int_ext: "INT" | "EXT" | "INT/EXT" | "UNKNOWN" = "UNKNOWN";
  let rest = h;
  const m = h.match(/^(INT\.?\/EXT\.?|INT\/EXT|I\/E|INT\.?|EXT\.?|EST\.?)\s*/);
  if (m) {
    const p = m[1].replace(/\./g, "");
    int_ext = p === "INT" ? "INT" : p === "EXT" || p === "EST" ? "EXT" : "INT/EXT";
    rest = h.slice(m[0].length);
  }
  const parts = rest.split(/\s+[-–—]\s+/);
  if (parts.length > 1) {
    const time = parts.pop()!.trim();
    return { int_ext, location: parts.join(" - ").trim(), time_of_day: time || null };
  }
  return { int_ext, location: rest.trim(), time_of_day: null };
}
