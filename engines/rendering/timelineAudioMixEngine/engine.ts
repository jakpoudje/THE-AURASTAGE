// engines/rendering/timelineAudioMixEngine
// Renders one range of the locked cut's sound to stereo float PCM. Ranges let the render worker process long films in
// chunks with bounded memory. Every scene mix is rendered once (per stem) with the Audio Studio's full chain and
// reused by the chunks that overlap it.
import type { AutomationPoint } from "@aurastage/contracts";
import { studioMixRenderEngine } from "../../audio/studioMixRenderEngine";
import { automationDbAt } from "../../editorial/timelineAutomationEngine";
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
  /** Volume automation drawn on the timeline (A1), applied to the whole cut's sound (every stem alike). */
  automation?: AutomationPoint[];
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
  applyAutomation(inp.automation ?? [], spf, start, L, R);
  return [L, R];
}

/** Multiplies the range by the timeline automation (straight lines in dB between points, frames → samples). */
function applyAutomation(points: AutomationPoint[], spf: number, start: number, L: Float32Array, R: Float32Array) {
  if (!points.length) return;
  // Walk the segments once per range (same result as automationDbAt at every sample, without a search per sample).
  let seg = 0;
  for (let o = 0; o < L.length; o++) {
    const f = (start + o) / spf;
    while (seg < points.length && points[seg].frame < f) seg++;
    const db = seg === 0 ? points[0].db : seg === points.length ? points[points.length - 1].db
      : points[seg - 1].db + ((points[seg].db - points[seg - 1].db) * (f - points[seg - 1].frame)) / (points[seg].frame - points[seg - 1].frame);
    if (db !== 0) {
      const g = Math.pow(10, db / 20);
      L[o] *= g; R[o] *= g;
    }
  }
}
