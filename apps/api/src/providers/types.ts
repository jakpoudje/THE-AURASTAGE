// apps/api/src/providers/types.ts
// The provider-neutral contract every adapter implements (SRS §10, §17.2).
// Domain services and workers depend on THIS interface, never on a vendor SDK.
import type { AspectRatio, GenerationPackageContent, ProviderCapability, ProviderId } from "@aurastage/contracts";

export interface ProviderModel {
  id: string;
  capability: ProviderCapability;
  label: string;
}

export interface GenerateRequest {
  capability: ProviderCapability;
  model: string;
  package: GenerationPackageContent;
  aspect_ratio: AspectRatio;
  duration_seconds: number | null;
  seed: number | null;
  /** For video: the starting frame (image bytes) from an earlier take. */
  source_image?: { bytes: Uint8Array; media_type: string } | null;
}

export interface GenerateResult {
  bytes: Uint8Array;
  media_type: string;
  provider_request_id: string | null;
  /** Actual cost in USD when the provider reports it; null when unknown (never guessed). */
  cost_usd: number | null;
}

export class ProviderError extends Error {
  code = "AURA-GEN-502";
  constructor(message: string, public provider_request_id: string | null = null, public retryable = false) {
    super(message);
  }
}

export interface ProviderAdapter {
  id: ProviderId;
  name: string;
  capabilities: ProviderCapability[];
  models: ProviderModel[];
  /** Credentials present on this server (never calls out, never guesses health). */
  isConfigured(env: Record<string, string | undefined>): boolean;
  note: string;
  generate(req: GenerateRequest, env: Record<string, string | undefined>, opts?: { signal?: AbortSignal; fetchImpl?: typeof fetch; pollMs?: number }): Promise<GenerateResult>;
}
