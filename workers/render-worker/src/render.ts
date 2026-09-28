// Renders one deliverable from its immutable RenderManifest, measures every file
// and runs final QC (engines/rendering/finalQCEngine). Pure orchestration: all
// I/O goes through `deps` so it can be tested with local files.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { finalQCEngine, type RenderManifest } from "@aurastage/engines";
import type { RenderOutput } from "@aurastage/contracts";
import { decode, mixToWav, SAMPLE_RATE, type Bus } from "./audio";
import { CancelledError, ffmpeg } from "./ffmpeg";
import { renderPicture } from "./picture";
import { measure } from "./probe";

export interface RenderClaim {
  render: { id: string; org_id: string; project_id: string; profile_id: string; attempt: number };
  manifest: RenderManifest;
}
export interface RenderDeps {
  fetchMedia(key: string): Promise<{ bytes: Uint8Array; contentType: string }>;
  putFile(key: string, path: string, contentType: string): Promise<number>;
  keyFor(render: RenderClaim["render"], fileName: string): string;
  /** Reports progress; resolves true if the person asked to cancel. */
  progress(percent: number, stage: string): Promise<boolean>;
  log(event: string, data: Record<string, unknown>): void;
  fontDir?: string;
}

export const CONTENT_TYPES: Record<string, string> = { mp4: "video/mp4", mov: "video/quicktime", wav: "audio/wav", srt: "application/x-subrip", vtt: "text/vtt", edl: "text/plain" };
const typeOf = (name: string) => CONTENT_TYPES[name.split(".").pop()!] ?? "application/octet-stream";
const STEMS: [string, Bus][] = [["mix.wav", null], ["stem_DX.wav", "DX"], ["stem_FX.wav", "FX"], ["stem_BG.wav", "BG"], ["stem_MX.wav", "MX"], ["ME.wav", "ME"]];

/**
 * Final encode arguments (after the two inputs: picture, then sound).
 * Limited by duration, not "-frames:v": ffmpeg 5.x closes the WHOLE output when a
 * stream's frame limit is reached, which truncated the sound on the live worker
 * (caught by final QC). Regression-tested in render.test.ts.
 */
export function encodeArgs(m: RenderManifest, filters: string[], out: string): string[] {
  const p = m.profile, v = p.video!, secs = m.duration_frames / m.fps;
  const vcodec = v.codec === "prores"
    ? ["-c:v", "prores_ks", "-profile:v", "3", "-vendor", "apl0", "-pix_fmt", v.pix_fmt]
    : ["-c:v", "libx264", "-profile:v", "high", "-preset", "medium", "-crf", p.id === "review_copy" ? "23" : "18", "-pix_fmt", v.pix_fmt, "-movflags", "+faststart"];
  const acodec = p.audio!.codec === "aac" ? ["-c:a", "aac", "-b:a", p.audio!.bitrate ?? "320k"] : ["-c:a", "pcm_s24le"];
  return [
    "-map", "0:v:0", "-map", "1:a:0", ...(filters.length ? ["-vf", filters.join(",")] : []),
    "-t", secs.toFixed(6), "-r", String(m.fps), ...vcodec,
    "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
    ...acodec, "-ar", String(SAMPLE_RATE), "-ac", "2", "-metadata", `title=${m.project.title}`, ...creditMetadata(m), out,
  ];
}

/** Project Settings credits (manifest ≥ 1.1.0) as container metadata; only the ones that are set. */
export function creditMetadata(m: RenderManifest): string[] {
  const c = m.project.credits ?? {};
  const tags: [string, string | number | null | undefined][] = [
    ["artist", c.director], ["director", c.director], ["producer", c.producer], ["publisher", c.company], ["copyright", c.copyright], ["date", c.year],
  ];
  return tags.flatMap(([k, v]) => (v === null || v === undefined || v === "" ? [] : ["-metadata", `${k}=${String(v).replace(/[\r\n]+/g, " ")}`]));
}

/** Escapes a path for use inside an ffmpeg filter argument. */
const fpath = (p: string) => p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");

