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
  /** Where each scene happens (any id or name for the place). An everyday prop's lasting state only carries within one place. */
  scene_locations: z.array(z.object({ scene_number: z.number().int().min(0), location: z.string().max(400) })).max(5000).default([]),
});
export type PropContinuityInput = z.input<typeof PropContinuityInputSchema>;
export interface PropState { scene_number: number; state: string | null; changed_here: boolean; evidence: string }
export interface PropContinuityOutput {
  props: { id: string; name: string; states: PropState[] }[];
  /** One per state that a later scene may forget: the first such scene, and every one of them in `scenes`. */
  warnings: { prop_id: string; scene_number: number; scenes: number[]; message: string }[];
  set_dressing: { scene_number: number; items: { prop_id: string; name: string; state: string | null }[] }[];
  engine_version: string;
}

/** Words on a prop's line → the state they put it in. `lasting` states carry forward. */
const STATES: { state: string; re: RegExp; lasting: boolean }[] = [
  { state: "missing", re: /\b(los(?:e|es|t)|missing|stolen|steals?|vanish(?:es|ed)?|gone|disappear(?:s|ed)?)\b/i, lasting: true },
  { state: "broken", re: /\b(smash(?:es|ed)?|crash(?:es|ed)?|wreck(?:s|ed)?|shatter(?:s|ed)?|break(?:s)?|broke|broken|crack(?:s|ed)?|snap(?:s|ped)?|dent(?:s|ed)?|crush(?:es|ed)?)\b/i, lasting: true },
  { state: "bloodied", re: /\b(blood(?:y|ied|stained)?)\b/i, lasting: true },
  { state: "burnt", re: /\b(burn(?:s|ed|t|ing)?|ablaze|charred|scorched|on fire)\b/i, lasting: true },
  { state: "torn", re: /\b(tear(?:s)?|tore|torn|rip(?:s|ped)?|shred(?:s|ded)?)\b/i, lasting: true },
  { state: "wet", re: /\b(soak(?:s|ed)?|drench(?:es|ed)?|wet|dripping)\b/i, lasting: false },
  { state: "open", re: /\b(open(?:s|ed)?|unlock(?:s|ed)?)\b/i, lasting: false },
];
const RESTORE = /\b(new|repair(?:s|ed)?|fix(?:es|ed)?|mend(?:s|ed)?|replac(?:e|es|ed)|clean(?:s|ed)?|finds?|found|recover(?:s|ed)?|returns?|returned|spare)\b/i;
/**
 * The words that describe the prop on its line (1.1.0, owner report 2026-10-03): up to six words before it and three
 * after it, in the same clause, stopping at a preposition after it — "smashes the laptop", "the laptop shatters", but not
 * "a phone in a cracked case" (the case is cracked) or "a cup of tea gone cold". A line that doesn't name it says nothing.
 */
const STOP_AFTER = new Set("in on with of beside and but under inside near at by from into onto for to behind over next".split(" "));
function near(line: string, name: string): string {
  const head = name.toLowerCase().split(/\s+/).filter(Boolean).at(-1) ?? "";
  if (!head) return "";
  const raw = line.split(/\s+/).filter(Boolean);
  const bare = raw.map((w) => w.toLowerCase().replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, "").replace(/'s$/, ""));
  const out: string[] = [];
  bare.forEach((w, k) => {
    if (!(w === head || w === `${head}s` || w === `${head}es` || (head.endsWith("y") && w === `${head.slice(0, -1)}ies`))) return;
    for (let b = k - 1; b >= Math.max(0, k - 6); b--) { if (/[.,;:!?)]$/.test(raw[b])) break; out.push(bare[b]); }
    // "A coffee cup, soaked in rain": what follows straight after the prop (even after a comma) describes it.
    if (!/[.;:!?]$/.test(raw[k])) for (let a = k + 1; a <= Math.min(raw.length - 1, k + 3); a++) {
      if (STOP_AFTER.has(bare[a])) break;
      out.push(bare[a]);
      if (/[.,;:!?]$/.test(raw[a])) break;
    }
  });
  return out.join(" ");
}
/** An item seen in this many scenes is an everyday thing many people have (a phone, a cup): its state stays in one place. */
const EVERYDAY_SCENES = 4;
const short = (s: string) => (s.length > 120 ? `${s.slice(0, 117)}…` : s);

