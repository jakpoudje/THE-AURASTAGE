// apps/api/src/providers/reasoning/gemini/geminiReasoningAdapter.ts
// Google Gemini adapter for story understanding and writing (generateContent with a JSON schema). Only this file knows
// the endpoint. Configured by GEMINI_API_KEY or GOOGLE_API_KEY (GEMINI_MODEL to choose the model); never from the browser.
import { ProviderError } from "../../types";
import { jsonSchemaOf } from "../anthropic/anthropicReasoningAdapter";
import { finishStructured } from "../structured";
import type { ReasoningAdapter, ReasoningRequest, ReasoningResult } from "../types";

export const GEMINI_MODEL = "gemini-2.5-pro";

export const geminiReasoningAdapter: ReasoningAdapter = {
  id: "gemini",
  name: "Google Gemini",
  execution: "external",
  note: "Story understanding, drafting and field suggestions. Needs GEMINI_API_KEY on the server (GEMINI_MODEL optional).",
  isConfigured: (env) => !!(env.GEMINI_API_KEY || env.GOOGLE_API_KEY),
  async complete<T>(req: ReasoningRequest<T>, env: Record<string, string | undefined>, fetchImpl: typeof fetch = fetch): Promise<ReasoningResult<T>> {
    const key = env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
    if (!key) throw new ProviderError("Gemini is not connected (no API key on the server).");
    const model = env.GEMINI_MODEL || GEMINI_MODEL;
    const r = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: "user", parts: [{ text: req.prompt }] }],
        generationConfig: { responseMimeType: "application/json", responseJsonSchema: jsonSchemaOf(req.schema), maxOutputTokens: req.max_tokens ?? 16000 },
      }),
    });
    const j = (await r.json().catch(() => ({}))) as {
      responseId?: string; modelVersion?: string; error?: { message?: string; status?: string };
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]; promptFeedback?: { blockReason?: string };
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    if (!r.ok) {
      if (r.status === 400 && /API key/i.test(j.error?.message ?? "")) throw new ProviderError("Gemini rejected the API key on the server.");
      if (r.status === 429 && /quota|billing/i.test(j.error?.message ?? "")) throw new ProviderError("The Gemini account is out of quota. The account owner can enable billing at aistudio.google.com.");
      throw new ProviderError(`Gemini error ${r.status}: ${j.error?.message ?? "no details"}`, null, r.status === 429 || r.status >= 500);
    }
    if (j.promptFeedback?.blockReason) throw new ProviderError(`Gemini declined this request (${j.promptFeedback.blockReason}).`, j.responseId ?? null);
    const c = j.candidates?.[0];
    if (c?.finishReason === "MAX_TOKENS") throw new ProviderError("Gemini's answer was cut off — try a smaller request.", j.responseId ?? null, true);
    const text = (c?.content?.parts ?? []).map((p) => p.text ?? "").join("");
    const data = finishStructured("Gemini", text, req.schema, j.responseId ?? null);
    return { data, test_output: false, model: j.modelVersion ?? model, provider_request_id: j.responseId ?? null, usage: { input_tokens: j.usageMetadata?.promptTokenCount ?? 0, output_tokens: j.usageMetadata?.candidatesTokenCount ?? 0 } };
  },
};
