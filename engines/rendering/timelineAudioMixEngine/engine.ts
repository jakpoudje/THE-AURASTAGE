// engines/rendering/timelineAudioMixEngine
// Renders one range of the locked cut's sound to stereo float PCM. Ranges let the render worker process long films in
// chunks with bounded memory. Every scene mix is rendered once (per stem) with the Audio Studio's full chain and
// reused by the chunks that overlap it.
import { studioMixRenderEngine } from "../../audio/studioMixRenderEngine";
import { SCENE_CACHE_SIZE } from "./rules";
import { TimelineAudioMixError } from "./validator";
import type { MixBus, Pcm, SceneMix, TimelineAudioEntry } from "./input.schema";

export interface MixRangeInput {
  fps: number;
  sample_rate: number;
  audio: TimelineAudioEntry[];
  mixes: Record<string, SceneMix>;
  pcm: Map<string, Pcm>;
  bus: MixBus;
}

const rendered = new WeakMap<MixRangeInput["mixes"], Map<string, [Float32Array, Float32Array]>>();
function sceneAudio(inp: MixRangeInput, id: string): [Float32Array, Float32Array] {
  let cache = rendered.get(inp.mixes);
  if (!cache) rendered.set(inp.mixes, (cache = new Map()));
  const key = `${id}|${inp.bus ?? "full"}|${inp.sample_rate}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const mix = inp.mixes[id];
  if (!mix) throw new TimelineAudioMixError(`Missing mix ${id}`);
  let out: [Float32Array, Float32Array];
  try {
    out = studioMixRenderEngine(mix, inp.pcm, inp.sample_rate, inp.bus);
  } catch (e) {
    throw new TimelineAudioMixError((e as Error).message);
  }
  cache.set(key, out);
  while (cache.size > SCENE_CACHE_SIZE) cache.delete(cache.keys().next().value!);
  return out;
}

/** Mixes timeline samples [start, start+length) into two new Float32Arrays (L, R). */
export function timelineAudioMixEngine(inp: MixRangeInput, start: number, length: number): [Float32Array, Float32Array] {
  const { fps, sample_rate: sr, audio } = inp;
  const L = new Float32Array(length), R = new Float32Array(length);
  const spf = sr / fps;
  if (!Number.isInteger(spf)) throw new TimelineAudioMixError(`Sample rate ${sr} is not a whole number of samples per frame at ${fps} fps`);
  for (const a of audio) {
    const T0 = a.record_in * spf, T1 = (a.record_in + a.duration) * spf, S0 = a.source_in * spf;
    const lo = Math.max(T0, start), hi = Math.min(T1, start + length);
    if (hi <= lo) continue;
    const [sl, sr2] = sceneAudio(inp, a.mix_version_id);
    for (let tl = lo; tl < hi; tl++) {
      const s = tl - T0 + S0;
      if (s < 0 || s >= sl.length) continue;
      L[tl - start] += sl[s];
      R[tl - start] += sr2[s];
    }
  }
  return [L, R];
}
