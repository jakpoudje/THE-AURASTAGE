// Asset editing (Assets Library "Edit"). Pure maths only: the browser decodes the file, applies this, encodes the
// result and uploads it as a NEW version of the same asset — the original version is never touched (rule 11).
import { AudioEditSchema, ImageEditSchema, type AudioEdit, type ImageEdit } from "./input.schema";
import { ENGINE_VERSION } from "./version";

const dbToGain = (db: number) => Math.pow(10, db / 20);
const peakDb = (chs: Float32Array[]) => {
  let p = 0;
  for (const c of chs) for (let i = 0; i < c.length; i++) p = Math.max(p, Math.abs(c[i]));
  return p > 0 ? 20 * Math.log10(p) : -Infinity;
};
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

export interface AudioIn { sample_rate: number; channels: Float32Array[] }
export interface AudioOut extends AudioIn { duration: number; peak_db_before: number; peak_db_after: number; clipped_samples: number; note: string; engine_version: string }

export function applyAudioEdit(input: AudioIn, raw: Partial<AudioEdit>, fromVersion?: number): AudioOut {
  const e = AudioEditSchema.parse(raw);
  const sr = input.sample_rate;
  const len = input.channels[0]?.length ?? 0;
  const start = Math.min(len, Math.round(e.trim_start * sr));
  const end = Math.max(start, Math.min(len, e.trim_end === null ? len : Math.round(e.trim_end * sr)));
  if (end - start < Math.round(0.01 * sr)) throw new Error("The trimmed clip must be at least 10 ms long");
  const out = input.channels.map((c) => c.slice(start, end));
  const n = end - start;
  const g = dbToGain(e.gain_db);
  const fi = Math.min(n, Math.round(e.fade_in * sr)), fo = Math.min(n, Math.round(e.fade_out * sr));
  for (const c of out) {
    for (let i = 0; i < n; i++) {
      let k = g;
      if (fi && i < fi) k *= i / fi;
      if (fo && i >= n - fo) k *= (n - 1 - i) / fo;
      c[i] *= k;
    }
  }
  if (e.normalize_peak_db !== null) {
    const p = peakDb(out);
    if (Number.isFinite(p)) {
      const k = dbToGain(e.normalize_peak_db - p);
      for (const c of out) for (let i = 0; i < n; i++) c[i] *= k;
    }
  }
  let clipped = 0;
  for (const c of out) for (let i = 0; i < n; i++) if (Math.abs(c[i]) > 1) { clipped++; c[i] = Math.sign(c[i]); }
  return {
    sample_rate: sr, channels: out, duration: n / sr,
    peak_db_before: round(peakDb(input.channels)), peak_db_after: round(peakDb(out)), clipped_samples: clipped,
    note: describeAudioEdit(e, len / sr, fromVersion), engine_version: ENGINE_VERSION,
  };
}

export function describeAudioEdit(e: AudioEdit, originalSeconds: number, fromVersion?: number) {
  const parts: string[] = [];
  const endS = e.trim_end ?? originalSeconds;
  if (e.trim_start > 0 || endS < originalSeconds) parts.push(`trimmed to ${round(e.trim_start)}–${round(endS)} s`);
  if (e.gain_db) parts.push(`gain ${e.gain_db > 0 ? "+" : ""}${round(e.gain_db, 1)} dB`);
  if (e.fade_in) parts.push(`fade in ${round(e.fade_in)} s`);
  if (e.fade_out) parts.push(`fade out ${round(e.fade_out)} s`);
  if (e.normalize_peak_db !== null) parts.push(`normalised to ${e.normalize_peak_db} dBFS peak`);
  return `Edited in AuraStage${fromVersion ? ` from v${fromVersion}` : ""}: ${parts.join(", ") || "no changes"}`;
}

/** 16-bit PCM WAV bytes. */
export function encodeWav16(sample_rate: number, channels: Float32Array[]): Uint8Array {
  const ch = channels.length, n = channels[0]?.length ?? 0, size = 44 + n * ch * 2;
  const v = new DataView(new ArrayBuffer(size));
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, size - 8, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, ch, true); v.setUint32(24, sample_rate, true); v.setUint32(28, sample_rate * ch * 2, true); v.setUint16(32, ch * 2, true);
  v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * ch * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
    const s = Math.max(-1, Math.min(1, channels[c][i]));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    o += 2;
  }
  return new Uint8Array(v.buffer);
}

export interface ImagePlan {
  /** Source rectangle in original pixels. */
  source: { x: number; y: number; w: number; h: number };
  /** Output canvas size after rotation and resizing. */
  width: number; height: number;
  /** Scale applied to the cropped image (1 = none). */
  scale: number;
  rotate: 0 | 90 | 180 | 270; flip_h: boolean; flip_v: boolean;
  /** CSS/canvas filter string. */
  filter: string;
  note: string; engine_version: string;
}

export function planImageEdit(width: number, height: number, raw: Partial<ImageEdit>, fromVersion?: number): ImagePlan {
  const e = ImageEditSchema.parse(raw);
  const sx = Math.round(e.crop.x * width), sy = Math.round(e.crop.y * height);
  const sw = Math.max(1, Math.min(width - sx, Math.round(e.crop.w * width))), sh = Math.max(1, Math.min(height - sy, Math.round(e.crop.h * height)));
  const turned = e.rotate === 90 || e.rotate === 270;
  const w0 = turned ? sh : sw, h0 = turned ? sw : sh;
  const scale = e.max_size && Math.max(w0, h0) > e.max_size ? e.max_size / Math.max(w0, h0) : 1;
  const filter = [e.brightness !== 100 && `brightness(${e.brightness}%)`, e.contrast !== 100 && `contrast(${e.contrast}%)`, e.saturation !== 100 && `saturate(${e.saturation}%)`].filter(Boolean).join(" ") || "none";
  return {
    source: { x: sx, y: sy, w: sw, h: sh }, width: Math.max(1, Math.round(w0 * scale)), height: Math.max(1, Math.round(h0 * scale)), scale,
    rotate: e.rotate, flip_h: e.flip_h, flip_v: e.flip_v, filter, note: describeImageEdit(e, width, height, fromVersion), engine_version: ENGINE_VERSION,
  };
}

export function describeImageEdit(e: ImageEdit, width: number, height: number, fromVersion?: number) {
  const parts: string[] = [];
  const c = e.crop;
  if (c.x > 0 || c.y > 0 || c.w < 1 || c.h < 1) parts.push(`cropped to ${Math.round(c.w * width)}×${Math.round(c.h * height)}`);
  if (e.rotate) parts.push(`rotated ${e.rotate}°`);
  if (e.flip_h) parts.push("flipped horizontally");
  if (e.flip_v) parts.push("flipped vertically");
  for (const k of ["brightness", "contrast", "saturation"] as const) if (e[k] !== 100) parts.push(`${k} ${e[k]}%`);
  if (e.max_size) parts.push(`resized to fit ${e.max_size} px`);
  return `Edited in AuraStage${fromVersion ? ` from v${fromVersion}` : ""}: ${parts.join(", ") || "no changes"}`;
}
