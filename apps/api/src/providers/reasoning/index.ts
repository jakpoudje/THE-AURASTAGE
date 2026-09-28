// apps/api/src/providers/reasoning/index.ts — reasoning side of the Provider Gateway (CLAUDE.md rule 7).
import { anthropicReasoningAdapter } from "./anthropic/anthropicReasoningAdapter";
import type { ReasoningAdapter } from "./types";

export * from "./types";
const ADAPTERS: ReasoningAdapter[] = [anthropicReasoningAdapter];

/** The first configured reasoning provider, or null (callers say plainly that no AI is connected). */
export function reasoningProvider(env: Record<string, string | undefined>): ReasoningAdapter | null {
  return ADAPTERS.find((a) => a.isConfigured(env)) ?? null;
}
export function reasoningStatuses(env: Record<string, string | undefined>) {
  return ADAPTERS.map((a) => ({ id: a.id, name: a.name, state: a.isConfigured(env) ? "configured" : "not_configured", note: a.note }));
}
