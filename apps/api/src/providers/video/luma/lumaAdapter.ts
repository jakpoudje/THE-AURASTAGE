// apps/api/src/providers/video/luma/lumaAdapter.ts
// Luma Dream Machine adapter (Ray 2 video from text or the approved frame; Photon stills with character/place image
// references). Luma fetches images by URL, so the worker passes short-lived signed links. Only this file knows Luma's
// endpoints. Configured by LUMA_API_KEY on the server; never called from the browser.
import type { GenerateRequest, GenerateResult, ProviderAdapter, StillRequest } from "../../types";
import { ProviderError } from "../../types";
import { download, jsonOrThrow, poll, type CallOpts } from "../../http";
import { avoid, framedPrompt } from "../../promptFor";

const BASE = "https://api.lumalabs.ai/dream-machine/v1";
const RATIO: Record<string, string> = { "16:9": "16:9", "9:16": "9:16", "1:1": "1:1", "2.39:1": "21:9", "4:3": "4:3" };
type Gen = { id?: string; state?: string; failure_reason?: string; assets?: { video?: string; image?: string } };

async function create(path: string, body: Record<string, unknown>, kind: "video" | "image", env: Record<string, string | undefined>, opts: CallOpts): Promise<GenerateResult> {
  const key = env.LUMA_API_KEY;
  if (!key) throw new ProviderError("Luma is not connected (no API key on the server).");
  const f = opts.fetchImpl ?? fetch;
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json", accept: "application/json" };
  const start = await f(BASE + path, { method: "POST", headers, body: JSON.stringify(body), signal: opts.signal });
  const g = await jsonOrThrow<Gen>(start, "Luma", (j) => j.detail ?? j.message);
  if (!g.id) throw new ProviderError("Luma didn't return a generation id.");
  const url = await poll<string>("Luma", g.id, opts, async () => {
    const r = await f(`${BASE}/generations/${g.id}`, { headers, signal: opts.signal });
    const s = (await r.json().catch(() => ({}))) as Gen;
    if (s.state === "completed") { const u = kind === "video" ? s.assets?.video : s.assets?.image; return u ? { done: u } : { failed: "no file returned" }; }
    if (s.state === "failed") return { failed: s.failure_reason ?? "no reason given" };
    return {};
  }, 12);
  const got = await download(url, "Luma", g.id, kind === "video" ? "video/mp4" : "image/jpeg", opts);
  return { ...got, provider_request_id: g.id, cost_usd: null };
}

export const lumaAdapter: ProviderAdapter = {
  id: "luma",
  name: "Luma Dream Machine",
  capabilities: ["image", "video"],
  models: [
    { id: "photon-1", capability: "image", label: "Photon (keeps characters from references)" },
    { id: "photon-flash-1", capability: "image", label: "Photon Flash" },
    { id: "ray-2", capability: "video", label: "Ray 2 (text or the approved frame)" },
    { id: "ray-flash-2", capability: "video", label: "Ray 2 Flash" },
  ],
  note: "Cinematic video (Ray 2) from text or the approved frame, and Photon stills with image references. Needs LUMA_API_KEY on the server.",
  // Photon takes image references by URL (characters and the place).
  references: { image: { max: 4, media_types: ["image/png", "image/jpeg", "image/webp"], max_bytes: 10_000_000 } },
  isConfigured: (env) => !!env.LUMA_API_KEY,
  async generate(req: GenerateRequest, env, opts = {}) {
    const prompt = framedPrompt(req.package, req.capability, 5000, "", avoid(req.package));
    if (req.capability === "video") {
      const frame = req.source_image?.url;
      return create("/generations", {
        prompt, model: req.model, aspect_ratio: RATIO[req.aspect_ratio] ?? "16:9", resolution: "720p", duration: (req.duration_seconds ?? 5) > 5 ? "9s" : "5s",
        ...(frame ? { keyframes: { frame0: { type: "image", url: frame } } } : {}),
      }, "video", env, opts);
    }
    const refs = (req.reference_images ?? []).filter((r) => r.url).slice(0, 4);
    return create("/generations/image", {
      prompt, model: req.model, aspect_ratio: RATIO[req.aspect_ratio] ?? "16:9",
      ...(refs.length ? { image_ref: refs.map((r) => ({ url: r.url, weight: r.kind === "character" ? 0.85 : 0.6 })) } : {}),
    }, "image", env, opts);
  },
  async generateStill(req: StillRequest, env, opts = {}) {
    return create("/generations/image", { prompt: `${req.prompt} Avoid: ${req.negative.join("; ")}.`.slice(0, 5000), model: req.model.startsWith("photon") ? req.model : "photon-1", aspect_ratio: RATIO[req.aspect_ratio] ?? "1:1" }, "image", env, opts);
  },
};
