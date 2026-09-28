// AuraStage built-in sound (native, free): proceduralAudioEngine synthesises ambience, effects, Foley and score from the
// cue's words. It is labelled for what it is — synthesised sound for timing, mixing and testing — never presented as a
// recording or as AI.
import { proceduralAudio, assetEdit } from "@aurastage/engines";
import { ProviderError } from "../../types";
import type { AudioAdapter } from "../types";

export const aurastageSynthAdapter: AudioAdapter = {
  id: "aurastage-synth",
  name: "AuraStage built-in sound",
  execution: "native",
  kinds: ["ambience", "fx", "foley", "score"],
  models: [{ id: "synth-1", kinds: ["ambience", "fx", "foley", "score"], label: `Procedural synthesis ${proceduralAudio.ENGINE_VERSION}` }],
  isConfigured: () => true,
  note: "Synthesised on AuraStage's own servers — free, instant, placeholder quality. Good for timing and testing; replace with recordings or a provider for final sound.",
  async generate(req) {
    if (req.kind === "voice") throw new ProviderError("The built-in synthesiser doesn't make voices.");
    const out = proceduralAudio.proceduralAudioEngine({ kind: req.kind, description: req.description, duration_seconds: req.duration_seconds, mood: req.mood, seed: req.seed });
    return {
      bytes: assetEdit.encodeWav16(out.sample_rate, out.channels),
      media_type: "audio/wav",
      duration_seconds: out.duration_seconds,
      sample_rate: out.sample_rate,
      channels: 2,
      detail: { layers: out.layers, engine_version: out.engine_version, peak_db: out.peak_db },
      provider_request_id: null,
      cost_usd: 0,
    };
  },
};
