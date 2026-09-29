// apps/api/src/providers/image/openai/openaiImageAdapter.ts
// OpenAI Images adapter (gpt-image-1). Only this file knows OpenAI's endpoint.
// Configured by OPENAI_API_KEY on the server; never called from the browser.
import type { GenerateRequest, GenerateResult, ProviderAdapter, StillRequest } from "../../types";
import { ProviderError } from "../../types";

const SIZE: Record<string, string> = { "16:9": "1536x1024", "2.39:1": "1536x1024", "4:3": "1536x1024", "9:16": "1024x1536", "1:1": "1024x1024" };

export const openaiImageAdapter: ProviderAdapter = {
  id: "openai",
  name: "OpenAI Images",
  capabilities: ["image"],
  models: [{ id: "gpt-image-1", capability: "image", label: "GPT Image 1" }],
  note: "Still frames from the compiled prompt. Needs OPENAI_API_KEY on the server.",
  isConfigured: (env) => !!env.OPENAI_API_KEY,
  async generate(req: GenerateRequest, env, opts = {}): Promise<GenerateResult> {
    if (req.capability !== "image") throw new ProviderError("OpenAI Images only makes still frames.");
    return imagesApi(`${req.package.prompt} Avoid: ${req.package.negative.join("; ")}.`, req.model, req.aspect_ratio, env, opts);
  },
  async generateStill(req: StillRequest, env, opts = {}): Promise<GenerateResult> {
    return imagesApi(`${req.prompt} Avoid: ${req.negative.join("; ")}.`, req.model, req.aspect_ratio, env, opts);
  },
};

async function imagesApi(prompt: string, model: string, aspect: string, env: Record<string, string | undefined>, opts: { signal?: AbortSignal; fetchImpl?: typeof fetch }): Promise<GenerateResult> {
  const key = env.OPENAI_API_KEY;
  if (!key) throw new ProviderError("OpenAI is not connected (no API key on the server).");
  const f = opts.fetchImpl ?? fetch;
  const req = { model, aspect_ratio: aspect };
  const r = await f("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: req.model, prompt: prompt.slice(0, 32000), size: SIZE[req.aspect_ratio] ?? "1536x1024", n: 1 }),
    signal: opts.signal,
  });
  const j = (await r.json().catch(() => ({}))) as { data?: { b64_json?: string }[]; error?: { message?: string } };
  const requestId = r.headers.get("x-request-id");
  if (!r.ok || !j.data?.[0]?.b64_json) {
    throw new ProviderError(`OpenAI refused the request (${r.status}): ${j.error?.message ?? "no image returned"}`, requestId, r.status === 429 || r.status >= 500);
  }
  return { bytes: new Uint8Array(Buffer.from(j.data[0].b64_json, "base64")), media_type: "image/png", provider_request_id: requestId, cost_usd: null };
}
