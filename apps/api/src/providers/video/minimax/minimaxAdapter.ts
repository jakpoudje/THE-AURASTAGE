// apps/api/src/providers/video/minimax/minimaxAdapter.ts
// MiniMax Hailuo adapter (video from text or the approved frame). Only this file knows MiniMax's endpoints. Configured
// by MINIMAX_API_KEY on the server (MINIMAX_API_BASE to change region); never called from the browser.
import type { GenerateRequest, GenerateResult, ProviderAdapter } from "../../types";
import { ProviderError } from "../../types";
import { dataUri, download, jsonOrThrow, poll } from "../../http";

const DEFAULT_BASE = "https://api.minimax.io";
type Base = { base_resp?: { status_code?: number; status_msg?: string } };

export const minimaxAdapter: ProviderAdapter = {
  id: "minimax",
  name: "MiniMax Hailuo",
  capabilities: ["video"],
  models: [
    { id: "MiniMax-Hailuo-02", capability: "video", label: "Hailuo 02 (text or the approved frame)" },
    { id: "I2V-01-live", capability: "video", label: "I2V-01 Live (animates the approved frame)" },
  ],
  note: "Expressive performances from text or the approved frame. Needs MINIMAX_API_KEY on the server.",
  isConfigured: (env) => !!env.MINIMAX_API_KEY,
  async generate(req: GenerateRequest, env, opts = {}): Promise<GenerateResult> {
    const key = env.MINIMAX_API_KEY;
    if (!key) throw new ProviderError("MiniMax is not connected (no API key on the server).");
    if (req.capability !== "video") throw new ProviderError("MiniMax Hailuo makes video; choose an image provider for stills.");
    if (req.model === "I2V-01-live" && !req.source_image) throw new ProviderError("I2V-01 Live animates a finished frame — generate and pick an image take first.");
    const f = opts.fetchImpl ?? fetch;
    const base = env.MINIMAX_API_BASE || DEFAULT_BASE;
    const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
    const ok = (j: Base) => (j.base_resp?.status_code ?? 0) === 0;
    const start = await f(`${base}/v1/video_generation`, {
      method: "POST", headers, signal: opts.signal,
      body: JSON.stringify({
        model: req.model, prompt: req.package.prompt.slice(0, 2000), prompt_optimizer: false,
        ...(req.model === "MiniMax-Hailuo-02" ? { duration: (req.duration_seconds ?? 6) > 6 ? 10 : 6, resolution: "768P" } : {}),
        ...(req.source_image ? { first_frame_image: dataUri(req.source_image) } : {}),
      }),
    });
    const t = await jsonOrThrow<Base & { task_id?: string }>(start, "MiniMax", (j) => j.base_resp?.status_msg);
    if (!ok(t) || !t.task_id) throw new ProviderError(`MiniMax refused the request: ${t.base_resp?.status_msg ?? "no task id"}`, null, t.base_resp?.status_code === 1002);
    const id = t.task_id;
    const fileId = await poll<string>("MiniMax", id, opts, async () => {
      const r = await f(`${base}/v1/query/video_generation?task_id=${encodeURIComponent(id)}`, { headers, signal: opts.signal });
      const s = (await r.json().catch(() => ({}))) as Base & { status?: string; file_id?: string };
      if (s.status === "Success" && s.file_id) return { done: s.file_id };
      if (s.status === "Fail") return { failed: s.base_resp?.status_msg ?? "no reason given" };
      return {};
    }, 15);
    const fr = await f(`${base}/v1/files/retrieve?file_id=${encodeURIComponent(fileId)}`, { headers, signal: opts.signal });
    const file = await jsonOrThrow<Base & { file?: { download_url?: string } }>(fr, "MiniMax", (j) => j.base_resp?.status_msg, id);
    if (!file.file?.download_url) throw new ProviderError("MiniMax finished but gave no download link.", id, true);
    const got = await download(file.file.download_url, "MiniMax", id, "video/mp4", opts);
    return { ...got, provider_request_id: id, cost_usd: null };
  },
};
