// Context budget (directive §18): only the objects relevant to the request, each with its canonical id and version.
import type { ContextBundle, ContextItem } from "../contracts";

export const CONTEXT_LIMITS = { items: 40, charsPerItem: 4000 } as const;

/** Keeps the focus object and the items that match the request's mentions first, then trims to budget. */
export function trimContext(bundle: ContextBundle, mentions: string[]): ContextBundle {
  const m = mentions.map((x) => x.toLowerCase());
  const score = (it: ContextItem) =>
    (bundle.focus && it.ref.id === bundle.focus.id ? 100 : 0) + (m.some((x) => it.ref.label.toLowerCase().includes(x)) ? 10 : 0);
  const items = [...bundle.items]
    .sort((a, b) => score(b) - score(a))
    .slice(0, CONTEXT_LIMITS.items)
    .map((it) => {
      const s = JSON.stringify(it.data);
      return s.length <= CONTEXT_LIMITS.charsPerItem ? it : { ...it, data: { truncated: true, excerpt: s.slice(0, CONTEXT_LIMITS.charsPerItem) } };
    });
  return { ...bundle, items };
}