export function propContinuityEngine(raw: PropContinuityInput): PropContinuityOutput {
  const i = PropContinuityInputSchema.parse(raw);
  const warnings: PropContinuityOutput["warnings"] = [];
  const placeOf = new Map(i.scene_locations.map((x) => [x.scene_number, x.location]));
  const dressing = new Map<number, { prop_id: string; name: string; state: string | null }[]>();
  const props = i.props.map((p) => {
    const apps = [...p.appearances].sort((a, b) => a.scene_number - b.scene_number);
    // One entry per scene (all its lines read together).
    const scenes = new Map<number, string[]>();
    for (const a of apps) (scenes.get(a.scene_number) ?? scenes.set(a.scene_number, []).get(a.scene_number)!).push(a.evidence);
    let carried: { state: string; since: number; place: string | null } | null = null;
    const states: PropState[] = [];
    // An everyday item (in many scenes) is many people's: a phone broken at the rally isn't every phone in the film.
    const everyday = scenes.size >= EVERYDAY_SCENES;
    const reminders = new Map<string, { since: number; state: string; scenes: number[] }>();
    for (const [n, lines] of scenes) {
      const place = placeOf.get(n) ?? null;
      // An everyday item's lasting state only carries while the story stays in the same place.
      const applies = (c: { place: string | null } | null) => !!c && (!everyday || !c.place || c.place === place);
      const text = lines.map((l) => near(l, p.name)).join(" ");
      const hit = STATES.find((s) => s.re.test(text));
      const restored = RESTORE.test(text);
      let state: string | null = null, changed = false;
      const remind = (c: { state: string; since: number }) => {
        const k = `${c.state}:${c.since}`;
        (reminders.get(k) ?? reminders.set(k, { since: c.since, state: c.state, scenes: [] }).get(k)!).scenes.push(n);
      };
      const live = applies(carried) ? carried : null;
      if (hit && !hit.lasting && live && !restored) {
        // A passing state (wet, open) on top of a lasting one: both show, and the lasting one still needs keeping.
        state = `${live.state}, ${hit.state}`; changed = true;
        remind(live);
      } else if (hit && !(restored && hit.state === "missing")) {
        state = hit.state; changed = live?.state !== hit.state;
        carried = hit.lasting ? { state: hit.state, since: n, place } : restored ? null : carried;
      } else if (restored && live) {
        state = null; changed = true; carried = null;
      } else if (live) {
        state = live.state;
        remind(live);
      }
      states.push({ scene_number: n, state, changed_here: changed, evidence: short(lines[0] ?? "") });
      (dressing.get(n) ?? dressing.set(n, []).get(n)!).push({ prop_id: p.id, name: p.name, state });
    }
    for (const r of reminders.values()) {
      const list = r.scenes.length === 1 ? `scene ${r.scenes[0]}` : `scenes ${r.scenes.slice(0, 6).join(", ")}${r.scenes.length > 6 ? ` and ${r.scenes.length - 6} more` : ""}`;
      warnings.push({
        prop_id: p.id, scene_number: r.scenes[0], scenes: r.scenes,
        message: r.state === "missing"
          ? `${p.name} went missing in scene ${r.since} but is in ${list} — show it found, or check the scene${r.scenes.length === 1 ? "" : "s"}.`
          : `${p.name} was ${r.state} in scene ${r.since} — keep it ${r.state} in ${list}, or show it ${r.state === "bloodied" ? "cleaned" : "repaired or replaced"}.`,
      });
    }
    return { id: p.id, name: p.name, states };
  });
  const set_dressing = [...dressing.entries()].sort((a, b) => a[0] - b[0]).map(([scene_number, items]) => ({ scene_number, items }));
  return { props, warnings, set_dressing, engine_version: ENGINE_VERSION };
}
