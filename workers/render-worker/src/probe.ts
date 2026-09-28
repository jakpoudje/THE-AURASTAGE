// Measures produced files for final QC: streams (ffprobe), loudness (ffmpeg
// ebur128, an independent BS.1770 meter), SHA-256 and subtitle cue count.
import { createHash } from "node:crypto";
import { createReadStream, readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import type { finalQC } from "@aurastage/engines";
import { ffmpeg, ffprobe } from "./ffmpeg";

type MeasuredFile = finalQC.MeasuredFile;

export function sha256(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(path).on("data", (d) => h.update(d)).on("end", () => resolve(h.digest("hex"))).on("error", reject);
  });
}

const rate = (r: string) => {
  const [a, b] = r.split("/").map(Number);
  return b ? a / b : a;
};

export async function loudness(path: string) {
  const { stderr } = await ffmpeg(["-nostats", "-i", path, "-map", "0:a:0", "-filter_complex", "ebur128=peak=true", "-f", "null", "-"]);
  const summary = stderr.slice(stderr.lastIndexOf("Summary:"));
  const num = (re: RegExp) => {
    const m = re.exec(summary);
    return m ? Number(m[1]) : null;
  };
  const I = num(/I:\s+(-?[\d.]+) LUFS/), LRA = num(/LRA:\s+(-?[\d.]+) LU/), TP = num(/Peak:\s+(-?[\d.inf]+) dBFS/);
  return { integrated_lufs: I === null || I <= -70 ? null : I, true_peak_dbtp: TP === null || !Number.isFinite(TP) ? null : TP, lra_lu: LRA };
}

export async function measure(path: string, withLoudness: boolean): Promise<MeasuredFile> {
  const name = basename(path);
  const bytes = statSync(path).size;
  const base: MeasuredFile = { name, bytes, sha256: await sha256(path), video: null, audio: null, loudness: null, cues: null };
  if (/\.(srt|vtt)$/.test(name)) return { ...base, cues: (readFileSync(path, "utf8").match(/-->/g) ?? []).length };
  if (!/\.(mp4|mov|wav)$/.test(name)) return base;
  const { stdout } = await ffprobe(["-show_streams", "-show_format", "-of", "json", path]);
  const j = JSON.parse(stdout.toString()) as { streams: Record<string, any>[]; format: Record<string, any> };
  const fdur = Number(j.format?.duration ?? 0);
  const v = j.streams.find((s) => s.codec_type === "video");
  const a = j.streams.find((s) => s.codec_type === "audio");
  return {
    ...base,
    video: v ? { codec: v.codec_name, width: v.width, height: v.height, fps: rate(v.r_frame_rate), pix_fmt: v.pix_fmt, duration: Number(v.duration ?? fdur) } : null,
    audio: a ? { codec: a.codec_name, sample_rate: Number(a.sample_rate), channels: a.channels, duration: Number(a.duration ?? fdur) } : null,
    loudness: withLoudness && a ? await loudness(path) : null,
  };
}
