// apps/api/src/providers/reasoning/index.ts — reasoning side of the Provider Gateway (CLAUDE.md rule 7).
import { anthropicReasoningAdapter } from "./anthropic/anthropicReasoningAdapter";
import { testReasoningAdapter } from "./test/testReasoningAdapter";
import type { ReasoningAdapter } from "./types";

export * from "./types";
const ADAPTERS: ReasoningAdapter[] = [anthropicReasoningAdapter, testReasoningAdapter];

/**
 * The reasoning backend for a task: the real model when its key is on the server, otherwise the labelled test planner
 * (only when the caller allows test output). Never a backend that isn't configured.
 */
export function reasoningProvider(env: Record<string, string | undefined>, opts: { allowTest?: boolean } = {}): ReasoningAdapter | null {
  const real = ADAPTERS.find((a) => a.execution !== "test" && a.isConfigured(env));
  if (real) return real;
  return opts.allowTest ? testReasoningAdapter : null;
}
export function reasoningStatuses(env: Record<string, string | undefined>) {
  return ADAPTERS.map((a) => ({ id: a.id, name: a.name, execution: a.execution, state: a.isConfigured(env) ? "configured" : "not_configured", note: a.note }));
}
export { anthropicReasoningAdapter, testReasoningAdapter };
