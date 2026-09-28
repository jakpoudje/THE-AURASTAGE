// Decodes recordings and mixes the locked cut's sound with the same maths as the
// Audio Studio (engines/rendering/timelineAudioMixEngine).
import { timelineAudioMixEngine, type RenderManifest } from "@aurastage/engines";
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
  const input = { fps: m.fps, sample_rate: SAMPLE_RATE, audio: m.audio, mixes: m.mixes, pcm, bus };
  return writeWav24(path, SAMPLE_RATE, total, SAMPLE_RATE * 10, (s, n) => timelineAudioMixEngine(input, s, n), (done) => onProgress?.(done / Math.max(1, total)));
}
