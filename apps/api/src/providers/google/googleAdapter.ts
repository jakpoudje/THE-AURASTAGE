// apps/api/src/providers/google/googleAdapter.ts
// Google Gemini API adapter for pictures and motion: Imagen 4 stills, Gemini image (conditions on up to 3 reference
// images) and Veo 3 video (text or from the approved frame). Only this file knows those endpoints. Configured by
// GEMINI_API_KEY (or GOOGLE_API_KEY) on the server; never called from the browser.
import type { GenerateRequest, GenerateResult, ProviderAdapter, ReferenceImage, StillRequest } from "../types";
import { ProviderError } from "../types";
import { b64, download, jsonOrThrow, poll, type CallOpts } from "../http";
import { describeReferences } from "../references";

const BASE = "https://generativelanguage.googleapis.com/v1beta";
const key = (env: Record<string, string | undefined>) => env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
const IMAGEN_RATIO: Record<string, string> = { "16:9": "16:9", "9:16": "9:16", "1:1": "1:1", "2.39:1": "16:9", "4:3": "4:3" };
const GEMINI_IMAGE = "gemini-2.5-flash-image";
const why = (j: Record<string, any>) => j.error?.message;

async function imagen(model: string, prompt: string, aspect: string, k: string, opts: CallOpts): Promise<GenerateResult> {
  const f = opts.fetchImpl ?? fetch;
  const r = await f(`${BASE}/models/${model}:predict`, {
    method: "POST", headers: { "x-goog-api-key": k, "Content-Type": "application/json" }, signal: opts.signal,
    body: JSON.stringify({ instances: [{ prompt: prompt.slice(0, 8000) }], parameters: { sampleCount: 1, aspectRatio: IMAGEN_RATIO[aspect] ?? "16:9", personGeneration: "allow_adult" } }),
  });
  const j = await jsonOrThrow<{ predictions?: { bytesBase64Encoded?: string; mimeType?: string }[] }>(r, "Google Imagen", why);
  const p = j.predictions?.[0];
  if (!p?.bytesBase64Encoded) throw new ProviderError("Google Imagen returned no image (it may have been filtered by safety settings).");
  return { bytes: new Uint8Array(Buffer.from(p.bytesBase64Encoded, "base64")), media_type: p.mimeType ?? "image/png", provider_request_id: null, cost_usd: null };
}

async function geminiImage(prompt: string, aspect: string, refs: ReferenceImage[], k: string, opts: CallOpts): Promise<GenerateResult> {
  const f = opts.fetchImpl ?? fetch;
  const parts = [{ text: prompt.slice(0, 30000) }, ...refs.map((r) => ({ inline_data: { mime_type: r.media_type, data: b64(r.bytes) } }))];
  const r = await f(`${BASE}/models/${GEMINI_IMAGE}:generateContent`, {
    method: "POST", headers: { "x-goog-api-key": k, "Content-Type": "application/json" }, signal: opts.signal,
    body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: IMAGEN_RATIO[aspect] ?? "16:9" } } }),
  });
  const j = await jsonOrThrow<{ responseId?: string; candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] }; finishReason?: string }[] }>(r, "Gemini image", why);
  const img = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
  if (!img?.data) throw new ProviderError(`Gemini returned no image (${j.candidates?.[0]?.finishReason ?? "no reason given"}).`, j.responseId ?? null);
  return { bytes: new Uint8Array(Buffer.from(img.data, "base64")), media_type: img.mimeType ?? "image/png", provider_request_id: j.responseId ?? null, cost_usd: null };
}

