import { describe, expect, it, vi, beforeEach } from "vitest";
import { z } from "zod";

const calls: any[] = [];
let next: any = null;
vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error { constructor(public status: number, msg: string) { super(msg); } }
  class AuthenticationError extends APIError {}
  class RateLimitError extends APIError {}
  class Anthropic {
    static APIError = APIError; static AuthenticationError = AuthenticationError; static RateLimitError = RateLimitError;
    beta = { messages: { create: async (p: any) => { calls.push(p); if (next instanceof Error) throw next; return next; } } };
  }
  return { default: Anthropic };
});
import Anthropic from "@anthropic-ai/sdk";
import { anthropicReasoningAdapter, jsonSchemaOf } from "../anthropic/anthropicReasoningAdapter";
import { reasoningProvider } from "../index";

const Names = z.object({ names: z.array(z.object({ name: z.string(), why: z.string() })).min(1) }).strict();
const ok = (text: string, extra: any = {}) => ({ id: "msg_1", model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text }], usage: { input_tokens: 10, output_tokens: 5 }, ...extra });
const env = { ANTHROPIC_API_KEY: "sk-test" };

describe("Claude reasoning adapter", () => {
  beforeEach(() => { calls.length = 0; next = null; });

  it("is only offered when the key is on the server", () => {
    expect(reasoningProvider({})).toBeNull();
    expect(reasoningProvider(env)?.id).toBe("anthropic");
  });

  it("asks for a JSON-schema answer with adaptive thinking and fallbacks, and validates it", async () => {
    next = ok(JSON.stringify({ names: [{ name: "Adaeze Okafor", why: "Igbo, 1990s Lagos" }] }));
    const r = await anthropicReasoningAdapter.complete({ system: "You name characters.", prompt: "A Lagos journalist", schema: Names, effort: "medium" }, env);
    expect(r).toMatchObject({ data: { names: [{ name: "Adaeze Okafor" }] }, model: "claude-opus-5-5", provider_request_id: "msg_1" });
    const p = calls[0];
    expect(p).toMatchObject({ model: "claude-opus-5-5", thinking: { type: "adaptive" }, fallbacks: "default", betas: ["server-side-fallback-2026-07-01"] });
    expect(p.output_config).toMatchObject({ effort: "medium", format: { type: "json_schema" } });
    expect(p.output_config.format.schema).toMatchObject({ type: "object", additionalProperties: false, required: ["names"] });
    expect(p.output_config.format.schema.$schema).toBeUndefined();
  });

  it("never passes on an answer that is refused, cut off, not JSON or the wrong shape", async () => {
    const run = () => anthropicReasoningAdapter.complete({ system: "s", prompt: "p", schema: Names }, env);
    next = ok("", { stop_reason: "refusal" });
    await expect(run()).rejects.toThrow("declined");
    next = ok("{\"names\":[", { stop_reason: "max_tokens" });
    await expect(run()).rejects.toThrow("cut off");
    next = ok("not json");
    await expect(run()).rejects.toThrow("valid JSON");
    next = ok(JSON.stringify({ names: [] }));
    await expect(run()).rejects.toThrow("expected shape");
    next = new (Anthropic as any).AuthenticationError(401, "bad key");
    await expect(run()).rejects.toThrow("rejected the API key");
    await expect(anthropicReasoningAdapter.complete({ system: "s", prompt: "p", schema: Names }, {})).rejects.toThrow("not connected");
  });

  it("builds an inlined JSON schema from zod", () => {
    expect(jsonSchemaOf(Names)).toMatchObject({ type: "object", properties: { names: { type: "array" } } });
  });
});

describe("structured-output schema (regression: live 400 'maxItems is not supported')", () => {
  it("sends only supported keywords, with the limits described in words; the full schema still validates the answer", async () => {
    const { PlanSchema } = await import("@aurastage/aura-intelligence");
    const s = JSON.stringify(jsonSchemaOf(PlanSchema));
    for (const k of ["maxItems", "maxLength", "minLength", "minimum", "maximum", "pattern", "format"]) expect(s).not.toContain(`"${k}"`);
    const plan = jsonSchemaOf(PlanSchema) as any;
    expect(plan.properties.calls.description).toContain("at most 12 items");
    expect(plan.properties.calls.items.additionalProperties).toBe(false);
    expect(jsonSchemaOf(z.object({ n: z.number().int().min(0).max(10) })).properties).toMatchObject({ n: { type: "integer", description: "(minimum 0, maximum 10)" } });
  });
});
