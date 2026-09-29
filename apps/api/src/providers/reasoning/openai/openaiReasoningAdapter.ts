// apps/api/src/providers/reasoning/openai/openaiReasoningAdapter.ts
// OpenAI adapter for story understanding and writing (Chat Completions with a JSON schema). Only this file knows the
// endpoint. Configured by OPENAI_API_KEY (OPENAI_REASONING_MODEL to choose the model); never called from the browser.
import { ProviderError } from "../../types";
import { jsonSchemaOf } from "../anthropic/anthropicReasoningAdapter";
import { finishStructured } from "../structured";
import type { ReasoningAdapter, ReasoningRequest, ReasoningResult } from "../types";

export const OPENAI_REASONING_MODEL = "gpt-5";
const EFFORT: Record<string, string> = { low: "low", medium: "medium", high: "high", xhigh: "high", max: "high" };

export const openaiReasoningAdapter: ReasoningAdapter = {
  id: "openai",
  name: "OpenAI",
  execution: "external",
  note: "Story understanding, drafting and field suggestions. Needs OPENAI_API_KEY on the server (OPENAI_REASONING_MODEL optional).",
  isConfigured: (env) => !!env.OPENAI_API_KEY,
  async complete<T>(req: ReasoningRequest<T>, env: Record<string, string | undefined>, fetchImpl: typeof fetch = fetch): Promise<ReasoningResult<T>> {
    const key = env.OPENAI_API_KEY;
    if (!key) throw new ProviderError("OpenAI is not connected (no API key on the server).");
    const model = env.OPENAI_REASONING_MODEL || OPENAI_REASONING_MODEL;
    const r = await fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: req.system }, { role: "user", content: req.prompt }],
        response_format: { type: "json_schema", json_schema: { name: "answer", schema: jsonSchemaOf(req.schema), strict: false } },
        max_completion_tokens: req.max_tokens ?? 16000,
        reasoning_effort: EFFORT[req.effort ?? "high"],
      }),
    });
    const requestId = r.headers.get("x-request-id");
    const j = (await r.json().catch(() => ({}))) as {
      id?: string; model?: string; error?: { message?: string; code?: string };
      choices?: { message?: { content?: string; refusal?: string }; finish_reason?: string }[]; usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    if (!r.ok) {
      if (r.status === 401) throw new ProviderError("OpenAI rejected the API key on the server.", requestId);
      if (r.status === 429 && /quota|billing/i.test(j.error?.message ?? "")) throw new ProviderError("The OpenAI account is out of credit (quota). The account owner can add credit at platform.openai.com → Billing.", requestId);
      throw new ProviderError(`OpenAI error ${r.status}: ${j.error?.message ?? "no details"}`, requestId, r.status === 429 || r.status >= 500);
    }
    const c = j.choices?.[0];
    if (c?.message?.refusal) throw new ProviderError("OpenAI declined this request.", j.id ?? requestId);
    if (c?.finish_reason === "length") throw new ProviderError("OpenAI's answer was cut off — try a smaller request.", j.id ?? requestId, true);
    const data = finishStructured("OpenAI", c?.message?.content ?? "", req.schema, j.id ?? requestId);
    return { data, test_output: false, model: j.model ?? model, provider_request_id: j.id ?? requestId, usage: { input_tokens: j.usage?.prompt_tokens ?? 0, output_tokens: j.usage?.completion_tokens ?? 0 } };
  },
};
