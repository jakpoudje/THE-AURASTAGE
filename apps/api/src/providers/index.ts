// apps/api/src/providers/index.ts — the Provider Gateway registry (CLAUDE.md rule 7).
// Everything outside this folder asks the registry for an adapter by id.
import type { ProviderId, ProviderStatus } from "@aurastage/contracts";
import { sketchAdapter } from "./sketch/sketchAdapter";
import { runwayAdapter } from "./video/runway/runwayAdapter";
import { openaiImageAdapter } from "./image/openai/openaiImageAdapter";
import { stabilityAdapter } from "./image/stability/stabilityAdapter";
import { bflAdapter } from "./image/bfl/bflAdapter";
import { googleAdapter } from "./google/googleAdapter";
import { lumaAdapter } from "./video/luma/lumaAdapter";
import { klingAdapter } from "./video/kling/klingAdapter";
import { minimaxAdapter } from "./video/minimax/minimaxAdapter";
import type { ProviderAdapter } from "./types";

export * from "./types";
export * from "./reasoning";
export * from "./audio";
export * from "./references";
export { renderSketch } from "./sketch/sketchAdapter";

const ADAPTERS: ProviderAdapter[] = [sketchAdapter, runwayAdapter, openaiImageAdapter, googleAdapter, stabilityAdapter, bflAdapter, lumaAdapter, klingAdapter, minimaxAdapter];

export function getAdapter(id: ProviderId | string): ProviderAdapter | undefined {
  return ADAPTERS.find((a) => a.id === id);
}

/** Status from evidence only: configured-ness from the server env + the last real take result. */
export function providerStatuses(
  env: Record<string, string | undefined>,
  lastResults: Partial<Record<ProviderId, ProviderStatus["last_result"]>> = {}
): ProviderStatus[] {
  return ADAPTERS.map((a) => ({
    id: a.id,
    name: a.name,
    capabilities: a.capabilities,
    state: a.isConfigured(env) ? "configured" : "not_configured",
    last_result: lastResults[a.id] ?? null,
    note: a.note,
    models: a.models,
    video_needs_frame: !!a.videoNeedsFrame,
  }));
}

/** Image backends that can make a still from a prompt (character / location references) and are configured here. */
export function stillBackends(env: Record<string, string | undefined>) {
  return ADAPTERS.filter((a) => a.generateStill && a.isConfigured(env)).map((a) => ({
    id: a.id, name: a.name, model: a.models.find((m) => m.capability === "image")?.id ?? a.models[0].id, execution: a.id === "aurastage-sketch" ? ("native" as const) : ("external" as const), note: a.note,
  }));
}
/** Every image backend that could make references, configured or not (for an honest list). */
export function stillBackendStatuses(env: Record<string, string | undefined>) {
  return ADAPTERS.filter((a) => a.generateStill).map((a) => ({ id: a.id, name: a.name, state: a.isConfigured(env) ? "configured" : "not_configured", note: a.note }));
}
