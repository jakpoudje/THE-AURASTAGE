// Decodes recordings and mixes the locked cut's sound with the same maths as the
// Audio Studio (engines/rendering/timelineAudioMixEngine).
import { proceduralAudioEngine, timelineAudioMixEngine, type RenderManifest } from "@aurastage/engines";
import { ffmpeg, ffprobe } from "./ffmpeg";
import { writeWav24 } from "./wav";

export const SAMPLE_RATE = 48000;
type Pcm = { channels: Float32Array[] };

/** Decodes one recording to 48 kHz float PCM, keeping mono as mono (like the browser). */
export async function decode(path: string, signal?: AbortSignal): Promise<Pcm> {
  const { stdout: info } = await ffprobe(["-select_streams", "a:0", "-show_entries", "stream=channels", "-of", "csv=p=0", path]);
  const ch = Math.min(2, Math.max(1, parseInt(info.toString().trim(), 10) || 1));
  const { stdout } = await ffmpeg(["-i", path, "-map", "0:a:0", "-ac", String(ch), "-ar", String(SAMPLE_RATE), "-f", "f32le", "-acodec", "pcm_f32le", "pipe:1"], { signal });
  const all = new Float32Array(stdout.buffer.slice(stdout.byteOffset, stdout.byteOffset + stdout.byteLength - (stdout.byteLength % 4)));
  const n = Math.floor(all.length / ch);
  const channels = Array.from({ length: ch }, () => new Float32Array(n));
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) channels[c][i] = all[i * ch + c];
  return { channels };
}

export type Bus = "DX" | "FX" | "BG" | "MX" | "ME" | null;
/** Writes the cut's mix (or one stem) as a 48 kHz 24-bit stereo WAV, 10 s at a time. */
export function mixToWav(m: RenderManifest, pcm: Map<string, Pcm>, bus: Bus, path: string, onProgress?: (fraction: number) => void) {
  const total = Math.round((m.duration_frames / m.fps) * SAMPLE_RATE);
  // The timeline's volume automation (manifest ≥ 1.3.0) shapes the whole cut, every stem alike.
  const input = { fps: m.fps, sample_rate: SAMPLE_RATE, audio: m.audio, mixes: m.mixes, pcm, bus, automation: m.automation?.A1 ?? [] };
  // Music belongs to the music stem, the M&E and the full mix: the title theme and the A2 music track (manifest ≥ 1.7.0).
  const music = bus === null || bus === "MX" || bus === "ME" ? [...titleMusic(m), ...musicTrack(m, pcm)] : [];
  return writeWav24(path, SAMPLE_RATE, total, SAMPLE_RATE * 10, (s, n) => {
    const out = timelineAudioMixEngine(input, s, n);
    for (const t of music) {
      const from = Math.max(s, t.at), to = Math.min(s + n, t.at + t.L.length);
      for (let k = from; k < to; k++) { out[0][k - s] += t.L[k - t.at]; out[1][k - s] += t.R[k - t.at]; }
    }
    return out;
  }, (done) => onProgress?.(done / Math.max(1, total)));
}

/** The film's main theme under the title card and the credit roll (manifest ≥ 1.4.0), at a music-bed level. */
export function titleMusic(m: RenderManifest): { at: number; L: Float32Array; R: Float32Array }[] {
  const tm = (m as { title_music?: { description: string; mood: string[]; seed: number } | null }).title_music;
  if (!tm) return [];
  const gain = Math.pow(10, -9 / 20); // the theme peaks at −12 dBFS, under any dialogue that follows
  return m.picture.filter((s) => s.kind === "title" || s.kind === "credits").map((s) => {
    const secs = Math.max(0.5, s.duration / m.fps);
    const r = proceduralAudioEngine({ kind: "score", description: tm.description, mood: tm.mood, duration_seconds: Math.min(300, secs), seed: tm.seed, sample_rate: SAMPLE_RATE });
    const fade = Math.min(r.channels[0].length, Math.round(SAMPLE_RATE * 1.5));
    const L = r.channels[0].map((v, i, a) => v * gain * Math.min(1, (a.length - 1 - i) / fade));
    const R = r.channels[1].map((v, i, a) => v * gain * Math.min(1, (a.length - 1 - i) / fade));
    return { at: Math.round((s.record_in / m.fps) * SAMPLE_RATE), L, R };
  });
}

/** The A2 music track (manifest ≥ 1.7.0): each clip's part of its file, at the clip's level, with 0.5 s fades at its edges. */
export function musicTrack(m: RenderManifest, pcm: Map<string, Pcm>): { at: number; L: Float32Array; R: Float32Array }[] {
  const list = ((m as { music?: { record_in: number; duration: number; source_in: number; asset_id: string; gain_db: number }[] }).music ?? []);
  const spf = SAMPLE_RATE / m.fps;
  return list.flatMap((c) => {
    const p = pcm.get(c.asset_id);
    if (!p) return [];
    const n = Math.round(c.duration * spf), s0 = Math.round(c.source_in * spf), g = Math.pow(10, c.gain_db / 20), fade = Math.min(Math.round(SAMPLE_RATE * 0.5), Math.floor(n / 2));
    const [l, r] = [p.channels[0], p.channels[1] ?? p.channels[0]];
    const L = new Float32Array(n), R = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const src = s0 + k;
      if (src >= l.length) break;
      const env = g * Math.min(1, fade ? k / fade : 1, fade ? (n - 1 - k) / fade : 1);
      L[k] = l[src] * env;
      R[k] = r[src] * env;
    }
    return [{ at: Math.round(c.record_in * spf), L, R }];
  });
}
