"use client";

// Browser mix engine (Web Audio). The SAME graph is used for live playback and
// for offline rendering, so what you hear is what gets measured (BS.1770-4 via
// engines/audio/loudnessMeterEngine) and exported. Only real recordings make
// sound; planned cues are silent by definition.

import type { AudioClip, AudioTrack, SessionMix, TrackFx } from "@aurastage/contracts";
import { FAMILY_BUS, NEUTRAL_SESSION_MIX, NEUTRAL_TRACK_FX } from "@aurastage/contracts";
import { loudnessMeterEngine } from "@aurastage/engines";
import { audioApi } from "../api/audioApi";

export const SAMPLE_RATE = 48000;
export type Bus = "DX" | "FX" | "BG" | "MX";

let ctx: AudioContext | null = null;
export function liveContext() {
  if (!ctx) ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  return ctx;
}

const cache = new Map<string, Promise<AudioBuffer>>();
export function loadAsset(assetId: string): Promise<AudioBuffer> {
  if (!cache.has(assetId)) {
    const p = audioApi.assetBytes(assetId).then((bytes) => liveContext().decodeAudioData(bytes));
    p.catch(() => cache.delete(assetId));
    cache.set(assetId, p);
  }
  return cache.get(assetId)!;
}

/** Decodes a local file to learn its real duration / rate / channels before upload. */
export async function probeFile(file: File) {
  const buf = await liveContext().decodeAudioData(await file.arrayBuffer());
  return { duration: Math.round(buf.duration * 1000) / 1000, sample_rate: buf.sampleRate, channels: buf.numberOfChannels, buffer: buf };
}

/** Peak envelope for drawing a waveform (max |sample| per bucket, all channels). */
export function peaks(buf: AudioBuffer, buckets = 160, offset = 0, duration = buf.duration): number[] {
  const start = Math.floor(offset * buf.sampleRate), end = Math.min(buf.length, Math.floor((offset + duration) * buf.sampleRate));
  const size = Math.max(1, Math.floor((end - start) / buckets));
  const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  const out: number[] = [];
  for (let b = 0; b < buckets; b++) {
    let m = 0;
    for (let i = start + b * size; i < Math.min(end, start + (b + 1) * size); i++) for (const ch of chans) m = Math.max(m, Math.abs(ch[i]));
    out.push(m);
  }
  return out;
}

const dbToGain = (db: number) => Math.pow(10, db / 20);

export function audibleTracks(tracks: AudioTrack[]) {
  const solo = tracks.some((t) => t.solo);
  return new Set(tracks.filter((t) => !t.mute && (!solo || t.solo)).map((t) => t.id));
}

interface GraphOpts { from: number; when: number; bus?: Bus; analysers?: Map<string, AnalyserNode>; meters?: GraphMeters }
/** Live readouts from the running graph (compressor gain reduction per track, master level and limiter). */
export interface GraphMeters { comps: Map<string, DynamicsCompressorNode>; master?: AnalyserNode; limiter?: DynamicsCompressorNode }

/** Volume automation (dB offsets on top of the fader) at a time, by straight lines between points. */
export function automationAt(points: TrackFx["automation"], t: number) {
  if (!points.length) return 0;
  if (t <= points[0].t) return points[0].db;
  for (let i = 1; i < points.length; i++) if (t <= points[i].t) {
    const a = points[i - 1], b = points[i];
    return b.t === a.t ? b.db : a.db + ((b.db - a.db) * (t - a.t)) / (b.t - a.t);
  }
  return points[points.length - 1].db;
}

/** A deterministic reverb impulse: decaying noise shaped by the room type (the same settings always sound the same). */
function impulse(c: BaseAudioContext, type: SessionMix["reverb"]["type"], decay: number) {
  const rate = c.sampleRate, len = Math.max(1, Math.floor(rate * Math.min(8, decay * 1.2))), ir = c.createBuffer(2, len, rate);
  let seed = type === "room" ? 7 : type === "hall" ? 11 : 13;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  const smooth = type === "room" ? 0.6 : type === "hall" ? 0.35 : 0.05; // darker rooms, bright plates
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let prev = 0;
    for (let i = 0; i < len; i++) {
      const t = i / rate, env = Math.exp((-6.9 * t) / decay); // -60 dB at the decay time
      prev = prev * smooth + rnd() * (1 - smooth);
      d[i] = prev * env * (type === "room" && t < 0.08 && i % 331 === 0 ? 3 : 1); // a few early reflections in rooms
    }
  }
  return ir;
}

/**
 * Wires every audible recording into ctx through the studio chain:
 * clip gain/fades → track fader + automation → high-pass → low shelf → mid bell → high shelf → compressor (+ makeup) →
 * pan → department bus (DX/FX/BG/MX) → master → limiter; post-fader sends feed a shared reverb and a feedback delay.
 * Returns the sources so playback can stop them.
 */
