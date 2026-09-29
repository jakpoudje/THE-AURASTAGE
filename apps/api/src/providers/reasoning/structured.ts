// apps/api/src/providers/reasoning/structured.ts — what every model-backed reasoning adapter does with an answer:
// parse the JSON, fit it to limits structured outputs can't enforce, and validate it against the engine's own schema
// before anyone sees it. Logged by path only (never the content).
import type { z } from "zod";
import { ProviderError } from "../types";
import { describeIssues, fitToSchema } from "./fitToSchema";

export function finishStructured<T>(vendor: string, text: string, schema: z.ZodType<T>, requestId: string | null): T {
  let json: unknown;
  try {
    json = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, ""));
  } catch {
    throw new ProviderError(`${vendor}'s answer wasn't valid JSON.`, requestId, true);
  }
  const adjusted: string[] = [];
  const parsed = schema.safeParse(fitToSchema(schema as never, json, "", adjusted));
  if (adjusted.length) console.info(JSON.stringify({ event: "reasoning.fitted", vendor, request_id: requestId, adjusted: adjusted.slice(0, 20) }));
  if (!parsed.success) {
    const why = describeIssues(parsed.error.issues as never);
    console.warn(JSON.stringify({ event: "reasoning.shape_mismatch", vendor, request_id: requestId, issues: why }));
    throw new ProviderError(`${vendor}'s answer didn't match the expected shape (${why}).`, requestId, true);
  }
  return parsed.data;
}

/** Account problems (no credit, key refused) — the next connected writer should take over. */
export const isAccountProblem = (e: unknown) =>
  e instanceof ProviderError && !e.retryable && /credit|billing|quota|api key|rejected the api key|not connected|insufficient/i.test(e.message);
