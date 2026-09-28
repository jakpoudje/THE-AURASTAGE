// workers/image-worker/src/worker.ts
// Generation worker (CLAUDE.md rule 8): claims queued Takes through the MOS
// functions in migration 0013, calls the Provider Gateway (rule 7), stores the
// result in the private media bucket and records success or failure. Each step
// is idempotent: completing twice is a no-op, a crashed claim is re-queued by
// the database after 15 minutes (max 3 attempts).
import type { AspectRatio, GenerationPackageContent, ProviderCapability } from "@aurastage/contracts";

export interface Claim {
  take: {
    id: string; org_id: string; project_id: string; shot_id: string; provider: string; model: string;
    capability: ProviderCapability; params: { aspect_ratio?: AspectRatio; duration_seconds?: number | null }; seed: number | null;
  };
  package: GenerationPackageContent;
  source: { storage_key: string; media_type: string } | null;
}

export interface WorkerDeps {
  claim(): Promise<Claim | null>;
  complete(takeId: string, storageKey: string, mediaType: string, requestId: string | null, cost: number | null): Promise<void>;
  fail(takeId: string, error: string, requestId: string | null): Promise<void>;
  gateway: {
    getAdapter(id: string):
      | { generate(req: any, env: Record<string, string | undefined>): Promise<{ bytes: Uint8Array; media_type: string; provider_request_id: string | null; cost_usd: number | null }> }
      | undefined;
  };
  storage: {
    put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
    get(key: string): Promise<{ bytes: Uint8Array; contentType: string }>;
    keyFor(t: Claim["take"], mediaType: string): string;
  };
  env: Record<string, string | undefined>;
  log(event: string, data: Record<string, unknown>): void;
}

/** Processes at most one take. Returns true if a take was handled. */
export async function runOnce(d: WorkerDeps): Promise<boolean> {
  const claim = await d.claim();
  if (!claim) return false;
  const t = claim.take;
  d.log("take.claimed", { take_id: t.id, provider: t.provider, model: t.model, capability: t.capability });
  try {
    const adapter = d.gateway.getAdapter(t.provider);
    if (!adapter) throw Object.assign(new Error(`Unknown provider ${t.provider}`), { provider_request_id: null });
    const source = claim.source?.storage_key ? await d.storage.get(claim.source.storage_key) : null;
    const result = await adapter.generate(
      {
        capability: t.capability,
        model: t.model,
        package: claim.package,
        aspect_ratio: t.params.aspect_ratio ?? claim.package.technical.aspect_ratio,
        duration_seconds: t.params.duration_seconds ?? null,
        seed: t.seed === null ? null : Number(t.seed),
        source_image: source ? { bytes: source.bytes, media_type: source.contentType } : null,
      },
      d.env
    );
    const key = d.storage.keyFor(t, result.media_type);
    await d.storage.put(key, result.bytes, result.media_type);
    await d.complete(t.id, key, result.media_type, result.provider_request_id, result.cost_usd);
    d.log("take.succeeded", { take_id: t.id, bytes: result.bytes.length, media_type: result.media_type, request_id: result.provider_request_id });
  } catch (e) {
    const err = e as Error & { provider_request_id?: string | null };
    await d.fail(t.id, err.message || "Generation failed", err.provider_request_id ?? null);
    d.log("take.failed", { take_id: t.id, error: err.message });
  }
  return true;
}
