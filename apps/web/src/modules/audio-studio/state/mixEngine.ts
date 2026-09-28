"use client";

// Browser mix engine (Web Audio). The SAME graph is used for live playback and
// for offline rendering, so what you hear is what gets measured (BS.1770-4 via
// engines/audio/loudnessMeterEngine) and exported. Only real recordings make
// sound; planned cues are silent by definition.

import type { AudioClip, AudioTrack } from "@aurastage/contracts";
import { FAMILY_BUS } from "@aurastage/contracts";
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

interface GraphOpts { from: number; when: number; bus?: Bus; analysers?: Map<string, AnalyserNode> }

/** Wires every audible recording into ctx; returns the sources so playback can stop them. */
function buildGraph(c: BaseAudioContext, dest: AudioNode, tracks: AudioTrack[], clips: AudioClip[], buffers: Map<string, AudioBuffer>, o: GraphOpts) {
  const play = audibleTracks(tracks);
  const sources: AudioBufferSourceNode[] = [];
  for (const t of tracks) {
    if (!play.has(t.id) || (o.bus && FAMILY_BUS[t.family] !== o.bus)) continue;
    const tg = c.createGain();
    tg.gain.value = dbToGain(t.gain_db);
    const pan = c.createStereoPanner();
    pan.pan.value = t.pan;
    tg.connect(pan);
    let out: AudioNode = pan;
    if (o.analysers) {
      const an = c.createAnalyser();
      an.fftSize = 1024;
      pan.connect(an);
      o.analysers.set(t.id, an);
    }
    out.connect(dest);
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

/** Renders the mix (or one department stem) offline at 48 kHz stereo. */
export async function renderMix(seconds: number, tracks: AudioTrack[], clips: AudioClip[], buffers: Map<string, AudioBuffer>, bus?: Bus) {
  const off = new OfflineAudioContext(2, Math.max(1, Math.ceil(seconds * SAMPLE_RATE)), SAMPLE_RATE);
  buildGraph(off, off.destination, tracks, clips, buffers, { from: 0, when: 0, bus });
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
  playing = false;
  async play(from: number, tracks: AudioTrack[], clips: AudioClip[], buffers: Map<string, AudioBuffer>) {
    this.stop();
    const c = liveContext();
    if (c.state === "suspended") await c.resume();
    this.analysers = new Map();
    this.from = from;
    this.startedAt = c.currentTime + 0.05;
    this.sources = buildGraph(c, c.destination, tracks, clips, buffers, { from, when: this.startedAt, analysers: this.analysers });
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
