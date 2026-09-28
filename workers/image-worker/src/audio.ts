// Audio generation jobs (migration 0026). Claims a request, asks the Provider Gateway's audio adapter for the sound
// (rule 7) — AuraStage's built-in synthesiser or a paid provider — stores the file privately and hands it to the
// Assets domain through worker_complete_audio_generation. Idempotent like the take loop.
import { createHash, randomUUID } from "node:crypto";

export interface AudioClaim {
  id: string; org_id: string; project_id: string; kind: "ambience" | "fx" | "foley" | "score" | "voice"; description: string;
  duration_seconds: number | string; mood: string[]; provider: string; model: string; seed: number; params: Record<string, unknown>;
}
interface Adapter {
  generate(req: { kind: AudioClaim["kind"]; model: string; description: string; duration_seconds: number; mood: string[]; seed: number; params: Record<string, unknown> }, env: Record<string, string | undefined>):
    Promise<{ bytes: Uint8Array; media_type: string; duration_seconds: number; sample_rate: number | null; channels: number | null; detail: Record<string, unknown>; provider_request_id: string | null; cost_usd: number | null }>;
}
export interface AudioDeps {
  claim(): Promise<AudioClaim | null>;
  complete(id: string, key: string, checksum: string, metadata: Record<string, unknown>, result: Record<string, unknown>, requestId: string | null, cost: number | null): Promise<string>;
  fail(id: string, error: string, requestId: string | null): Promise<void>;
  getAudioAdapter(id: string): Adapter | undefined;
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  env: Record<string, string | undefined>;
  log(event: string, data: Record<string, unknown>): void;
}

const EXT: Record<string, string> = { "audio/wav": "wav", "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/flac": "flac" };

export async function audioOnce(d: AudioDeps): Promise<boolean> {
  const g = await d.claim();
  if (!g) return false;
  d.log("audio.claimed", { id: g.id, kind: g.kind, provider: g.provider });
  const t = Date.now();
  try {
    const adapter = d.getAudioAdapter(g.provider);
    if (!adapter) throw new Error(`Unknown sound provider ${g.provider}`);
    const r = await adapter.generate({ kind: g.kind, model: g.model, description: g.description, duration_seconds: Number(g.duration_seconds), mood: g.mood ?? [], seed: g.seed, params: g.params ?? {} }, d.env);
    const key = `${g.org_id}/${g.project_id}/assets/${randomUUID()}.${EXT[r.media_type] ?? "bin"}`;
    await d.put(key, r.bytes, r.media_type);
    const checksum = createHash("sha256").update(r.bytes).digest("hex");
    const meta = { media_type: r.media_type, size_bytes: r.bytes.length, duration_seconds: Math.round(r.duration_seconds * 1000) / 1000, sample_rate: r.sample_rate, channels: r.channels };
    const asset = await d.complete(g.id, key, checksum, meta, { ...r.detail, ms: Date.now() - t }, r.provider_request_id, r.cost_usd);
    d.log("audio.succeeded", { id: g.id, asset_id: asset, bytes: r.bytes.length, ms: Date.now() - t });
  } catch (e) {
    const err = e as Error & { provider_request_id?: string | null };
    await d.fail(g.id, err.message, err.provider_request_id ?? null);
    d.log("audio.failed", { id: g.id, error: err.message });
  }
  return true;
}
