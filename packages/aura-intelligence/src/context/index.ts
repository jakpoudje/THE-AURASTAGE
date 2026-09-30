// Context budget (directive §18): only the objects relevant to the request, each with its canonical id and version.
import type { ContextBundle, ContextItem } from "../contracts";

/** Types sent only in the budget's spare room unless the request is about them. */
const OPTIONAL_TYPES: ContextItem["ref"]["type"][] = ["location", "prop", "settings"];

export const CONTEXT_LIMITS = { items: 60, charsPerItem: 4000 } as const;

/**
 * Keeps the focus object first; with a focus scene, its spoken lines and shots next (so a whole scene can be worked on in
 * one pass), then the characters who speak in it and the items the request mentions; then trims to budget.
 */
/** `relevant`: object types the request is about (e.g. places and props, project settings); other such types rank low. */
export function trimContext(bundle: ContextBundle, mentions: string[], relevant: ContextItem["ref"]["type"][] = []): ContextBundle {
  const m = mentions.map((x) => x.toLowerCase());
  const sceneFocus = bundle.focus?.type === "scene";
  const speakers = new Set(bundle.items.filter((it) => it.ref.type === "dialogue_line").map((it) => (it.data as { character_id?: string }).character_id).filter(Boolean));
  const score = (it: ContextItem) =>
    (bundle.focus && it.ref.id === bundle.focus.id ? 100 : 0) +
    (it.ref.type === "project" ? 90 : 0) +
    (sceneFocus && (it.ref.type === "dialogue_line" || it.ref.type === "shot") ? 50 : 0) +
    (it.ref.type === "character" && speakers.has(it.ref.id) ? 30 : 0) +
    // Places and props only when the request is about them (they would otherwise crowd out the cast).
    (OPTIONAL_TYPES.includes(it.ref.type) ? (relevant.includes(it.ref.type) ? 40 : -20) : 0) +
    (m.some((x) => it.ref.label.toLowerCase().includes(x)) ? 10 : 0);
  const items = [...bundle.items]
    .sort((a, b) => score(b) - score(a))
    .slice(0, CONTEXT_LIMITS.items)
    .map((it) => {
      const s = JSON.stringify(it.data);
      return s.length <= CONTEXT_LIMITS.charsPerItem ? it : { ...it, data: { truncated: true, excerpt: s.slice(0, CONTEXT_LIMITS.charsPerItem) } };
    });
  return { ...bundle, items };
}
