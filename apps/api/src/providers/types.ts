// apps/api/src/providers/types.ts
// The provider-neutral contract every adapter implements (SRS §10, §17.2).
// Domain services and workers depend on THIS interface, never on a vendor SDK.
import type { AspectRatio, GenerationPackageContent, ProviderCapability, ProviderId } from "@aurastage/contracts";
import type { Appearance } from "@aurastage/engines";

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
  /**
   * Reference images the provider conditions on (characters in frame, the location, props), already chosen for this
   * adapter by `chooseReferences` — only adapters that declare `references` receive any.
   */
  reference_images?: ReferenceImage[];
}

export interface ReferenceImage {
  kind: "character" | "location" | "prop";
  name: string;
  view: string;
  bytes: Uint8Array;
  media_type: string;
}

/** What an adapter accepts as reference images, per capability. Absent = it can't use any (they are not sent). */
export interface ReferenceSupport {
  max: number;
  media_types: string[];
  max_bytes: number;
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

/** A still image from a prompt alone (character / location references). Adapters that can't do it leave it out. */
export interface StillRequest {
  model: string;
  prompt: string;
  negative: string[];
  aspect_ratio: AspectRatio;
  seed: number | null;
  /** Hints for the built-in sketch renderer (it can't read prompts): what to draw and what to write on it. */
  sketch?:
    | { kind?: "character"; title: string; subtitle: string; angle: "front" | "three_quarter" | "profile" | "back"; size: "CU" | "MCU" | "MS" | "FULL"; lines: string[];
        /** What AuraSketch draws (characterAppearanceEngine); older requests without it are read from `lines`. */
        appearance?: Appearance }
    | { kind: "location"; title: string; subtitle: string; view: string; time: string | null; int_ext: string[]; lines: string[] }
    | { kind: "prop"; title: string; subtitle: string; view: string; category: "prop" | "vehicle"; lines: string[] };
}

export interface ProviderAdapter {
  id: ProviderId;
  name: string;
  capabilities: ProviderCapability[];
  models: ProviderModel[];
  /** Credentials present on this server (never calls out, never guesses health). */
  isConfigured(env: Record<string, string | undefined>): boolean;
  note: string;
  references?: Partial<Record<ProviderCapability, ReferenceSupport>>;
  generate(req: GenerateRequest, env: Record<string, string | undefined>, opts?: { signal?: AbortSignal; fetchImpl?: typeof fetch; pollMs?: number }): Promise<GenerateResult>;
  generateStill?(req: StillRequest, env: Record<string, string | undefined>, opts?: { signal?: AbortSignal; fetchImpl?: typeof fetch }): Promise<GenerateResult>;
}
