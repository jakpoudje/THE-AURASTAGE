import { GUIDES, TROUBLESHOOTING } from "../knowledge";
import { KnowledgeQuerySchema, type KnowledgeQuery } from "./input.schema";
import type { KnowledgeResult } from "./output.schema";
import { ENGINE_VERSION } from "./version";

const STOP = new Set(["the", "a", "an", "to", "i", "my", "how", "do", "can", "is", "it", "of", "in", "on", "and", "or", "what", "why", "for", "me", "with", "this", "that", "does", "you"]);
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));

export function knowledgeRetrievalEngine(input: KnowledgeQuery): KnowledgeResult {
  const q = KnowledgeQuerySchema.parse(input);
  const text = q.query.toLowerCase();
  const terms = words(q.query);
  const codes = [...text.matchAll(/aura-[a-z]+-\d{3}/g)].map((m) => m[0].toUpperCase());
  const scored = GUIDES.map((g) => {
    let score = 0;
    for (const k of g.keywords) if (text.includes(k)) score += k.includes(" ") ? 4 : 3;
    const hay = words(`${g.title} ${g.summary} ${g.steps.join(" ")}`);
    for (const t of terms) if (hay.includes(t)) score += 1;
    if (score > 0 && q.module && g.module === q.module) score += 2;
    return { ...g, score };
  });
  let guides = scored.filter((g) => g.score > 0).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  // Nothing matched: offer the guide for the workspace they're in, then getting started.
  if (!guides.length) guides = scored.filter((g) => g.module === q.module || g.id === "getting-started").sort((a, b) => (a.module === q.module ? -1 : 1) - (b.module === q.module ? -1 : 1));
  const troubles = TROUBLESHOOTING.filter((t) => codes.includes(t.code) || (!codes.length && terms.some((w) => t.title.toLowerCase().includes(w) && w.length > 3)));
  return { guides: guides.slice(0, q.limit), troubles, engine_version: ENGINE_VERSION };
}