export async function renderDeliverable(claim: RenderClaim, d: RenderDeps): Promise<{ outputs: RenderOutput[]; qc: ReturnType<typeof finalQCEngine> }> {
  const m = claim.manifest;
  const p = m.profile;
  const dir = mkdtempSync(join(tmpdir(), `render-${claim.render.id.slice(0, 8)}-`));
  const ac = new AbortController();
  let last = 0;
  const report = async (pct: number, stage: string, force = false) => {
    if (!force && Date.now() - last < 2000) return;
    last = Date.now();
    if (await d.progress(Math.round(pct * 10) / 10, stage)) {
      ac.abort();
      throw new CancelledError();
    }
  };
  const produced: string[] = [];
  try {
    await report(1, "Starting", true);
    const secs = m.duration_frames / m.fps;
    const needsSound = !!p.audio && m.audio.length > 0;
    const pcm = new Map<string, { channels: Float32Array[] }>();
    if (needsSound) {
      const ids = Object.keys(m.assets);
      for (let i = 0; i < ids.length; i++) {
        const a = m.assets[ids[i]];
        const f = join(dir, `rec_${i}`);
        writeFileSync(f, (await d.fetchMedia(a.storage_key)).bytes);
        pcm.set(ids[i], await decode(f, ac.signal));
        await report(2 + (8 * (i + 1)) / ids.length, `Decoding recordings ${i + 1}/${ids.length}`);
      }
    }

    if (p.video) {
      const wav = join(dir, "sound.wav");
      if (needsSound) mixToWav(m, pcm, null, wav);
      else writeFileSync(wav, Buffer.alloc(0));
      await report(15, "Mixing sound", true);
      const picture = await renderPicture(m, d.fetchMedia, dir, (f) => void report(15 + 45 * f, "Rendering picture").catch(() => ac.abort()), ac.signal);
      if (ac.signal.aborted) throw new CancelledError();
      const out = join(dir, m.files[0]);
      const filters: string[] = [];
      const font = join(d.fontDir ?? "/usr/share/fonts/truetype/dejavu", "DejaVuSans.ttf");
      const mono = join(d.fontDir ?? "/usr/share/fonts/truetype/dejavu", "DejaVuSansMono.ttf");
      if (m.options.watermark) {
        const tf = join(dir, "watermark.txt");
        writeFileSync(tf, m.options.watermark);
        filters.push(`drawtext=fontfile='${fpath(font)}':textfile='${fpath(tf)}':fontsize=h/12:fontcolor=white@0.28:x=(w-tw)/2:y=(h-th)/2`);
      }
      if (m.options.burn_timecode) filters.push(`drawtext=fontfile='${fpath(mono)}':timecode='00\\:00\\:00\\:00':rate=${m.fps}:fontsize=h/24:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=6:x=(w-tw)/2:y=h-th-24`);
      const audioIn = needsSound ? ["-i", wav] : ["-f", "lavfi", "-t", secs.toFixed(3), "-i", `anullsrc=r=${SAMPLE_RATE}:cl=stereo`];
      await ffmpeg(
        ["-progress", "pipe:1", "-i", picture, ...audioIn, ...encodeArgs(m, filters, out)],
        { signal: ac.signal, onTime: (t) => void report(60 + 25 * Math.min(1, t / secs), "Encoding").catch(() => ac.abort()) }
      );
      produced.push(out);
      if (m.files.includes("captions.srt") && m.subtitles) {
        writeFileSync(join(dir, "captions.srt"), m.subtitles.srt);
        produced.push(join(dir, "captions.srt"));
      }
    } else if (p.id === "audio_package") {
      for (let i = 0; i < STEMS.length; i++) {
        const [name, bus] = STEMS[i];
        const out = join(dir, name);
        mixToWav(m, pcm, bus, out);
        produced.push(out);
        await report(10 + (75 * (i + 1)) / STEMS.length, `Mixing ${name}`, true);
      }
    } else if (p.id === "subtitles") {
      writeFileSync(join(dir, "subtitles.srt"), m.subtitles?.srt ?? "");
      writeFileSync(join(dir, "subtitles.vtt"), m.subtitles?.vtt ?? "WEBVTT\n");
      produced.push(join(dir, "subtitles.srt"), join(dir, "subtitles.vtt"));
    } else if (p.id === "edit_decision_list") {
      writeFileSync(join(dir, "picture_lock.edl"), m.edl ?? "");
      produced.push(join(dir, "picture_lock.edl"));
    } else {
      throw new Error(`The render worker doesn't know how to make ${p.label}`);
    }

    await report(86, "Checking quality", true);
    const measured = [];
    for (const f of produced) measured.push(await measure(f, /\.(mp4|mov)$/.test(f) || f.endsWith("mix.wav")));
    const qc = finalQCEngine({ profile: p, fps: m.fps, duration_frames: m.duration_frames, expected_files: m.files, expected_cues: m.subtitles ? m.subtitles.cues.length : null, files: measured });
    await report(92, "Uploading", true);
    const outputs: RenderOutput[] = [];
    for (let i = 0; i < produced.length; i++) {
      const name = measured[i].name;
      const key = d.keyFor(claim.render, name);
      const bytes = await d.putFile(key, produced[i], typeOf(name));
      outputs.push({ name, storage_key: key, media_type: typeOf(name), bytes, sha256: measured[i].sha256! });
    }
    d.log("render.finished", { render_id: claim.render.id, files: outputs.length, qc_passed: qc.passed });
    return { outputs, qc };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
