// engines/story/scriptCompareEngine
// Version compare (BUILD_PLAN §8 item 13): what changed between two saved versions of the script — scene by scene, then
// line by line inside each changed scene — so a writer (or a producer) sees exactly what a rewrite did. Scenes are matched
// by their heading in order; a scene whose heading changed but whose words mostly didn't is shown as changed, not as
// removed + added. Deterministic; reads only the two versions' text.
import { z } from "zod";
import { ENGINE_VERSION } from "./version";

export const ScriptCompareInputSchema = z.object({
  from: z.object({ version_number: z.number().int(), source_text: z.string().max(4_000_000) }),
  to: z.object({ version_number: z.number().int(), source_text: z.string().max(4_000_000) }),
});
export type ScriptCompareInput = z.input<typeof ScriptCompareInputSchema>;
export type DiffLine = { op: "same" | "added" | "removed"; text: string };
export interface SceneChange {
  status: "added" | "removed" | "changed" | "moved" | "unchanged";
  from_number: number | null; to_number: number | null; heading_from: string | null; heading_to: string | null;
  lines_added: number; lines_removed: number; diff: DiffLine[];
}
export interface ScriptCompareOutput {
  summary: { scenes_from: number; scenes_to: number; added: number; removed: number; changed: number; moved: number; unchanged: number; words_from: number; words_to: number };
  scenes: SceneChange[];
  engine_version: string;
}

const HEADING = /^(?:\.(?!\.)|(?:INT|EXT|EST|INT\.?\/EXT|I\/E)[.\s])/i;
const norm = (h: string) => h.replace(/^\./, "").replace(/\s+#\d+#?$/, "").replace(/\s+/g, " ").trim().toUpperCase();
const words = (t: string) => (t.match(/\S+/g) ?? []).length;

function scenesOf(text: string) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const out: { heading: string; key: string; body: string[] }[] = [];
  let cur: { heading: string; key: string; body: string[] } | null = null;
  for (const l of lines) {
    if (HEADING.test(l.trim()) && l.trim() === l.trim().toUpperCase() || /^\.[A-Z]/.test(l.trim())) { cur = { heading: l.trim().replace(/^\./, ""), key: norm(l.trim()), body: [] }; out.push(cur); continue; }
    if (cur && l.trim()) cur.body.push(l.trim());
  }
  return out;
}
/** Longest common subsequence diff of two line lists. */
function diff(a: string[], b: string[]): DiffLine[] {
  const n = a.length, m = b.length;
  if (n * m > 4_000_000) return [...a.map((t) => ({ op: "removed" as const, text: t })), ...b.map((t) => ({ op: "added" as const, text: t }))];
  const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ op: "same", text: a[i] }); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) out.push({ op: "removed", text: a[i++] });
    else out.push({ op: "added", text: b[j++] });
  }
  while (i < n) out.push({ op: "removed", text: a[i++] });
  while (j < m) out.push({ op: "added", text: b[j++] });
  return out;
}
const similar = (a: string[], b: string[]) => {
  const A = new Set(a.join(" ").toLowerCase().match(/\w+/g) ?? []), B = new Set(b.join(" ").toLowerCase().match(/\w+/g) ?? []);
  const inter = [...A].filter((w) => B.has(w)).length;
  return inter / Math.max(1, Math.max(A.size, B.size));
};
/** Changed lines with one line of context either side (long unchanged stretches are skipped). */
function trim(d: DiffLine[]): DiffLine[] {
  const keep = d.map((x, i) => x.op !== "same" || d[i - 1]?.op !== "same" && d[i - 1] !== undefined || (d[i + 1] && d[i + 1].op !== "same"));
  return d.filter((_, i) => keep[i]).slice(0, 400);
}

export function scriptCompareEngine(raw: ScriptCompareInput): ScriptCompareOutput {
  const { from, to } = ScriptCompareInputSchema.parse(raw);
  const A = scenesOf(from.source_text), B = scenesOf(to.source_text);
  // Match scenes by heading, in order (LCS on headings); then pair leftovers whose words mostly match.
  const pairs: [number | null, number | null][] = [];
  const hd = diff(A.map((s) => s.key), B.map((s) => s.key));
  let ia = 0, ib = 0;
  const loneA: number[] = [], loneB: number[] = [];
  for (const d of hd) {
    if (d.op === "same") pairs.push([ia++, ib++]);
    else if (d.op === "removed") { loneA.push(ia); pairs.push([ia++, null]); }
    else { loneB.push(ib); pairs.push([null, ib++]); }
  }
  // A heading that moved elsewhere, or was renamed: pair it with the most similar unmatched scene on the other side.
  for (const a of loneA) {
    let best = -1, score = 0;
    for (const b of loneB) { const s = A[a].key === B[b].key ? 1 : similar(A[a].body, B[b].body); if (s > score) { score = s; best = b; } }
    if (best >= 0 && score >= 0.6) {
      const pa = pairs.findIndex((p) => p[0] === a && p[1] === null), pb = pairs.findIndex((p) => p[0] === null && p[1] === best);
      pairs[pa] = [a, best]; pairs.splice(pb, 1); loneB.splice(loneB.indexOf(best), 1);
    }
  }
  const scenes: SceneChange[] = pairs.map(([a, b]) => {
    if (a !== null && b === null) return { status: "removed", from_number: a + 1, to_number: null, heading_from: A[a].heading, heading_to: null, lines_added: 0, lines_removed: A[a].body.length, diff: A[a].body.slice(0, 400).map((t) => ({ op: "removed", text: t })) };
    if (a === null && b !== null) return { status: "added", from_number: null, to_number: b + 1, heading_from: null, heading_to: B[b].heading, lines_added: B[b].body.length, lines_removed: 0, diff: B[b].body.slice(0, 400).map((t) => ({ op: "added", text: t })) };
    const d = diff(A[a!].body, B[b!].body);
    const added = d.filter((x) => x.op === "added").length, removed = d.filter((x) => x.op === "removed").length;
    const headingChanged = A[a!].key !== B[b!].key;
    const textChanged = added + removed > 0 || headingChanged;
    const moved = !textChanged && a !== b;
    return {
      status: textChanged ? "changed" : moved ? "moved" : "unchanged", from_number: a! + 1, to_number: b! + 1, heading_from: A[a!].heading, heading_to: B[b!].heading,
      lines_added: added, lines_removed: removed, diff: textChanged ? trim(headingChanged ? [{ op: "removed", text: A[a!].heading }, { op: "added", text: B[b!].heading }, ...d] : d) : [],
    };
  });
  const c = (s: SceneChange["status"]) => scenes.filter((x) => x.status === s).length;
  return {
    summary: { scenes_from: A.length, scenes_to: B.length, added: c("added"), removed: c("removed"), changed: c("changed"), moved: c("moved"), unchanged: c("unchanged"), words_from: words(from.source_text), words_to: words(to.source_text) },
    scenes, engine_version: ENGINE_VERSION,
  };
}
