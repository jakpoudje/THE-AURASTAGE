// apps/api/src/providers/image/stability/stabilityAdapter.ts
// Stability AI adapter (Stable Image Ultra / Core, Stable Diffusion 3.5). Only this file knows Stability's endpoints.
// Configured by STABILITY_API_KEY on the server; never called from the browser.
import type { GenerateRequest, GenerateResult, ProviderAdapter, StillRequest } from "../../types";
import { ProviderError } from "../../types";
import type { CallOpts } from "../../http";

const BASE = "https://api.stability.ai/v2beta/stable-image/generate";
// Stability's aspect ratios; the nearest one is used for the film ratios it doesn't have.
const RATIO: Record<string, string> = { "16:9": "16:9", "9:16": "9:16", "1:1": "1:1", "2.39:1": "21:9", "4:3": "3:2" };
const ENDPOINT: Record<string, { path: string; model?: string }> = {
  "stable-image-ultra": { path: "/ultra" }, "stable-image-core": { path: "/core" },
  "sd3.5-large": { path: "/sd3", model: "sd3.5-large" }, "sd3.5-large-turbo": { path: "/sd3", model: "sd3.5-large-turbo" },
};

async function generate(model: string, prompt: string, negative: string[], aspect: string, seed: number | null, env: Record<string, string | undefined>, opts: CallOpts): Promise<GenerateResult> {
  const key = env.STABILITY_API_KEY;
  if (!key) throw new ProviderError("Stability AI is not connected (no API key on the server).");
  const ep = ENDPOINT[model];
  if (!ep) throw new ProviderError(`Stability AI doesn't offer ${model}.`);
  const form = new FormData();
  form.append("prompt", prompt.slice(0, 10000));
  if (negative.length) form.append("negative_prompt", negative.join(", ").slice(0, 10000));
  form.append("aspect_ratio", RATIO[aspect] ?? "16:9");
  form.append("output_format", "png");
  if (seed !== null) form.append("seed", String(seed));
  if (ep.model) form.append("model", ep.model);
  const f = opts.fetchImpl ?? fetch;
  const r = await f(BASE + ep.path, { method: "POST", headers: { Authorization: `Bearer ${key}`, Accept: "image/*" }, body: form, signal: opts.signal });
  const requestId = r.headers.get("x-request-id");
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { errors?: string[]; message?: string; name?: string };
    const why = j.errors?.join("; ") ?? j.message ?? j.name ?? r.statusText;
    throw new ProviderError(`Stability AI refused the request (${r.status}): ${why}${r.status === 402 ? " — the account needs credit" : r.status === 401 || r.status === 403 ? " — check the API key on the server" : ""}`, requestId, r.status === 429 || r.status >= 500);
  }
  return { bytes: new Uint8Array(await r.arrayBuffer()), media_type: (r.headers.get("content-type") ?? "image/png").split(";")[0], provider_request_id: requestId, cost_usd: null };
}

export const stabilityAdapter: ProviderAdapter = {
  id: "stability",
  name: "Stability AI",
  capabilities: ["image"],
  models: [
    { id: "stable-image-ultra", capability: "image", label: "Stable Image Ultra" },
    { id: "stable-image-core", capability: "image", label: "Stable Image Core (fast)" },
    { id: "sd3.5-large", capability: "image", label: "Stable Diffusion 3.5 Large" },
    { id: "sd3.5-large-turbo", capability: "image", label: "Stable Diffusion 3.5 Large Turbo" },
  ],
  note: "Photoreal and stylised stills with negative prompts. Needs STABILITY_API_KEY on the server.",
  isConfigured: (env) => !!env.STABILITY_API_KEY,
  async generate(req: GenerateRequest, env, opts = {}) {
    if (req.capability !== "image") throw new ProviderError("Stability AI makes still frames here; choose a video provider for motion.");
    return generate(req.model, req.package.prompt, req.package.negative, req.aspect_ratio, req.seed, env, opts);
  },
  async generateStill(req: StillRequest, env, opts = {}) {
    return generate(req.model, req.prompt, req.negative, req.aspect_ratio, req.seed, env, opts);
  },
};
