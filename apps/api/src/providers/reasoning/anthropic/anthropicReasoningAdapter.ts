// apps/api/src/providers/reasoning/anthropic/anthropicReasoningAdapter.ts
// Anthropic Claude adapter. Only this file imports the Anthropic SDK (CLAUDE.md rule 7).
// Configured by ANTHROPIC_API_KEY on the server; never called from the browser.
import Anthropic from "@anthropic-ai/sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ProviderError } from "../../types";
import { describeIssues, fitToSchema } from "../fitToSchema";
import type { ReasoningAdapter, ReasoningRequest, ReasoningResult } from "../types";

export const CLAUDE_MODEL = "claude-opus-5-5";

let cached: { key: string; client: Anthropic } | null = null;
function client(key: string) {
  if (cached?.key !== key) cached = { key, client: new Anthropic({ apiKey: key, maxRetries: 2, timeout: 10 * 60 * 1000 }) };
  return cached.client;
}

// Structured outputs accept a subset of JSON Schema: length, count and range limits are refused (400, seen live
// 2026-09-28: "For 'array' type, property 'maxItems' is not supported"). They are moved into the description so the
// model still knows them, and the answer is validated against the full zod schema afterwards, so nothing is lost.
const UNSUPPORTED = ["maxItems", "minLength", "maxLength", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "pattern", "format"] as const;
const WORDS: Record<string, string> = { maxItems: "at most {} items", minItems: "at least {} items", minLength: "at least {} characters", maxLength: "at most {} characters",
  minimum: "minimum {}", maximum: "maximum {}", exclusiveMinimum: "above {}", exclusiveMaximum: "below {}", multipleOf: "a multiple of {}", pattern: "matching {}", format: "format {}" };
export function toStructuredOutputSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toStructuredOutputSchema);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  const notes: string[] = [];
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    const dropMinItems = k === "minItems" && typeof v === "number" && v > 1;
    if ((UNSUPPORTED as readonly string[]).includes(k) || dropMinItems) notes.push(WORDS[k].replace("{}", String(v)));
    else out[k] = toStructuredOutputSchema(v);
  }
  if (notes.length) out.description = [out.description, `(${notes.join(", ")})`].filter(Boolean).join(" ");
  return out;
}

/** JSON Schema for structured outputs, from the engine's zod schema (inlined, no $schema/$ref, supported keywords only). */
export function jsonSchemaOf(schema: unknown): Record<string, unknown> {
  const { $schema: _drop, ...rest } = zodToJsonSchema(schema as never, { $refStrategy: "none", target: "jsonSchema7" }) as Record<string, unknown>;
  return toStructuredOutputSchema(rest) as Record<string, unknown>;
}

export const anthropicReasoningAdapter: ReasoningAdapter = {
  id: "anthropic",
  name: "Anthropic Claude",
  execution: "external",
  note: "Story understanding, drafting and field suggestions. Needs ANTHROPIC_API_KEY on the server.",
  isConfigured: (env) => !!env.ANTHROPIC_API_KEY,
  async complete<T>(req: ReasoningRequest<T>, env: Record<string, string | undefined>): Promise<ReasoningResult<T>> {
    const key = env.ANTHROPIC_API_KEY;
    if (!key) throw new ProviderError("Claude is not connected (no API key on the server).");
    try {
      const res = await client(key).beta.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: req.max_tokens ?? 16000,
        thinking: { type: "adaptive" },
        output_config: { effort: req.effort ?? "high", format: { type: "json_schema", schema: jsonSchemaOf(req.schema) } },
        // Policy declines are re-run server-side on a fallback model instead of failing the task.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: req.prompt }],
      });
      if (res.stop_reason === "refusal") throw new ProviderError("Claude declined this request.", res.id);
      if (res.stop_reason === "max_tokens") throw new ProviderError("Claude's answer was cut off — try a smaller request.", res.id, true);
      const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new ProviderError("Claude's answer wasn't valid JSON.", res.id, true);
      }
      // Fitted to the limits structured outputs can't enforce, then validated against the engine's own schema before
      // anyone sees it. What was adjusted, or what still doesn't fit, is logged by path (never the content).
      const adjusted: string[] = [];
      const parsed = req.schema.safeParse(fitToSchema(req.schema as never, json, "", adjusted));
      if (adjusted.length) console.info(JSON.stringify({ event: "reasoning.fitted", request_id: res.id, adjusted: adjusted.slice(0, 20) }));
      if (!parsed.success) {
        const why = describeIssues(parsed.error.issues as never);
        console.warn(JSON.stringify({ event: "reasoning.shape_mismatch", request_id: res.id, issues: why }));
        throw new ProviderError(`Claude's answer didn't match the expected shape (${why}).`, res.id, true);
      }
      return {
        data: parsed.data,
        test_output: false,
        model: res.model,
        provider_request_id: res.id,
        usage: { input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens },
      };
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      if (e instanceof Anthropic.AuthenticationError) throw new ProviderError("Claude rejected the API key on the server.");
      if (e instanceof Anthropic.RateLimitError) throw new ProviderError("Claude is busy (rate limited) — try again shortly.", null, true);
      // Out of credit is an account matter for the owner, not a failure to retry (seen live 2026-09-29).
      if (e instanceof Anthropic.APIError && /credit balance is too low/i.test(e.message))
        throw new ProviderError("The Claude account has run out of credit. The account owner can add credit at console.anthropic.com → Plans & Billing; AI writing resumes as soon as it's topped up.");
      if (e instanceof Anthropic.APIError) throw new ProviderError(`Claude error ${e.status ?? ""}: ${e.message}`.trim(), null, (e.status ?? 500) >= 500);
      throw e;
    }
  },
};
