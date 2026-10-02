// engines/generation/promptCompilerEngine/shotContext.ts
// What the script says around one shot, and where each character stands on screen (2.0.0, realism R1). Pure helpers
// the API feeds into promptCompilerEngine; unit-tested.

export interface ScriptElement { index: number; type: string; text: string }
export interface PlanShot { id: string; ordinal: number; purpose?: string | null; size?: string | null; description?: string | null; character_ids: string[]; dialogue_line_ids: string[] }

const MAX = 600;
const trimTo = (parts: string[]) => {
  const out: string[] = [];
  let n = 0;
  for (const p of parts) { if (n + p.length > MAX) break; out.push(p); n += p.length + 1; }
  return out;
};

/**
 * The script's action lines that belong to a shot: for a shot with dialogue, the action written just before its first
 * line and just after its last (up to the next speaker); for an establishing shot or the master, the scene's opening
 * action; for an action shot, the action after the scene's last line. At most ~600 characters, in script order.
 */
export function scriptActionForShot(a: { elements: ScriptElement[]; scene: { start: number; end: number }; lineElementIndexes: number[]; purpose: string | null }): string[] {
  const inScene = a.elements.filter((e) => e.index > a.scene.start && e.index <= a.scene.end).sort((x, y) => x.index - y.index);
  const action = (e: ScriptElement) => e.type === "action" && e.text.trim().length > 0;
  const speech = (e: ScriptElement) => e.type === "character" || e.type === "dialogue";
  if (a.lineElementIndexes.length) {
    const first = Math.min(...a.lineElementIndexes), last = Math.max(...a.lineElementIndexes);
    const before: string[] = [];
    for (let i = inScene.findIndex((e) => e.index >= first) - 1; i >= 0; i--) {
      const e = inScene[i];
      if (e.type === "character") continue; // the cue for this line
      if (!action(e)) break;
      before.unshift(e.text.trim());
    }
    // `last` is the cue of the last line: skip that line's own words, then take the action up to the next speaker.
    const after: string[] = [];
    let ownSpeech = true;
    for (const e of inScene.filter((x) => x.index > last)) {
      if (ownSpeech && (e.type === "dialogue" || e.type === "parenthetical")) continue;
      ownSpeech = false;
      if (speech(e) || e.type === "parenthetical") break;
      if (action(e)) after.push(e.text.trim());
    }
    return trimTo([...before, ...after]);
  }
  if (a.purpose === "action") {
    const lastSpeech = Math.max(-1, ...inScene.filter(speech).map((e) => e.index));
    return trimTo(inScene.filter((e) => e.index > lastSpeech && action(e)).map((e) => e.text.trim()));
  }
  if (a.purpose === "establishing" || a.purpose === "master") {
    const opening: string[] = [];
    for (const e of inScene) { if (speech(e)) break; if (action(e)) opening.push(e.text.trim()); }
    return trimTo(opening);
  }
  return [];
}

/**
 * Screen direction for the scene (the 180° rule): the first shot that holds two or more people — normally the master —
 * sets who is frame-left and frame-right, in the order they are listed; anyone appearing later fills the next side.
 * Every shot of the scene then keeps those sides, so eyelines match across cuts.
 */
export function screenDirection(shots: PlanShot[]): Record<string, "left" | "right" | "center"> {
  const ordered = [...shots].sort((a, b) => a.ordinal - b.ordinal);
  const anchor = ordered.find((s) => s.character_ids.length >= 2);
  const out: Record<string, "left" | "right" | "center"> = {};
  const sides: ("left" | "right" | "center")[] = ["left", "right", "center"];
  let k = 0;
  for (const id of [...(anchor?.character_ids ?? []), ...ordered.flatMap((s) => s.character_ids)]) {
    if (out[id]) continue;
    out[id] = sides[Math.min(k, 2)];
    k++;
  }
  return out;
}

/** One-line summaries of the shots before and after this one, for continuity in the video prompt. */
export function neighbours(shots: PlanShot[], shotId: string, sizeWords: Record<string, string>): { previous: string | null; next: string | null } {
  const ordered = [...shots].sort((a, b) => a.ordinal - b.ordinal);
  const i = ordered.findIndex((s) => s.id === shotId);
  const say = (s: PlanShot | undefined) => (s ? `${sizeWords[s.size ?? ""] ?? s.size ?? "shot"} — ${(s.description ?? "").trim()}`.slice(0, 200) : null);
  return { previous: i > 0 ? say(ordered[i - 1]) : null, next: i >= 0 && i < ordered.length - 1 ? say(ordered[i + 1]) : null };
}