async function veo(req: GenerateRequest, k: string, opts: CallOpts): Promise<GenerateResult> {
  const f = opts.fetchImpl ?? fetch;
  const headers = { "x-goog-api-key": k, "Content-Type": "application/json" };
  const instance: Record<string, unknown> = { prompt: req.package.prompt.slice(0, 8000) };
  if (req.source_image) instance.image = { bytesBase64Encoded: b64(req.source_image.bytes), mimeType: req.source_image.media_type };
  const start = await f(`${BASE}/models/${req.model}:predictLongRunning`, {
    method: "POST", headers, signal: opts.signal,
    body: JSON.stringify({ instances: [instance], parameters: { aspectRatio: req.aspect_ratio === "9:16" ? "9:16" : "16:9", negativePrompt: req.package.negative.join(", ") } }),
  });
  const op = await jsonOrThrow<{ name?: string }>(start, "Google Veo", why);
  if (!op.name) throw new ProviderError("Google Veo didn't return an operation.");
  const uri = await poll<string>("Google Veo", op.name, opts, async () => {
    const r = await f(`${BASE}/${op.name}`, { headers, signal: opts.signal });
    const j = (await r.json().catch(() => ({}))) as { done?: boolean; error?: { message?: string }; response?: { generateVideoResponse?: { generatedSamples?: { video?: { uri?: string } }[]; raiMediaFilteredReasons?: string[] } } };
    if (j.error) return { failed: j.error.message ?? "error" };
    if (!j.done) return {};
    const v = j.response?.generateVideoResponse;
    const u = v?.generatedSamples?.[0]?.video?.uri;
    return u ? { done: u } : { failed: v?.raiMediaFilteredReasons?.join("; ") ?? "no video returned" };
  }, 15);
  const got = await download(uri, "Google Veo", op.name, "video/mp4", opts, { "x-goog-api-key": k });
  return { ...got, provider_request_id: op.name, cost_usd: null };
}

export const googleAdapter: ProviderAdapter = {
  id: "google",
  name: "Google (Imagen, Gemini, Veo)",
  capabilities: ["image", "video"],
  models: [
    { id: "imagen-4.0-generate-001", capability: "image", label: "Imagen 4" },
    { id: "imagen-4.0-ultra-generate-001", capability: "image", label: "Imagen 4 Ultra" },
    { id: GEMINI_IMAGE, capability: "image", label: "Gemini image (keeps characters from references)" },
    { id: "veo-3.0-generate-001", capability: "video", label: "Veo 3 (video with sound)" },
    { id: "veo-3.0-fast-generate-001", capability: "video", label: "Veo 3 Fast" },
  ],
  note: "Imagen stills, Gemini image with reference images, Veo video (from text or the approved frame). Needs GEMINI_API_KEY on the server.",
  references: { image: { max: 3, media_types: ["image/png", "image/jpeg", "image/webp"], max_bytes: 7_000_000, models: [GEMINI_IMAGE] } },
  isConfigured: (env) => !!key(env),
  async generate(req, env, opts = {}) {
    const k = key(env);
    if (!k) throw new ProviderError("Google is not connected (no GEMINI_API_KEY on the server).");
    if (req.capability === "video") return veo(req, k, opts);
    const avoid = ` Avoid: ${req.package.negative.join("; ")}.`;
    if (req.model === GEMINI_IMAGE) {
      const refs = (req.reference_images ?? []).slice(0, 3);
      return geminiImage(`${describeReferences(refs, (i) => `reference image ${i + 1}`)}${req.package.prompt}${avoid}`, req.aspect_ratio, refs, k, opts);
    }
    return imagen(req.model, `${req.package.prompt}${avoid}`, req.aspect_ratio, k, opts);
  },
  async generateStill(req: StillRequest, env, opts = {}) {
    const k = key(env);
    if (!k) throw new ProviderError("Google is not connected (no GEMINI_API_KEY on the server).");
    const prompt = `${req.prompt} Avoid: ${req.negative.join("; ")}.`;
    return req.model === GEMINI_IMAGE ? geminiImage(prompt, req.aspect_ratio, [], k, opts) : imagen(req.model.startsWith("imagen") ? req.model : "imagen-4.0-generate-001", prompt, req.aspect_ratio, k, opts);
  },
};
