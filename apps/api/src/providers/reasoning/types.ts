// apps/api/src/providers/reasoning/types.ts
// The provider-neutral contract for text reasoning (story understanding, drafting, field suggestions).
// Domain services and workers depend on THIS interface, never on a vendor SDK (CLAUDE.md rule 7).
import type { z } from "zod";

export type ReasoningEffort = "low" | "medium" | "high" | "xhigh" | "max";

export interface ReasoningRequest<T> {
  /** Stable instructions for the task (cache-friendly: no timestamps or ids in here). */
  system: string;
  /** The task input: project facts, the approved script excerpt, the user's request. */
  prompt: string;
  /** The exact shape the answer must have; the answer is validated against it before anyone sees it. */
  schema: z.ZodType<T>;
  effort?: ReasoningEffort;
  max_tokens?: number;
  /**
   * The structured task behind the prompt. Real models read the prompt; the labelled TestProvider reads this instead
   * (it can't understand language), so the whole flow can be exercised without a paid API.
   */
  task?: { kind: "plan"; snapshot: unknown };
}

export interface ReasoningResult<T> {
  data: T;
  /** True when a development/test backend produced this; the UI labels it DEVELOPMENT / TEST OUTPUT (rule 12). */
  test_output: boolean;
  /** The model that actually answered (a server-side fallback can differ from the one requested). */
  model: string;
  provider_request_id: string | null;
  usage: { input_tokens: number; output_tokens: number };
}

export interface ReasoningAdapter {
  id: string;
  name: string;
  execution: "native" | "local" | "external" | "test";
  /** Credentials present on this server (never calls out, never guesses health). */
  isConfigured(env: Record<string, string | undefined>): boolean;
  note: string;
  complete<T>(req: ReasoningRequest<T>, env: Record<string, string | undefined>): Promise<ReasoningResult<T>>;
}
