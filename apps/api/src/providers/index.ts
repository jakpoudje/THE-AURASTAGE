// apps/api/src/providers/index.ts — the Provider Gateway registry (CLAUDE.md rule 7).
// Everything outside this folder asks the registry for an adapter by id.
import type { ProviderId, ProviderStatus } from "@aurastage/contracts";
import { sketchAdapter } from "./sketch/sketchAdapter";
import { runwayAdapter } from "./video/runway/runwayAdapter";
import { openaiImageAdapter } from "./image/openai/openaiImageAdapter";
import type { ProviderAdapter } from "./types";

export * from "./types";
export * from "./reasoning";
export { renderSketch } from "./sketch/sketchAdapter";

const ADAPTERS: ProviderAdapter[] = [sketchAdapter, runwayAdapter, openaiImageAdapter];

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
  }));
}
