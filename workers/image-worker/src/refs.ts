// Character reference views (migration 0027). Claims a request, asks the Provider Gateway's image adapter for a still
// from the prompt (rule 7) — the built-in sketch or a connected provider — stores it privately and hands it to the
// Assets domain through worker_complete_character_reference. Idempotent like the take loop.
import { createHash, randomUUID } from "node:crypto";

export interface RefClaim {
  id: string; org_id: string; project_id: string; character_id: string; angle: string; size: string; aspect_ratio: "1:1" | "9:16";
  prompt: string; negative: string[]; provider: string; model: string; seed: number; sketch: Record<string, unknown>;
}
interface StillAdapter {
  generateStill?(req: { model: string; prompt: string; negative: string[]; aspect_ratio: any; seed: number | null; sketch?: any }, env: Record<string, string | undefined>):
    Promise<{ bytes: Uint8Array; media_type: string; provider_request_id: string | null; cost_usd: number | null }>;
}
export interface RefDeps {
  claim(): Promise<RefClaim | null>;
  complete(id: string, key: string, checksum: string, metadata: Record<string, unknown>, requestId: string | null, cost: number | null): Promise<string>;
  fail(id: string, error: string, requestId: string | null): Promise<void>;
  getAdapter(id: string): StillAdapter | undefined;
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  env: Record<string, string | undefined>;
  log(event: string, data: Record<string, unknown>): void;
}
const EXT: Record<string, string> = { "image/svg+xml": "svg", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export async function refOnce(d: RefDeps): Promise<boolean> {
  const g = await d.claim();
  if (!g) return false;
  const t = Date.now();
  try {
    const a = d.getAdapter(g.provider);
    if (!a?.generateStill) throw new Error(`${g.provider} can't make reference images`);
    const r = await a.generateStill({ model: g.model, prompt: g.prompt, negative: g.negative ?? [], aspect_ratio: g.aspect_ratio, seed: g.seed, sketch: g.sketch }, d.env);
    const key = `${g.org_id}/${g.project_id}/assets/${randomUUID()}.${EXT[r.media_type] ?? "bin"}`;
    await d.put(key, r.bytes, r.media_type);
    const [w, h] = g.aspect_ratio === "9:16" ? [720, 1280] : [1024, 1024];
    const asset = await d.complete(g.id, key, createHash("sha256").update(r.bytes).digest("hex"),
      { media_type: r.media_type, size_bytes: r.bytes.length, ...(r.media_type === "image/svg+xml" ? { width: w, height: h } : {}) }, r.provider_request_id, r.cost_usd);
    d.log("ref.succeeded", { id: g.id, asset_id: asset, view: `${g.angle}:${g.size}`, ms: Date.now() - t });
  } catch (e) {
    const err = e as Error & { provider_request_id?: string | null };
    await d.fail(g.id, err.message, err.provider_request_id ?? null);
    d.log("ref.failed", { id: g.id, error: err.message });
  }
  return true;
}
