// apps/api/src/providers/audio/index.ts — sound side of the Provider Gateway (CLAUDE.md rule 7).
import { aurastageSynthAdapter } from "./synth/aurastageSynthAdapter";
import { aurastageVoiceAdapter } from "./voice/aurastageVoiceAdapter";
import { aurastageNeuralVoiceAdapter } from "./neural/aurastageNeuralVoiceAdapter";
import { elevenLabsAdapter } from "./elevenlabs/elevenLabsAdapter";
import { kokoroVoiceAdapter } from "./kokoro/kokoroVoiceAdapter";
import { accentFor } from "./neural/voices";
import type { AudioAdapter, AudioKind } from "./types";

export * from "./types";
// Order matters: the first configured backend for a kind is the default (the natural Kokoro voice, then the Piper
// neural voice, then the robotic one).
// Paid providers come last, so they are used only when a person chooses them (nothing spends money by default).
const ADAPTERS: AudioAdapter[] = [aurastageSynthAdapter, kokoroVoiceAdapter, aurastageNeuralVoiceAdapter, aurastageVoiceAdapter, elevenLabsAdapter];

export const getAudioAdapter = (id: string) => ADAPTERS.find((a) => a.id === id);
/** Backends that can make this kind of sound on this server right now (never one without the capability or its key). */
export const audioBackendsFor = (kind: AudioKind, env: Record<string, string | undefined>) => ADAPTERS.filter((a) => a.kinds.includes(kind) && a.isConfigured(env));
/**
 * The default voice for a character: the natural Kokoro voice, except where the character's Casting accent is one the
 * Piper corpora speak specifically (Scottish, Northern English, Canadian, Indian) and Kokoro doesn't — then Piper's
 * measured voice for that accent is used, so an accent the platform CAN speak is never flattened.
 */
export function defaultVoiceBackend(accentText: string | null, env: Record<string, string | undefined>) {
  const list = audioBackendsFor("voice", env);
  const acc = accentFor(accentText);
  if (acc && PIPER_ONLY_ACCENTS.has(acc.id)) return list.find((a) => a.id === aurastageNeuralVoiceAdapter.id) ?? list[0];
  return list[0];
}
const PIPER_ONLY_ACCENTS = new Set(["scottish", "northern_english", "canadian", "south_asian"]);

export function audioStatuses(env: Record<string, string | undefined>) {
  return ADAPTERS.map((a) => ({ id: a.id, name: a.name, execution: a.execution, kinds: a.kinds, models: a.models, state: a.isConfigured(env) ? "configured" : "not_configured", note: a.note }));
}
export { aurastageSynthAdapter, aurastageVoiceAdapter, aurastageNeuralVoiceAdapter, elevenLabsAdapter, kokoroVoiceAdapter };
export { accentLabel, deliverySettings } from "./elevenlabs/elevenLabsAdapter";
