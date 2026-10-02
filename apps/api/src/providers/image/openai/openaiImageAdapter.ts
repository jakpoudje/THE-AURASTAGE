// apps/api/src/providers/image/openai/openaiImageAdapter.ts
// OpenAI Images adapter (gpt-image-1). Only this file knows OpenAI's endpoint.
// Configured by OPENAI_API_KEY on the server; never called from the browser.
import type { GenerateRequest, GenerateResult, ProviderAdapter, ReferenceImage, StillRequest } from "../../types";
import { ProviderError } from "../../types";
import { describeReferences } from "../../references";
import { avoid, framedPrompt } from "../../promptFor";

const SIZE: Record<string, string> = { "16:9": "1536x1024", "2.39:1": "1536x1024", "4:3": "1536x1024", "9:16": "1024x1536", "1:1": "1024x1024" };

export const openaiImageAdapter: ProviderAdapter = {
  id: "openai",
  name: "OpenAI Images",
  capabilities: ["image"],
  models: [{ id: "gpt-image-1", capability: "image", label: "GPT Image 1" }],
  note: "Still frames from the compiled prompt, conditioned on the shot's reference images (characters, location, props). Needs OPENAI_API_KEY on the server.",
  // The image edits endpoint takes several input images; 6 keeps requests fast while covering a busy shot.
  references: { image: { max: 6, media_types: ["image/png", "image/jpeg", "image/webp"], max_bytes: 20_000_000 } },
  isConfigured: (env) => !!env.OPENAI_API_KEY,
  async generate(req: GenerateRequest, env, opts = {}): Promise<GenerateResult> {
    if (req.capability !== "image") throw new ProviderError("OpenAI Images only makes still frames.");
    const refs = (req.reference_images ?? []).slice(0, 6);
    const lead = describeReferences(refs, (i) => `reference image ${i + 1}`);
    const prompt = framedPrompt(req.package, "image", 32000, lead, avoid(req.package));
    return refs.length ? editsApi(prompt, refs, req.model, req.aspect_ratio, env, opts) : imagesApi(prompt, req.model, req.aspect_ratio, env, opts);
  },
  async generateStill(req: StillRequest, env, opts = {}): Promise<GenerateResult> {
    return imagesApi(`${req.prompt} Avoid: ${req.negative.join("; ")}.`, req.model, req.aspect_ratio, env, opts);
  },
};

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/** The image-edits endpoint: a new frame generated with the reference images as visual input. */
async function editsApi(prompt: string, refs: ReferenceImage[], model: string, aspect: string, env: Record<string, string | undefined>, opts: { signal?: AbortSignal; fetchImpl?: typeof fetch }): Promise<GenerateResult> {
  const key = env.OPENAI_API_KEY;
  if (!key) throw new ProviderError("OpenAI is not connected (no API key on the server).");
  const f = opts.fetchImpl ?? fetch;
  const form = new FormData();
  form.append("model", model);
  form.append("prompt", prompt.slice(0, 32000));
  form.append("size", SIZE[aspect] ?? "1536x1024");
  form.append("n", "1");
  refs.forEach((r, i) => form.append("image[]", new Blob([r.bytes], { type: r.media_type }), `reference-${i + 1}.${EXT[r.media_type] ?? "png"}`));
  const r = await f("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: opts.signal });
  return readImage(r);
}

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
  return readImage(r);
}

async function readImage(r: Response): Promise<GenerateResult> {
  const j = (await r.json().catch(() => ({}))) as { data?: { b64_json?: string }[]; error?: { message?: string } };
  const requestId = r.headers.get("x-request-id");
  if (!r.ok || !j.data?.[0]?.b64_json) {
    throw new ProviderError(`OpenAI refused the request (${r.status}): ${j.error?.message ?? "no image returned"}`, requestId, r.status === 429 || r.status >= 500);
  }
  return { bytes: new Uint8Array(Buffer.from(j.data[0].b64_json, "base64")), media_type: "image/png", provider_request_id: requestId, cost_usd: null };
}
