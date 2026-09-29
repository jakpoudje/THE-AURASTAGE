// OpenAI and Gemini as writers, and the chain that lets the next connected writer take over when one account has no
// credit (owner, 2026-09-29: every script provider hooked up, not just one).
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { geminiReasoningAdapter } from "../gemini/geminiReasoningAdapter";
import { connectedWriters, reasoningProvider, writerChain } from "../index";
import { openaiReasoningAdapter } from "../openai/openaiReasoningAdapter";
import { ProviderError } from "../../types";
import type { ReasoningAdapter } from "../types";

const Names = z.object({ names: z.array(z.string()).min(1) }).strict();
const ask = { system: "Suggest names.", prompt: "A detective in Lagos.", schema: Names };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json", "x-request-id": "req_1" } });
const fake = (res: Response) => { const calls: { url: string; init: RequestInit }[] = []; const f = (async (url: string, init: RequestInit) => (calls.push({ url, init }), res)) as unknown as typeof fetch; return { f, calls }; };

describe("OpenAI writer", () => {
  it("asks for the engine's JSON schema and validates the answer", async () => {
    const n = fake(json({ id: "chat_1", model: "gpt-5", choices: [{ message: { content: '{"names":["Amara"]}' }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
    const r = await openaiReasoningAdapter.complete(ask, { OPENAI_API_KEY: "k" }, n.f);
    expect(r).toMatchObject({ data: { names: ["Amara"] }, test_output: false, model: "gpt-5", provider_request_id: "chat_1", usage: { input_tokens: 10, output_tokens: 5 } });
    const body = JSON.parse(String(n.calls[0].init.body));
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.schema.properties.names.type).toBe("array");
    expect(body.messages[0]).toEqual({ role: "system", content: "Suggest names." });
  });
  it("never passes on the wrong shape, and names an empty account plainly", async () => {
    await expect(openaiReasoningAdapter.complete(ask, { OPENAI_API_KEY: "k" }, fake(json({ choices: [{ message: { content: '{"names":[]}' } }] })).f)).rejects.toThrow(/didn't match/);
    await expect(openaiReasoningAdapter.complete(ask, { OPENAI_API_KEY: "k" }, fake(json({ error: { message: "You exceeded your current quota" } }, 429)).f)).rejects.toThrow(/out of credit/);
  });
});

describe("Gemini writer", () => {
  it("uses a JSON response schema, key in a header, and validates the answer", async () => {
    const n = fake(json({ responseId: "g1", modelVersion: "gemini-2.5-pro", candidates: [{ content: { parts: [{ text: '{"names":["Tunde"]}' }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 3 } }));
    const r = await geminiReasoningAdapter.complete(ask, { GEMINI_API_KEY: "secret" }, n.f);
    expect(r).toMatchObject({ data: { names: ["Tunde"] }, provider_request_id: "g1", usage: { input_tokens: 7, output_tokens: 3 } });
    expect(n.calls[0].url).not.toContain("secret");
    expect(JSON.parse(String(n.calls[0].init.body)).generationConfig.responseMimeType).toBe("application/json");
  });
  it("reports a cut-off answer as retryable", async () => {
    await expect(geminiReasoningAdapter.complete(ask, { GEMINI_API_KEY: "k" }, fake(json({ candidates: [{ finishReason: "MAX_TOKENS" }] })).f)).rejects.toMatchObject({ retryable: true });
  });
});

describe("writer chain", () => {
  const writer = (id: string, fail?: Error): ReasoningAdapter => ({
    id, name: id, execution: "external", note: "", isConfigured: () => true,
    complete: async <T,>() => { if (fail) throw fail; return { data: { names: [id] } as T, test_output: false, model: `${id}-model`, provider_request_id: null, usage: { input_tokens: 1, output_tokens: 1 } }; },
  });
  it("the next writer answers when the first account is out of credit, and the result says who answered", async () => {
    const r = await writerChain([writer("anthropic", new ProviderError("The Claude account has run out of credit.")), writer("openai")]).complete(ask, {});
    expect(r).toMatchObject({ provider: "openai", model: "openai-model", data: { names: ["openai"] } });
  });
  it("any other failure is reported as is (no silent switch)", async () => {
    await expect(writerChain([writer("anthropic", new ProviderError("Claude's answer wasn't valid JSON.", null, true)), writer("openai")]).complete(ask, {})).rejects.toThrow(/valid JSON/);
  });
  it("orders connected writers (preference first) and only uses the test planner when none is connected", () => {
    expect(connectedWriters({ ANTHROPIC_API_KEY: "a", GEMINI_API_KEY: "g" }).map((w) => w.id)).toEqual(["anthropic", "gemini"]);
    expect(connectedWriters({ ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "o", AURA_REASONING_PROVIDER: "openai" }).map((w) => w.id)).toEqual(["openai", "anthropic"]);
    expect(reasoningProvider({ OPENAI_API_KEY: "o" })!.id).toBe("openai");
    expect(reasoningProvider({}, { allowTest: true })!.execution).toBe("test");
    expect(reasoningProvider({})).toBeNull();
  });
});
