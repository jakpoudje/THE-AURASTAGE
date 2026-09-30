// What the built-in story intelligence reads (read-only, with the user's own access — RLS): the approved script's
// action lines, every scene, every spoken line with its performance, and Casting's evidence about each character.
// Nothing here writes (rule 4); the plan it feeds is applied through each domain's own service.
import type { SupabaseClient } from "@supabase/supabase-js";
import { profileEvidence } from "../../characters/characters.service";

type Row = Record<string, any>;
const PAGE = 1000;

/** Every row of a query, page by page (PostgREST returns at most 1000 at a time). */
async function all(make: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; from < 20000; from += PAGE) {
    const { data, error } = await make(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...((data ?? []) as Row[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export interface Evidence {
  project: Row;
  scenes: Row[];
  lines: Row[];
  elements: { index: number; type: string; text: string; speaker?: string }[];
  appearances: Row[];
  relationships: Row[];
  looks: Row[];
  characters: Awaited<ReturnType<typeof profileEvidence>>["characters"];
  /** Action sentences in story order, each with its scene number. */
  action: { scene: number; text: string }[];
  actionOf(sceneId: string): string[];
}

const sentences = (t: string) => t.replace(/\s+/g, " ").split(/(?<=[.!?])\s+(?=[A-Z"“(])/).map((x) => x.trim()).filter(Boolean);

export async function loadEvidence(db: SupabaseClient, projectId: string): Promise<Evidence> {
  const [projectRows, scenes, lines, prof] = await Promise.all([
    all((a, b) => db.from("projects").select("id, title, genre, tone, setting, time_period, logline").eq("id", projectId).range(a, b)),
    all((a, b) => db.from("scenes").select("id, number, heading, int_ext, location, time_of_day, estimated_seconds, element_start, element_end").eq("project_id", projectId).eq("status", "active").order("number", { ascending: true }).range(a, b)),
    all((a, b) => db.from("dialogue_lines").select("id, scene_id, ordinal, speaker_name, character_id, text, parenthetical, intention, subtext, emotion, intensity, notes, updated_at").eq("project_id", projectId).eq("status", "active").order("ordinal", { ascending: true }).range(a, b)),
    profileEvidence(db, projectId),
  ]);
  return buildEvidence({ project: projectRows[0] ?? {}, scenes, lines, elements: prof.elements, appearances: prof.appearances, relationships: prof.relationships, looks: prof.looks, characters: prof.characters });
}

/** Evidence from records already read (the offline mock builds it from its own data the same way). */
export function buildEvidence(parts: Omit<Evidence, "action" | "actionOf">): Evidence {
  const { scenes } = parts;
  const elements = [...parts.elements].sort((a, b) => a.index - b.index);
  const byIndex = (i: number) => scenes.find((s) => i >= s.element_start && i <= s.element_end);
  const action: { scene: number; text: string }[] = [];
  for (const e of elements) {
    if (e.type !== "action") continue;
    const s = byIndex(e.index);
    if (s) for (const t of sentences(String(e.text))) action.push({ scene: s.number, text: t });
  }
  return {
    ...parts, elements, action,
    actionOf: (sceneId) => {
      const s = scenes.find((x) => x.id === sceneId);
      return s ? elements.filter((e) => e.type === "action" && e.index >= s.element_start && e.index <= s.element_end).map((e) => String(e.text)) : [];
    },
  };
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Action sentences that name someone or something: the full name, or a distinctive part of it (3+ letters). */
export function mentionsOf(ev: Evidence, name: string, limit = 60): { scene: number; text: string }[] {
  const words = name.split(/\s+/).filter((w) => w.length >= 3 && !/^(the|and|mr|mrs|ms|dr|old|young|man|woman|boy|girl)$/i.test(w));
  // Parts of a name only count written as a name ("Tomiwa", "TOMIWA"), so "Market Woman" doesn't match every market.
  const part = (w: string) => new RegExp(`\\b(?:${esc(w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())}|${esc(w.toUpperCase())})\\b`);
  const res = [new RegExp(`\\b${esc(name)}\\b`, "i"), ...(words.length > 1 || words[0]?.toLowerCase() !== name.toLowerCase() ? words.map(part) : [])];
  return ev.action.filter((a) => res.some((re) => re.test(a.text))).slice(0, limit);
}
