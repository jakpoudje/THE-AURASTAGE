// engines/rendering/timelineAudioMixEngine
// Renders one range of the locked cut's sound to stereo float PCM. Ranges let
// the render worker process long films in chunks with bounded memory.
import { FAMILY_BUS } from "@aurastage/contracts";
import { dbToGain } from "./rules";
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

function audible(tracks: SceneMix["tracks"], bus: MixBus) {
  const solo = tracks.some((t) => t.solo);
  return new Map(
    tracks
      .filter((t) => !t.mute && (!solo || t.solo))
      .filter((t) => bus === null || (bus === "ME" ? FAMILY_BUS[t.family] !== "DX" : FAMILY_BUS[t.family] === bus))
      .map((t) => [t.id, t])
  );
}

/** Web Audio StereoPannerNode gains (equal-power), per the spec. */
function panGains(pan: number, stereoInput: boolean) {
  const p = Math.max(-1, Math.min(1, pan));
  if (!stereoInput) {
    const x = ((p + 1) / 2) * (Math.PI / 2);
    return { mono: true as const, l: Math.cos(x), r: Math.sin(x) };
  }
  const x = (p <= 0 ? p + 1 : p) * (Math.PI / 2);
  return { mono: false as const, left: p <= 0, gl: Math.cos(x), gr: Math.sin(x) };
}

/** Mixes timeline samples [start, start+length) into two new Float32Arrays (L, R). */
export function timelineAudioMixEngine(inp: MixRangeInput, start: number, length: number): [Float32Array, Float32Array] {
  const { fps, sample_rate: sr, audio, mixes, pcm, bus } = inp;
  const L = new Float32Array(length), R = new Float32Array(length);
  const spf = sr / fps;
  if (!Number.isInteger(spf)) throw new TimelineAudioMixError(`Sample rate ${sr} is not a whole number of samples per frame at ${fps} fps`);
  for (const a of audio) {
    const mix = mixes[a.mix_version_id];
    if (!mix) throw new TimelineAudioMixError(`Missing mix ${a.mix_version_id}`);
    const T0 = a.record_in * spf, T1 = (a.record_in + a.duration) * spf, S0 = a.source_in * spf, SL = Math.ceil(mix.seconds * sr);
    // Timeline range covered by this A1 clip AND this chunk.
    const lo = Math.max(T0, start), hi = Math.min(T1, start + length);
    if (hi <= lo) continue;
    const tracks = audible(mix.tracks, bus);
    for (const c of mix.clips) {
      const t = tracks.get(c.track_id);
      if (!t) continue;
      const buf = pcm.get(c.asset_id);
      if (!buf) throw new TimelineAudioMixError(`Missing recording ${c.asset_id}`);
      const bufLen = buf.channels[0].length;
      const cs = Math.round(c.start_seconds * sr), off = Math.round(c.offset_seconds * sr);
      const n = Math.min(Math.round(c.duration_seconds * sr), bufLen - off);
      if (n <= 0) continue;
      const fi = Math.round(c.fade_in_seconds * sr), fo = Math.round(c.fade_out_seconds * sr), dur = Math.round(c.duration_seconds * sr);
      const level = dbToGain(c.gain_db) * dbToGain(t.gain_db);
      const pg = panGains(t.pan, buf.channels.length > 1);
      const in0 = buf.channels[0], in1 = buf.channels[1] ?? buf.channels[0];
      // Scene samples of this clip, limited to the scene length, mapped to timeline samples.
      const sFrom = Math.max(cs, 0), sTo = Math.min(cs + n, SL);
      const tFrom = Math.max(lo, T0 + (sFrom - S0)), tTo = Math.min(hi, T0 + (sTo - S0));
      for (let tl = tFrom; tl < tTo; tl++) {
        const s = tl - T0 + S0, tau = s - cs, k = off + tau;
        let g = level;
        if (fi > 0 && tau < fi) g *= tau / fi;
        if (fo > 0 && tau > dur - fo) g *= Math.max(0, dur - tau) / fo;
        const o = tl - start;
        if (pg.mono) {
          const v = in0[k] * g;
          L[o] += v * pg.l;
          R[o] += v * pg.r;
        } else {
          const vl = in0[k] * g, vr = in1[k] * g;
          if (pg.left) (L[o] += vl + vr * pg.gl), (R[o] += vr * pg.gr);
          else (L[o] += vl * pg.gl), (R[o] += vr + vl * pg.gr);
        }
      }
    }
  }
  return [L, R];
}
