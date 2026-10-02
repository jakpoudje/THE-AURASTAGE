// apps/api/src/providers/video/runway/runwayAdapter.ts
// Runway API adapter (images: gen4_image; video: gen4_turbo from a start frame).
// Only this file knows Runway's endpoints, headers and task states. Configured
// by RUNWAY_API_KEY on the server; never called from the browser.
import type { GenerateRequest, GenerateResult, ProviderAdapter, ReferenceImage } from "../../types";
import { ProviderError } from "../../types";
import { describeReferences } from "../../references";
import { avoid, framedPrompt } from "../../promptFor";

const BASE = "https://api.dev.runwayml.com/v1";
const VERSION = "2024-11-06";
const IMAGE_RATIO: Record<string, string> = { "16:9": "1920:1080", "9:16": "1080:1920", "1:1": "1024:1024", "2.39:1": "2112:912", "4:3": "1440:1080" };
const VIDEO_RATIO: Record<string, string> = { "16:9": "1280:720", "9:16": "720:1280", "1:1": "960:960", "2.39:1": "1584:672", "4:3": "1104:832" };

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((res, rej) => {
    const t = setTimeout(res, ms);
    signal?.addEventListener("abort", () => (clearTimeout(t), rej(new ProviderError("Cancelled"))));
  });

/** Runway reference tags: 3–16 letters/digits/underscores, starting with a letter; the prompt names them as @tag. */
export function runwayTags(refs: Pick<ReferenceImage, "kind">[]) {
  const n: Record<string, number> = {};
  return refs.map((r) => {
    const base = r.kind === "character" ? "char" : r.kind === "location" ? "place" : "prop";
    n[base] = (n[base] ?? 0) + 1;
    return base === "place" && n[base] === 1 ? "place" : `${base}${n[base]}`;
  });
}

/** Runway accepts at most 1000 characters of prompt text; the reference sentence is kept, the prompt is trimmed. */
export function runwayPrompt(req: GenerateRequest) {
  const p = req.package;
  const refs = req.capability === "image" ? (req.reference_images ?? []) : [];
  const tags = runwayTags(refs);
  const lead = describeReferences(refs, (i) => `@${tags[i]}`);
  return framedPrompt(p, req.capability, 1000, lead, avoid(p));
}

export const runwayAdapter: ProviderAdapter = {
  id: "runway",
  name: "Runway",
  capabilities: ["image", "video"],
  models: [
    { id: "gen4_image", capability: "image", label: "Gen-4 Image" },
    { id: "gen4_turbo", capability: "video", label: "Gen-4 Turbo (video from an approved frame)" },
  ],
  note: "Cinematic stills (with up to 3 reference images: characters, location, props) and image-to-video. Needs RUNWAY_API_KEY on the server.",
  // Gen-4 Image conditions on up to 3 tagged references (data URIs up to ~5 MB encoded).
  references: { image: { max: 3, media_types: ["image/png", "image/jpeg", "image/webp"], max_bytes: 3_500_000 } },
  isConfigured: (env) => !!env.RUNWAY_API_KEY,
  videoNeedsFrame: true,
  async generate(req, env, opts = {}): Promise<GenerateResult> {
    const key = env.RUNWAY_API_KEY;
    if (!key) throw new ProviderError("Runway is not connected (no API key on the server).");
    const f = opts.fetchImpl ?? fetch;
    const headers = { Authorization: `Bearer ${key}`, "X-Runway-Version": VERSION, "Content-Type": "application/json" };
    let body: Record<string, unknown>;
    let path: string;
    if (req.capability === "image") {
      path = "/text_to_image";
      const refs = (req.reference_images ?? []).slice(0, 3);
      const tags = runwayTags(refs);
      body = {
        model: req.model, promptText: runwayPrompt({ ...req, reference_images: refs }), ratio: IMAGE_RATIO[req.aspect_ratio] ?? "1920:1080",
        ...(refs.length ? { referenceImages: refs.map((r, i) => ({ uri: `data:${r.media_type};base64,${Buffer.from(r.bytes).toString("base64")}`, tag: tags[i] })) } : {}),
        ...(req.seed !== null ? { seed: req.seed } : {}),
      };
    } else {
      if (!req.source_image) throw new ProviderError("Runway video starts from a finished frame — generate and pick an image take first.");
      path = "/image_to_video";
      const b64 = Buffer.from(req.source_image.bytes).toString("base64");
      body = {
        model: req.model,
        promptImage: `data:${req.source_image.media_type};base64,${b64}`,
        promptText: runwayPrompt(req),
        ratio: VIDEO_RATIO[req.aspect_ratio] ?? "1280:720",
        duration: (req.duration_seconds ?? 5) > 5 ? 10 : 5,
        ...(req.seed !== null ? { seed: req.seed } : {}),
      };
    }
    const start = await f(BASE + path, { method: "POST", headers, body: JSON.stringify(body), signal: opts.signal });
    const started = (await start.json().catch(() => ({}))) as { id?: string; error?: string };
    if (!start.ok || !started.id) throw new ProviderError(`Runway refused the request (${start.status}): ${started.error ?? "no task id"}`, null, start.status === 429 || start.status >= 500);
    const id = started.id;
    const deadline = Date.now() + 10 * 60_000;
    for (;;) {
      await sleep(opts.pollMs ?? 5000, opts.signal);
      const r = await f(`${BASE}/tasks/${id}`, { headers, signal: opts.signal });
      const task = (await r.json().catch(() => ({}))) as { status?: string; output?: string[]; failure?: string };
      if (task.status === "SUCCEEDED" && task.output?.[0]) {
        const media = await f(task.output[0], { signal: opts.signal });
        if (!media.ok) throw new ProviderError(`Could not download the Runway result (${media.status})`, id, true);
        return {
          bytes: new Uint8Array(await media.arrayBuffer()),
          media_type: media.headers.get("content-type") ?? (req.capability === "video" ? "video/mp4" : "image/png"),
          provider_request_id: id,
          cost_usd: null,
        };
      }
      if (task.status === "FAILED" || task.status === "CANCELLED") throw new ProviderError(`Runway ${task.status.toLowerCase()}: ${task.failure ?? "no reason given"}`, id);
      if (Date.now() > deadline) throw new ProviderError("Runway took longer than 10 minutes", id, true);
    }
  },
};
