// apps/api/src/providers/image/bfl/bflAdapter.ts
// Black Forest Labs FLUX adapter (FLUX 1.1 [pro], Ultra, Kontext [pro] with a reference image). Only this file knows the
// BFL endpoints. Configured by BFL_API_KEY on the server; never called from the browser.
import type { GenerateRequest, GenerateResult, ProviderAdapter, ReferenceImage, StillRequest } from "../../types";
import { ProviderError } from "../../types";
import { b64, download, jsonOrThrow, poll, type CallOpts } from "../../http";
import { describeReferences } from "../../references";
import { avoid, framedPrompt } from "../../promptFor";

const BASE = "https://api.bfl.ai/v1";
const SIZE: Record<string, [number, number]> = { "16:9": [1408, 800], "9:16": [800, 1408], "1:1": [1024, 1024], "2.39:1": [1440, 608], "4:3": [1184, 896] };
const RATIO: Record<string, string> = { "16:9": "16:9", "9:16": "9:16", "1:1": "1:1", "2.39:1": "21:9", "4:3": "4:3" };

async function run(model: string, prompt: string, aspect: string, seed: number | null, refs: ReferenceImage[], env: Record<string, string | undefined>, opts: CallOpts): Promise<GenerateResult> {
  const key = env.BFL_API_KEY;
  if (!key) throw new ProviderError("Black Forest Labs is not connected (no API key on the server).");
  const f = opts.fetchImpl ?? fetch;
  const headers = { "x-key": key, "Content-Type": "application/json", accept: "application/json" };
  const body: Record<string, unknown> = { prompt: prompt.slice(0, 8000), output_format: "png", safety_tolerance: 2, ...(seed !== null ? { seed } : {}) };
  if (model === "flux-pro-1.1") { const [w, h] = SIZE[aspect] ?? SIZE["16:9"]; Object.assign(body, { width: w, height: h }); }
  else body.aspect_ratio = RATIO[aspect] ?? "16:9";
  if (model === "flux-kontext-pro" && refs[0]) body.input_image = b64(refs[0].bytes);
  const start = await f(`${BASE}/${model}`, { method: "POST", headers, body: JSON.stringify(body), signal: opts.signal });
  const started = await jsonOrThrow<{ id?: string; polling_url?: string }>(start, "Black Forest Labs", (j) => (Array.isArray(j.detail) ? j.detail.map((d: any) => d.msg).join("; ") : j.detail ?? j.message));
  if (!started.id || !started.polling_url) throw new ProviderError("Black Forest Labs didn't return a task id.");
  const id = started.id;
  const url = await poll<string>("Black Forest Labs", id, opts, async () => {
    const r = await f(started.polling_url!, { headers, signal: opts.signal });
    const j = (await r.json().catch(() => ({}))) as { status?: string; result?: { sample?: string } };
    if (j.status === "Ready" && j.result?.sample) return { done: j.result.sample };
    if (j.status && /Error|Moderated|Failed|Not Found/i.test(j.status)) return { failed: j.status };
    return {};
  });
  const got = await download(url, "Black Forest Labs", id, "image/png", opts);
  return { ...got, provider_request_id: id, cost_usd: null };
}

export const bflAdapter: ProviderAdapter = {
  id: "bfl",
  name: "Black Forest Labs (FLUX)",
  capabilities: ["image"],
  models: [
    { id: "flux-pro-1.1", capability: "image", label: "FLUX 1.1 [pro]" },
    { id: "flux-pro-1.1-ultra", capability: "image", label: "FLUX 1.1 [pro] Ultra" },
    { id: "flux-kontext-pro", capability: "image", label: "FLUX.1 Kontext [pro] (keeps a reference)" },
  ],
  note: "High-detail stills; Kontext keeps a character or place from a reference image. Needs BFL_API_KEY on the server.",
  // Kontext edits from one reference image (the first character in frame, else the place).
  references: { image: { max: 1, media_types: ["image/png", "image/jpeg", "image/webp"], max_bytes: 18_000_000, models: ["flux-kontext-pro"] } },
  isConfigured: (env) => !!env.BFL_API_KEY,
  async generate(req: GenerateRequest, env, opts = {}) {
    if (req.capability !== "image") throw new ProviderError("FLUX makes still frames; choose a video provider for motion.");
    const refs = req.model === "flux-kontext-pro" ? (req.reference_images ?? []).slice(0, 1) : [];
    const lead = refs.length ? describeReferences(refs, () => "the input image") : "";
    return run(req.model, framedPrompt(req.package, "image", 8000, lead, avoid(req.package)), req.aspect_ratio, req.seed, refs, env, opts);
  },
  async generateStill(req: StillRequest, env, opts = {}) {
    return run(req.model === "flux-kontext-pro" ? "flux-pro-1.1" : req.model, `${req.prompt} Avoid: ${req.negative.join("; ")}.`, req.aspect_ratio, req.seed, [], env, opts);
  },
};
