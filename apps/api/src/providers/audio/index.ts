// apps/api/src/providers/audio/index.ts — sound side of the Provider Gateway (CLAUDE.md rule 7).
import { aurastageSynthAdapter } from "./synth/aurastageSynthAdapter";
import { aurastageVoiceAdapter } from "./voice/aurastageVoiceAdapter";
import type { AudioAdapter, AudioKind } from "./types";

export * from "./types";
const ADAPTERS: AudioAdapter[] = [aurastageSynthAdapter, aurastageVoiceAdapter];

export const getAudioAdapter = (id: string) => ADAPTERS.find((a) => a.id === id);
/** Backends that can make this kind of sound on this server right now (never one without the capability or its key). */
export const audioBackendsFor = (kind: AudioKind, env: Record<string, string | undefined>) => ADAPTERS.filter((a) => a.kinds.includes(kind) && a.isConfigured(env));
export function audioStatuses(env: Record<string, string | undefined>) {
  return ADAPTERS.map((a) => ({ id: a.id, name: a.name, execution: a.execution, kinds: a.kinds, models: a.models, state: a.isConfigured(env) ? "configured" : "not_configured", note: a.note }));
}
export { aurastageSynthAdapter, aurastageVoiceAdapter };