function buildGraph(c: BaseAudioContext, dest: AudioNode, tracks: AudioTrack[], clips: AudioClip[], buffers: Map<string, AudioBuffer>, o: GraphOpts, mixIn?: SessionMix) {
  const mix = mixIn ?? NEUTRAL_SESSION_MIX;
  const play = audibleTracks(tracks);
  const sources: AudioBufferSourceNode[] = [];
  // Master: gain → limiter (fast, high ratio at the ceiling) → destination.
  const master = c.createGain();
  master.gain.value = dbToGain(mix.master.gain_db);
  let masterOut: AudioNode = master;
  if (mix.master.limiter) {
    const lim = c.createDynamicsCompressor();
    lim.threshold.value = mix.master.ceiling_db - 1; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;
    master.connect(lim);
    masterOut = lim;
    if (o.meters) o.meters.limiter = lim;
  }
  masterOut.connect(dest);
  if (o.meters) { const an = c.createAnalyser(); an.fftSize = 2048; masterOut.connect(an); o.meters.master = an; }
  const buses = new Map<Bus, GainNode>();
  for (const b of ["DX", "FX", "BG", "MX"] as Bus[]) {
    const g = c.createGain();
    g.gain.value = mix.buses[b].mute ? 0 : dbToGain(mix.buses[b].gain_db);
    g.connect(master);
    buses.set(b, g);
  }
  // Shared effects, created only when something is sent to them.
  let reverbIn: GainNode | null = null, delayIn: GainNode | null = null;
  const reverb = () => {
    if (reverbIn) return reverbIn;
    reverbIn = c.createGain();
    const pre = c.createDelay(0.5); pre.delayTime.value = mix.reverb.pre_delay_ms / 1000;
    const conv = c.createConvolver(); conv.buffer = impulse(c, mix.reverb.type, mix.reverb.decay_s);
    const ret = c.createGain(); ret.gain.value = dbToGain(mix.reverb.return_db) * 0.35;
    reverbIn.connect(pre); pre.connect(conv); conv.connect(ret); ret.connect(master);
    return reverbIn;
  };
  const delay = () => {
    if (delayIn) return delayIn;
    delayIn = c.createGain();
    const dl = c.createDelay(2.5); dl.delayTime.value = mix.delay.time_ms / 1000;
    const fb = c.createGain(); fb.gain.value = mix.delay.feedback;
    const ret = c.createGain(); ret.gain.value = dbToGain(mix.delay.return_db);
    delayIn.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(ret); ret.connect(master);
    return delayIn;
  };
  for (const t of tracks) {
    if (!play.has(t.id) || (o.bus && FAMILY_BUS[t.family] !== o.bus)) continue;
    const fx = t.fx ?? NEUTRAL_TRACK_FX;
    // Fader + automation.
    const tg = c.createGain();
    const at0 = (sec: number) => dbToGain(t.gain_db + automationAt(fx.automation, sec));
    tg.gain.setValueAtTime(at0(o.from), o.when);
    for (const p of fx.automation) if (p.t > o.from) tg.gain.linearRampToValueAtTime(dbToGain(t.gain_db + p.db), o.when + (p.t - o.from));
    let node: AudioNode = tg;
    const chain = (n: AudioNode) => { node.connect(n); node = n; };
    if (fx.hpf_hz > 0) { const f = c.createBiquadFilter(); f.type = "highpass"; f.frequency.value = fx.hpf_hz; f.Q.value = 0.707; chain(f); }
    if (fx.lpf_hz > 0) { const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = fx.lpf_hz; f.Q.value = 0.707; chain(f); }
    if (fx.eq.low.gain_db !== 0) { const f = c.createBiquadFilter(); f.type = "lowshelf"; f.frequency.value = fx.eq.low.freq; f.gain.value = fx.eq.low.gain_db; chain(f); }
    if (fx.eq.mid.gain_db !== 0) { const f = c.createBiquadFilter(); f.type = "peaking"; f.frequency.value = fx.eq.mid.freq; f.Q.value = fx.eq.mid.q; f.gain.value = fx.eq.mid.gain_db; chain(f); }
    if (fx.eq.high.gain_db !== 0) { const f = c.createBiquadFilter(); f.type = "highshelf"; f.frequency.value = fx.eq.high.freq; f.gain.value = fx.eq.high.gain_db; chain(f); }
    if (fx.comp.on) {
      const k = c.createDynamicsCompressor();
      k.threshold.value = fx.comp.threshold_db; k.ratio.value = fx.comp.ratio; k.knee.value = 6;
      k.attack.value = fx.comp.attack_ms / 1000; k.release.value = fx.comp.release_ms / 1000;
      chain(k);
      if (o.meters) o.meters.comps.set(t.id, k);
      if (fx.comp.makeup_db) { const m = c.createGain(); m.gain.value = dbToGain(fx.comp.makeup_db); chain(m); }
    }
    const pan = c.createStereoPanner();
    pan.pan.value = t.pan;
    chain(pan);
    if (o.analysers) {
      const an = c.createAnalyser();
      an.fftSize = 1024;
      pan.connect(an);
      o.analysers.set(t.id, an);
    }
    pan.connect(buses.get(FAMILY_BUS[t.family])!);
    if (fx.reverb_send_db > -60) { const sg = c.createGain(); sg.gain.value = dbToGain(fx.reverb_send_db); pan.connect(sg); sg.connect(reverb()); }
    if (fx.delay_send_db > -60) { const sg = c.createGain(); sg.gain.value = dbToGain(fx.delay_send_db); pan.connect(sg); sg.connect(delay()); }
    for (const cl of clips.filter((x) => x.track_id === t.id && x.kind === "asset" && x.asset_id)) {
      const buf = buffers.get(cl.asset_id!);
      if (!buf) continue;
      const end = cl.start_seconds + cl.duration_seconds;
      if (end <= o.from) continue;
      const skip = Math.max(0, o.from - cl.start_seconds);
      const at = o.when + Math.max(0, cl.start_seconds - o.from);
      const dur = Math.min(cl.duration_seconds - skip, buf.duration - cl.offset_seconds - skip);
      if (dur <= 0) continue;
      const src = c.createBufferSource();
      src.buffer = buf;
      const g = c.createGain();
      const level = dbToGain(cl.gain_db);
      // Fades (relative to the clip's own timeline).
      const clipT0 = at - skip;
      g.gain.setValueAtTime(cl.fade_in_seconds > skip ? 0 : level, at);
      if (cl.fade_in_seconds > skip) g.gain.linearRampToValueAtTime(level, clipT0 + cl.fade_in_seconds);
      if (cl.fade_out_seconds > 0) {
        const fadeStart = Math.max(at, clipT0 + cl.duration_seconds - cl.fade_out_seconds);
        g.gain.setValueAtTime(level, fadeStart);
        g.gain.linearRampToValueAtTime(0, clipT0 + cl.duration_seconds);
      }
      src.connect(g);
      g.connect(tg);
      src.start(at, cl.offset_seconds + skip, dur);
      sources.push(src);
    }
  }
  return sources;
}

