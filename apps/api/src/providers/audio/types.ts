// apps/api/src/providers/audio/types.ts — the provider-neutral contract for sound generation (ambience, effects,
// Foley, score, voice). Audio Studio and the worker depend on THIS, never on a vendor SDK (CLAUDE.md rule 7).
export const AUDIO_KINDS = ["ambience", "fx", "foley", "score", "voice"] as const;
export type AudioKind = (typeof AUDIO_KINDS)[number];

export interface AudioGenerateRequest {
  kind: AudioKind;
  model: string;
  /** The cue in words (from the spotting engine / Scene DNA, edited by the person). */
  description: string;
  duration_seconds: number;
  mood: string[];
  seed: number;
  params: Record<string, unknown>;
}

export interface AudioGenerateResult {
  bytes: Uint8Array;
  media_type: string;
  duration_seconds: number;
  sample_rate: number | null;
  channels: number | null;
  /** What the backend reports it made (layers, voice…), shown as the "why" next to the file. */
  detail: Record<string, unknown>;
  provider_request_id: string | null;
  /** Actual cost in USD when reported; null when unknown (never guessed). 0 for built-in. */
  cost_usd: number | null;
}

export interface AudioAdapter {
  id: string;
  name: string;
  /** native = runs inside AuraStage (free); external = a paid provider. */
  execution: "native" | "local" | "external" | "test";
  kinds: AudioKind[];
  models: { id: string; kinds: AudioKind[]; label: string }[];
  isConfigured(env: Record<string, string | undefined>): boolean;
  note: string;
  generate(req: AudioGenerateRequest, env: Record<string, string | undefined>, opts?: { fetchImpl?: typeof fetch; signal?: AbortSignal }): Promise<AudioGenerateResult>;
}
