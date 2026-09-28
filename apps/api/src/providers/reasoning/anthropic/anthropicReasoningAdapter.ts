// apps/api/src/providers/reasoning/anthropic/anthropicReasoningAdapter.ts
// Anthropic Claude adapter. Only this file imports the Anthropic SDK (CLAUDE.md rule 7).
// Configured by ANTHROPIC_API_KEY on the server; never called from the browser.
import Anthropic from "@anthropic-ai/sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ProviderError } from "../../types";
import type { ReasoningAdapter, ReasoningRequest, ReasoningResult } from "../types";

export const CLAUDE_MODEL = "claude-opus-5";

let cached: { key: string; client: Anthropic } | null = null;
function client(key: string) {
  if (cached?.key !== key) cached = { key, client: new Anthropic({ apiKey: key, maxRetries: 2, timeout: 10 * 60 * 1000 }) };
  return cached.client;
}

/** JSON Schema for structured outputs, from the engine's zod schema (inlined, no $schema/$ref). */
export function jsonSchemaOf(schema: unknown): Record<string, unknown> {
  const { $schema: _drop, ...rest } = zodToJsonSchema(schema as never, { $refStrategy: "none", target: "jsonSchema7" }) as Record<string, unknown>;
  return rest;
}

export const anthropicReasoningAdapter: ReasoningAdapter = {
  id: "anthropic",
  name: "Anthropic Claude",
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
      // Validated against the engine's own schema before anyone sees it.
      const parsed = req.schema.safeParse(json);
      if (!parsed.success) throw new ProviderError("Claude's answer didn't match the expected shape.", res.id, true);
      return {
        data: parsed.data,
        model: res.model,
        provider_request_id: res.id,
        usage: { input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens },
      };
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      if (e instanceof Anthropic.AuthenticationError) throw new ProviderError("Claude rejected the API key on the server.");
      if (e instanceof Anthropic.RateLimitError) throw new ProviderError("Claude is busy (rate limited) — try again shortly.", null, true);
      if (e instanceof Anthropic.APIError) throw new ProviderError(`Claude error ${e.status ?? ""}: ${e.message}`.trim(), null, (e.status ?? 500) >= 500);
      throw e;
    }
  },
};
