// engines/world/propContinuityEngine
// Set dressing and prop continuity (BUILD_PLAN §8 item 12). Reads where each prop appears in the approved script (Locations
// & Props' appearances, each with its script line) and works out, scene by scene:
//   • its STATE from the words on its lines ("smashes the laptop" → broken). Lasting states (broken, bloodied, burnt,
//     torn, missing) carry into later scenes until the script restores them ("a new laptop", "repaired", "finds");
//   • a WARNING where a later scene shows it without saying so ("broken in scene 3 — keep it broken in scene 5");
//   • the SET DRESSING of every scene: which props are there and in what state (what the prompts and the art department use).
// Deterministic and free; every state cites the line it came from.
import { z } from "zod";
import { ENGINE_VERSION } from "./version";

export const PropContinuityInputSchema = z.object({
  props: z.array(z.object({
    id: z.string(), name: z.string().max(160),
    appearances: z.array(z.object({ scene_number: z.number().int().min(0), evidence: z.string().max(4000).default("") })).max(2000),
  })).max(2000),
});
export type PropContinuityInput = z.input<typeof PropContinuityInputSchema>;
export interface PropState { scene_number: number; state: string | null; changed_here: boolean; evidence: string }
export interface PropContinuityOutput {
  props: { id: string; name: string; states: PropState[] }[];
  warnings: { prop_id: string; scene_number: number; message: string }[];
  set_dressing: { scene_number: number; items: { prop_id: string; name: string; state: string | null }[] }[];
  engine_version: string;
}

/** Words on a prop's line → the state they put it in. `lasting` states carry forward. */
const STATES: { state: string; re: RegExp; lasting: boolean }[] = [
  { state: "missing", re: /\b(los(?:e|es|t)|missing|stolen|steals?|vanish(?:es|ed)?|gone|disappear(?:s|ed)?)\b/i, lasting: true },
  { state: "broken", re: /\b(smash(?:es|ed)?|shatter(?:s|ed)?|break(?:s)?|broke|broken|crack(?:s|ed)?|snap(?:s|ped)?|dent(?:s|ed)?|crush(?:es|ed)?)\b/i, lasting: true },
  { state: "bloodied", re: /\b(blood(?:y|ied|stained)?)\b/i, lasting: true },
  { state: "burnt", re: /\b(burn(?:s|ed|t|ing)?|ablaze|charred|scorched|on fire)\b/i, lasting: true },
  { state: "torn", re: /\b(tear(?:s)?|tore|torn|rip(?:s|ped)?|shred(?:s|ded)?)\b/i, lasting: true },
  { state: "wet", re: /\b(soak(?:s|ed)?|drench(?:es|ed)?|wet|dripping)\b/i, lasting: false },
  { state: "open", re: /\b(open(?:s|ed)?|unlock(?:s|ed)?)\b/i, lasting: false },
];
const RESTORE = /\b(new|repair(?:s|ed)?|fix(?:es|ed)?|mend(?:s|ed)?|replac(?:e|es|ed)|clean(?:s|ed)?|finds?|found|recover(?:s|ed)?|returns?|returned|spare)\b/i;
/** The words around the prop on its line (a state word elsewhere on the line belongs to something else). */
function near(line: string, name: string): string {
  const words = name.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const lower = line.toLowerCase();
  const at = words.map((w) => lower.indexOf(w)).filter((x) => x >= 0).sort((a, b) => a - b)[0];
  if (at === undefined) return line;
  const end = at + (words.find((w) => lower.indexOf(w) === at)?.length ?? 0);
  return line.slice(Math.max(0, at - 40), end + 40);
}
const short = (s: string) => (s.length > 120 ? `${s.slice(0, 117)}…` : s);

export function propContinuityEngine(raw: PropContinuityInput): PropContinuityOutput {
  const i = PropContinuityInputSchema.parse(raw);
  const warnings: PropContinuityOutput["warnings"] = [];
  const dressing = new Map<number, { prop_id: string; name: string; state: string | null }[]>();
  const props = i.props.map((p) => {
    const apps = [...p.appearances].sort((a, b) => a.scene_number - b.scene_number);
    // One entry per scene (all its lines read together).
    const scenes = new Map<number, string[]>();
    for (const a of apps) (scenes.get(a.scene_number) ?? scenes.set(a.scene_number, []).get(a.scene_number)!).push(a.evidence);
    let carried: { state: string; since: number } | null = null;
    const states: PropState[] = [];
    for (const [n, lines] of scenes) {
      const text = lines.map((l) => near(l, p.name)).join(" ");
      const hit = STATES.find((s) => s.re.test(text));
      const restored = RESTORE.test(text);
      let state: string | null = null, changed = false;
      const remind = (c: { state: string; since: number }) => warnings.push({
        prop_id: p.id, scene_number: n,
        message: c.state === "missing"
          ? `${p.name} went missing in scene ${c.since} but is in scene ${n} — show it found, or check the scene.`
          : `${p.name} was ${c.state} in scene ${c.since} — keep it ${c.state} in scene ${n}, or show it ${c.state === "bloodied" ? "cleaned" : "repaired or replaced"}.`,
      });
      if (hit && !hit.lasting && carried && !restored) {
        // A passing state (wet, open) on top of a lasting one: both show, and the lasting one still needs keeping.
        state = `${carried.state}, ${hit.state}`; changed = true;
        remind(carried);
      } else if (hit && !(restored && hit.state === "missing")) {
        state = hit.state; changed = carried?.state !== hit.state;
        carried = hit.lasting ? { state: hit.state, since: n } : restored ? null : carried;
      } else if (restored && carried) {
        state = null; changed = true; carried = null;
      } else if (carried) {
        state = carried.state;
        remind(carried);
      }
      states.push({ scene_number: n, state, changed_here: changed, evidence: short(lines[0] ?? "") });
      (dressing.get(n) ?? dressing.set(n, []).get(n)!).push({ prop_id: p.id, name: p.name, state });
    }
    return { id: p.id, name: p.name, states };
  });
  const set_dressing = [...dressing.entries()].sort((a, b) => a[0] - b[0]).map(([scene_number, items]) => ({ scene_number, items }));
  return { props, warnings, set_dressing, engine_version: ENGINE_VERSION };
}
