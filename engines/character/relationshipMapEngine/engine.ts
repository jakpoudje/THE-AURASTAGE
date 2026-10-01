// engines/character/relationshipMapEngine
// Built-in story intelligence for Casting's relationship map (BUILD_PLAN §8 item 12). Reads the approved script's
// appearances (who is in which scene) and its dialogue, and returns:
//   • every pair of characters who share scenes, with how many (the map's lines);
//   • the relationship a person saved for the pair, if any;
//   • otherwise a SUGGESTED relationship only when the dialogue states it ("Mama", "my brother", "Sir"…), with the line
//     as evidence. Sharing scenes alone never invents a label. Free, deterministic; a person adds a suggestion in one click.
import { z } from "zod";
import { ENGINE_VERSION } from "./version";

export const RelationshipMapInputSchema = z.object({
  characters: z.array(z.object({ id: z.string(), name: z.string().max(200) })).max(500),
  appearances: z.array(z.object({ character_id: z.string(), scene_id: z.string() })).max(50000),
  /** Spoken lines in script order, with the scene they are in and the speaking character (null when unresolved). */
  lines: z.array(z.object({ scene_id: z.string(), scene_number: z.number().int().min(0), speaker_id: z.string().nullable(), text: z.string().max(4000) })).max(50000).default([]),
  relationships: z.array(z.object({ character_a: z.string(), character_b: z.string(), relationship: z.string() })).max(5000).default([]),
});
export type RelationshipMapInput = z.input<typeof RelationshipMapInputSchema>;
export interface RelationshipEdge {
  a: string; b: string; shared_scenes: number;
  relationship: string | null;
  suggestion: { relationship: string; evidence: string } | null;
}
export interface RelationshipMapOutput {
  nodes: { id: string; name: string; scenes: number }[];
  edges: RelationshipEdge[];
  engine_version: string;
}

/** What a speaker calls the person they talk to → the relationship it states. Order matters (first match wins). */
const CUES: [RegExp, string][] = [
  [/\b(mama|mummy|mum|mom|mother|papa|daddy|dad|father)\b/i, "Parent and child"],
  [/\b(my (?:son|daughter|child|boy|girl))\b/i, "Parent and child"],
  [/\b(my (?:brother|sister)|big (?:brother|sister)|little (?:brother|sister)|sis|bro)\b/i, "Siblings"],
  [/\b(my (?:wife|husband|love|darling)|darling|sweetheart|honey|my baby)\b/i, "Partners"],
  [/\b(grandma|grandpa|grandmother|grandfather|granny|nana)\b/i, "Grandparent and grandchild"],
  [/\b(uncle|auntie|aunty|aunt)\b/i, "Uncle/aunt and niece/nephew"],
  [/\b(my (?:friend|guy)|old friend|best friend)\b/i, "Friends"],
  [/\b(sir|madam|ma'am|boss|oga|chief)\b/i, "Works for"],
  [/\b(my (?:enemy|rival))\b/i, "Rivals"],
];
const first = (name: string) => name.trim().split(/\s+/)[0].toLowerCase();

export function relationshipMapEngine(raw: RelationshipMapInput): RelationshipMapOutput {
  const i = RelationshipMapInputSchema.parse(raw);
  const ids = new Set(i.characters.map((c) => c.id));
  const scenesOf = new Map<string, Set<string>>();
  for (const a of i.appearances) if (ids.has(a.character_id)) (scenesOf.get(a.character_id) ?? scenesOf.set(a.character_id, new Set()).get(a.character_id)!).add(a.scene_id);
  const nodes = i.characters.map((c) => ({ id: c.id, name: c.name, scenes: scenesOf.get(c.id)?.size ?? 0 }));
  const name = new Map(i.characters.map((c) => [c.id, c.name]));
  const key = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);
  const saved = new Map(i.relationships.map((r) => [key(r.character_a, r.character_b), r.relationship]));

  // Who is in each scene (speaking or not), to tell who a line is said to.
  const present = new Map<string, Set<string>>();
  for (const a of i.appearances) if (ids.has(a.character_id)) (present.get(a.scene_id) ?? present.set(a.scene_id, new Set()).get(a.scene_id)!).add(a.character_id);

  // Suggestions from the dialogue: a cue said to someone — the only other character in the scene, or named in the line.
  const suggested = new Map<string, { relationship: string; evidence: string }>();
  for (const l of i.lines) {
    if (!l.speaker_id || !ids.has(l.speaker_id)) continue;
    const cue = CUES.find(([re]) => re.test(l.text));
    if (!cue) continue;
    const others = [...(present.get(l.scene_id) ?? [])].filter((x) => x !== l.speaker_id);
    const named = others.filter((o) => new RegExp(`\\b${first(name.get(o)!).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(l.text));
    const to = named.length === 1 ? named[0] : others.length === 1 ? others[0] : null;
    if (!to) continue;
    const k = key(l.speaker_id, to);
    if (suggested.has(k)) continue;
    const said = l.text.length > 120 ? `${l.text.slice(0, 117)}…` : l.text;
    suggested.set(k, { relationship: cue[1], evidence: `Scene ${l.scene_number}: ${name.get(l.speaker_id)} to ${name.get(to)} — “${said}”` });
  }

  const edges: RelationshipEdge[] = [];
  const list = i.characters.map((c) => c.id);
  for (let x = 0; x < list.length; x++) for (let y = x + 1; y < list.length; y++) {
    const a = list[x], b = list[y], k = key(a, b);
    const sa = scenesOf.get(a), sb = scenesOf.get(b);
    const shared = sa && sb ? [...sa].filter((s) => sb.has(s)).length : 0;
    const rel = saved.get(k) ?? null;
    if (!shared && !rel) continue;
    edges.push({ a, b, shared_scenes: shared, relationship: rel, suggestion: rel ? null : suggested.get(k) ?? null });
  }
  edges.sort((p, q) => q.shared_scenes - p.shared_scenes);
  return { nodes, edges, engine_version: ENGINE_VERSION };
}
