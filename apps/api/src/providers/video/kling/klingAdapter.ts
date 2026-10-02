// apps/api/src/providers/video/kling/klingAdapter.ts
// Kling AI adapter (text-to-video and image-to-video from the approved frame). Kling signs every call with a short-lived
// JWT made from an access key and secret key. Only this file knows Kling's endpoints. Configured by KLING_ACCESS_KEY and
// KLING_SECRET_KEY on the server (KLING_API_BASE to change region); never called from the browser.
import { createHmac } from "node:crypto";
import type { GenerateRequest, GenerateResult, ProviderAdapter } from "../../types";
import { ProviderError } from "../../types";
import { b64, download, jsonOrThrow, poll } from "../../http";
import { promptFor } from "../../promptFor";

const DEFAULT_BASE = "https://api-singapore.klingai.com";
const RATIO: Record<string, string> = { "16:9": "16:9", "9:16": "9:16", "1:1": "1:1", "2.39:1": "16:9", "4:3": "16:9" };
const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

/** HS256 JWT as Kling specifies: issuer = access key, valid 30 minutes, 5 seconds of clock allowance. */
export function klingToken(access: string, secret: string, now = Math.floor(Date.now() / 1000)) {
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ iss: access, exp: now + 1800, nbf: now - 5 }));
  const sig = b64url(createHmac("sha256", secret).update(`${head}.${body}`).digest());
  return `${head}.${body}.${sig}`;
}

type Task = { code?: number; message?: string; data?: { task_id?: string; task_status?: string; task_status_msg?: string; task_result?: { videos?: { url?: string }[] } } };

export const klingAdapter: ProviderAdapter = {
  id: "kling",
  name: "Kling AI",
  capabilities: ["video"],
  models: [
    { id: "kling-v2-1-master", capability: "video", label: "Kling 2.1 Master" },
    { id: "kling-v2-1", capability: "video", label: "Kling 2.1 (from the approved frame)" },
    { id: "kling-v1-6", capability: "video", label: "Kling 1.6" },
  ],
  note: "Character-driven video from text or the approved frame. Needs KLING_ACCESS_KEY and KLING_SECRET_KEY on the server.",
  isConfigured: (env) => !!env.KLING_ACCESS_KEY && !!env.KLING_SECRET_KEY,
  async generate(req: GenerateRequest, env, opts = {}): Promise<GenerateResult> {
    if (!env.KLING_ACCESS_KEY || !env.KLING_SECRET_KEY) throw new ProviderError("Kling is not connected (no access and secret key on the server).");
    if (req.capability !== "video") throw new ProviderError("Kling makes video; choose an image provider for stills.");
    const f = opts.fetchImpl ?? fetch;
    const base = env.KLING_API_BASE || DEFAULT_BASE;
    const auth = () => ({ Authorization: `Bearer ${klingToken(env.KLING_ACCESS_KEY!, env.KLING_SECRET_KEY!)}`, "Content-Type": "application/json" });
    const kind = req.source_image ? "image2video" : "text2video";
    const body: Record<string, unknown> = {
      model_name: req.model, prompt: promptFor(req.package, req.capability, 2500), negative_prompt: req.package.negative.join(", ").slice(0, 2500),
      duration: (req.duration_seconds ?? 5) > 5 ? "10" : "5", mode: "pro", cfg_scale: 0.5,
      ...(req.source_image ? { image: b64(req.source_image.bytes) } : { aspect_ratio: RATIO[req.aspect_ratio] ?? "16:9" }),
    };
    const start = await f(`${base}/v1/videos/${kind}`, { method: "POST", headers: auth(), body: JSON.stringify(body), signal: opts.signal });
    const t = await jsonOrThrow<Task>(start, "Kling", (j) => j.message);
    if (t.code !== 0 || !t.data?.task_id) throw new ProviderError(`Kling refused the request: ${t.message ?? "no task id"}`);
    const id = t.data.task_id;
    const url = await poll<string>("Kling", id, opts, async () => {
      const r = await f(`${base}/v1/videos/${kind}/${id}`, { headers: auth(), signal: opts.signal });
      const s = (await r.json().catch(() => ({}))) as Task;
      if (s.data?.task_status === "succeed") { const u = s.data.task_result?.videos?.[0]?.url; return u ? { done: u } : { failed: "no video returned" }; }
      if (s.data?.task_status === "failed") return { failed: s.data.task_status_msg ?? "no reason given" };
      return {};
    }, 15);
    const got = await download(url, "Kling", id, "video/mp4", opts);
    return { ...got, provider_request_id: id, cost_usd: null };
  },
};