/** Renders the mix (or one department stem, with its share of the reverb/delay) offline at 48 kHz stereo, scene length. */
export async function renderMix(seconds: number, tracks: AudioTrack[], clips: AudioClip[], buffers: Map<string, AudioBuffer>, bus?: Bus, mix?: SessionMix) {
  const off = new OfflineAudioContext(2, Math.max(1, Math.ceil(seconds * SAMPLE_RATE)), SAMPLE_RATE);
  buildGraph(off, off.destination, tracks, clips, buffers, { from: 0, when: 0, bus }, mix);
  return off.startRendering();
}

/** BS.1770-4 measurement of a rendered buffer (integrated, true peak, LRA). */
export function measure(buf: AudioBuffer) {
  return loudnessMeterEngine({ sample_rate: buf.sampleRate, channels: Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c)) });
}

/** 16-bit PCM WAV for downloading a mix or stem. */
export function encodeWav(buf: AudioBuffer): Blob {
  const ch = buf.numberOfChannels, n = buf.length, bytes = 44 + n * ch * 2;
  const v = new DataView(new ArrayBuffer(bytes));
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, bytes - 8, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, ch, true); v.setUint32(24, buf.sampleRate, true); v.setUint32(28, buf.sampleRate * ch * 2, true); v.setUint16(32, ch * 2, true);
  v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * ch * 2, true);
  const data = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
    const s = Math.max(-1, Math.min(1, data[c][i]));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    o += 2;
  }
  return new Blob([v.buffer], { type: "audio/wav" });
}

/** Live playback from a position, with a per-track analyser for metering. */
export class Player {
  private sources: AudioBufferSourceNode[] = [];
  private startedAt = 0;
  private from = 0;
  analysers = new Map<string, AnalyserNode>();
  meters: GraphMeters = { comps: new Map() };
  playing = false;
  async play(from: number, tracks: AudioTrack[], clips: AudioClip[], buffers: Map<string, AudioBuffer>, mix?: SessionMix) {
    this.stop();
    const c = liveContext();
    if (c.state === "suspended") await c.resume();
    this.analysers = new Map();
    this.meters = { comps: new Map() };
    this.from = from;
    this.startedAt = c.currentTime + 0.05;
    this.sources = buildGraph(c, c.destination, tracks, clips, buffers, { from, when: this.startedAt, analysers: this.analysers, meters: this.meters }, mix);
    this.playing = true;
  }
  position() {
    return this.playing ? this.from + Math.max(0, liveContext().currentTime - this.startedAt) : this.from;
  }
  stop() {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sources = [];
    this.playing = false;
  }
}

/** Current peak level (dBFS) of an analyser, for meters. */
export function meterDb(an: AnalyserNode) {
  const d = new Float32Array(an.fftSize);
  an.getFloatTimeDomainData(d);
  let m = 0;
  for (const x of d) m = Math.max(m, Math.abs(x));
  return m > 0 ? 20 * Math.log10(m) : -Infinity;
}
