// apps/api/src/providers/reasoning/index.ts — reasoning side of the Provider Gateway (CLAUDE.md rule 7).
import { anthropicReasoningAdapter } from "./anthropic/anthropicReasoningAdapter";
import { geminiReasoningAdapter } from "./gemini/geminiReasoningAdapter";
import { openaiReasoningAdapter } from "./openai/openaiReasoningAdapter";
import { isAccountProblem } from "./structured";
import { testReasoningAdapter } from "./test/testReasoningAdapter";
import type { ReasoningAdapter, ReasoningRequest } from "./types";

export * from "./types";
export { isAccountProblem };
const ADAPTERS: ReasoningAdapter[] = [anthropicReasoningAdapter, openaiReasoningAdapter, geminiReasoningAdapter, testReasoningAdapter];

/** Connected writers in preference order: AURA_REASONING_PROVIDER first when set, then Claude, OpenAI, Gemini. */
export function connectedWriters(env: Record<string, string | undefined>): ReasoningAdapter[] {
  const real = ADAPTERS.filter((a) => a.execution !== "test" && a.isConfigured(env));
  const pref = env.AURA_REASONING_PROVIDER;
  return pref ? [...real.filter((a) => a.id === pref), ...real.filter((a) => a.id !== pref)] : real;
}

/**
 * Several connected writers act as one: when the first has an account problem (out of credit, key refused) the next
 * one answers, and the result says which one did. Any other failure (a bad answer, a busy backend) is reported as is.
 */
export function writerChain(writers: ReasoningAdapter[]): ReasoningAdapter {
  if (writers.length === 1) return writers[0];
  const [first] = writers;
  return {
    id: first.id,
    name: writers.map((w) => w.name).join(" → "),
    execution: "external",
    note: `Tries ${writers.map((w) => w.name).join(", then ")} — the next takes over when one account is out of credit.`,
    isConfigured: (env) => writers.some((w) => w.isConfigured(env)),
    async complete<T>(req: ReasoningRequest<T>, env: Record<string, string | undefined>) {
      const problems: string[] = [];
      for (const w of writers) {
        try {
          const r = await w.complete(req, env);
          if (problems.length) console.info(JSON.stringify({ event: "reasoning.fallback", used: w.id, skipped: problems.length }));
          return { ...r, provider: r.provider ?? w.id };
        } catch (e) {
          if (!isAccountProblem(e)) throw e;
          problems.push((e as Error).message);
        }
      }
      throw Object.assign(new Error(problems.join(" ")), { retryable: false });
    },
  };
}

/**
 * The reasoning backend for a task: the connected model(s) when a key is on the server, otherwise the labelled test
 * planner (only when the caller allows test output). Never a backend that isn't configured.
 */
export function reasoningProvider(env: Record<string, string | undefined>, opts: { allowTest?: boolean } = {}): ReasoningAdapter | null {
  const real = connectedWriters(env);
  if (real.length) return writerChain(real);
  return opts.allowTest ? testReasoningAdapter : null;
}
/** The model a reasoning backend will use (for cost estimates): the adapter default unless the env chooses another. */
export function reasoningModel(id: string, env: Record<string, string | undefined>): string | null {
  if (id === "anthropic") return CLAUDE_MODEL;
  if (id === "openai") return env.OPENAI_REASONING_MODEL || OPENAI_REASONING_MODEL;
  if (id === "gemini") return env.GEMINI_MODEL || GEMINI_MODEL;
  return null;
}
export function reasoningStatuses(env: Record<string, string | undefined>) {
  return ADAPTERS.map((a) => ({ id: a.id, name: a.name, execution: a.execution, state: a.isConfigured(env) ? "configured" : "not_configured", note: a.note }));
}
import { CLAUDE_MODEL } from "./anthropic/anthropicReasoningAdapter";
import { OPENAI_REASONING_MODEL } from "./openai/openaiReasoningAdapter";
import { GEMINI_MODEL } from "./gemini/geminiReasoningAdapter";
export { anthropicReasoningAdapter, geminiReasoningAdapter, openaiReasoningAdapter, testReasoningAdapter };
