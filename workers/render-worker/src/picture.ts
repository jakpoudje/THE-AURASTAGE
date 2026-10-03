// Renders the locked picture: every segment (approved take or black) becomes a
// lossless intermediate of exactly its frame count at the profile's size, then
// they are joined without re-encoding. The final encode happens once, later.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { lipsyncKeys, showMouths, type PictureSegment, type RenderManifest } from "@aurastage/engines";
import { ffmpeg } from "./ffmpeg";

const INTERMEDIATE = ["-c:v", "libx264", "-preset", "ultrafast", "-qp", "0", "-pix_fmt", "yuv444p", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709"];

/** Same parameters as the Editorial viewer's grade preview (exposure ×2^e, contrast, saturation, warmth). */
export function gradeFilter(g: PictureSegment["grade"]): string | null {
  if (!g || (!g.exposure && !g.contrast && !g.saturation && !g.temperature)) return null;
  const k = Math.pow(2, g.exposure);
  const parts = [`colorchannelmixer=rr=${(k * (1 + 0.1 * g.temperature)).toFixed(4)}:gg=${k.toFixed(4)}:bb=${(k * (1 - 0.1 * g.temperature)).toFixed(4)}`];
  if (g.contrast || g.saturation) parts.push(`eq=contrast=${(1 + g.contrast).toFixed(3)}:saturation=${(1 + g.saturation).toFixed(3)}`);
  return parts.join(",");
}

/** Fade from / to black on a take (manifest ≥ 1.6.0), inside its own frames so nothing moves. */
export function fadeFilter(s: PictureSegment, fps: number): string | null {
  const t = s.transition;
  if (!t || s.kind !== "take") return null;
  const d = t.frames / fps, secs = s.duration / fps, parts: string[] = [];
  if (t.in === "fade_from_black") parts.push(`fade=t=in:st=0:d=${d.toFixed(4)}`);
  if (t.out === "fade_to_black") parts.push(`fade=t=out:st=${(secs - d).toFixed(4)}:d=${d.toFixed(4)}`);
  return parts.length ? parts.join(",") : null;
}

type Viseme = NonNullable<PictureSegment["lipsync"]>[number]["viseme"];
/**
 * Lip sync (manifest ≥ 1.10.0): the mouth state of every speaking character over a segment's frames, as runs
 * ({ from, to, state }) — each run is one still of the sketch with those mouths. Pure; unit-tested.
 */
export function lipsyncRuns(changes: NonNullable<PictureSegment["lipsync"]>, frames: number) {
  const state: Record<string, Viseme> = {};
  const runs: { from: number; to: number; state: Record<string, Viseme> }[] = [];
  const key = (s: Record<string, Viseme>) => JSON.stringify(Object.entries(s).filter(([, v]) => v !== "rest").sort());
  let from = 0;
  const sorted = [...changes].filter((c) => c.frame < frames).sort((a, b) => a.frame - b.frame);
  for (let i = 0; i <= sorted.length; i++) {
    const at = i < sorted.length ? Math.max(0, sorted[i].frame) : frames;
    if (at > from) {
      const prev = runs.at(-1);
      if (prev && key(prev.state) === key(state)) prev.to = at;
      else runs.push({ from, to: at, state: { ...state } });
      from = at;
    }
    if (i < sorted.length) state[sorted[i].key] = sorted[i].viseme;
  }
  return runs;
}

export async function renderPicture(
  m: RenderManifest, fetchMedia: (key: string) => Promise<{ bytes: Uint8Array; contentType: string }>, dir: string,
  onProgress: (fraction: number) => void, signal?: AbortSignal
) {
  const { width: W, height: H } = m.profile.video!;
  // Size and grade in RGB, then convert once with the Rec.709 matrix (the default for RGB would be BT.601).
  // "fill" (vertical social): centre-crop the picture to the frame; otherwise fit it inside (letterbox).
  const fit = (m.profile.video as { fit?: string }).fit === "fill"
    ? `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,format=gbrp`
    : `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,format=gbrp`;
  const toYuv = "scale=out_color_matrix=bt709:out_range=tv,format=yuv444p";
  const cache = new Map<string, string>();
  const svgText = new Map<string, string>();
  const list: string[] = [];
  for (let i = 0; i < m.picture.length; i++) {
    const s = m.picture[i];
    const out = join(dir, `seg_${String(i).padStart(5, "0")}.mkv`);
    const common = ["-frames:v", String(s.duration), "-r", String(m.fps), ...INTERMEDIATE, "-an", out];
    if (s.kind === "black") {
      await ffmpeg(["-f", "lavfi", "-i", `color=c=black:s=${W}x${H}:r=${m.fps}`, "-vf", "format=yuv444p", ...common], { signal });
    } else if (s.kind === "title" || s.kind === "credits") {
      // Title card: held with a fade in and out. Credit roll: one tall image scrolled up at a steady speed.
      const png = join(dir, `${s.kind}_${i}.png`);
      const tall = s.kind === "credits" ? (s.image_height ?? H) : H;
      writeFileSync(png, new Resvg(s.svg ?? "<svg xmlns='http://www.w3.org/2000/svg'/>", { fitTo: { mode: "width", value: W }, background: "black" }).render().asPng());
      const secs = s.duration / m.fps, fade = Math.min(0.8, secs / 4);
      const vf = s.kind === "title"
        ? `scale=${W}:${H},setsar=1,fade=t=in:st=0:d=${fade.toFixed(3)},fade=t=out:st=${(secs - fade).toFixed(3)}:d=${fade.toFixed(3)},format=yuv444p`
        : `scale=${W}:${tall},setsar=1,crop=${W}:${H}:0:'min(${tall - H}\,${tall - H}*t/${secs.toFixed(3)})',format=yuv444p`;
      await ffmpeg(["-loop", "1", "-framerate", String(m.fps), "-i", png, "-vf", vf, ...common], { signal });
    } else {
      let src = cache.get(s.storage_key!);
      if (!src) {
        const media = await fetchMedia(s.storage_key!);
        const type = s.media_type ?? media.contentType;
        if (/svg/.test(type)) {
          svgText.set(s.storage_key!, Buffer.from(media.bytes).toString("utf8"));
          const png = new Resvg(svgText.get(s.storage_key!)!, { fitTo: { mode: "width", value: W }, background: "black" }).render().asPng();
          src = join(dir, `src_${cache.size}.png`);
          writeFileSync(src, png);
        } else {
          src = join(dir, `src_${cache.size}${/video|mp4/.test(type) ? ".mp4" : ".img"}`);
          writeFileSync(src, media.bytes);
        }
        cache.set(s.storage_key!, src);
      }
      const vf = [fit, gradeFilter(s.grade), toYuv].filter(Boolean).join(",");
      const fx = fadeFilter(s, m.fps);
      const svg = svgText.get(s.storage_key!);
      // Only characters this sketch has labelled mouths for (sketches made before lip sync have none: drawn as before).
      const speaking = svg && s.lipsync?.length ? s.lipsync.filter((c) => lipsyncKeys(svg).includes(c.key)) : [];
      const runs = speaking.length ? lipsyncRuns(speaking, s.duration) : null;
      if (runs && runs.length > 1) {
        // Lip sync: one still per mouth state (the sketch with those mouths shown), held for its frames, joined in order.
        const stills = new Map<string, string>();
        const lines: string[] = [];
        for (const r of runs) {
          const k = JSON.stringify(r.state);
          let file = stills.get(k);
          if (!file) {
            file = join(dir, `lip_${i}_${stills.size}.png`);
            writeFileSync(file, new Resvg(showMouths(svg!, r.state), { fitTo: { mode: "width", value: W }, background: "black" }).render().asPng());
            stills.set(k, file);
          }
          lines.push(`file '${file}'`, `duration ${((r.to - r.from) / m.fps).toFixed(6)}`);
        }
        lines.push(`file '${stills.get(JSON.stringify(runs.at(-1)!.state))}'`); // the concat demuxer needs the last still again
        const concat = join(dir, `lip_${i}.txt`);
        writeFileSync(concat, lines.join("\n") + "\n");
        await ffmpeg(["-f", "concat", "-safe", "0", "-i", concat, "-vf", [`fps=${m.fps}`, vf, fx].filter(Boolean).join(","), ...common], { signal });
      } else if (s.capability === "video") {
        const pad = `tpad=stop_mode=clone:stop_duration=${(s.duration / m.fps).toFixed(3)}`;
        await ffmpeg(["-ss", (s.source_in / m.fps).toFixed(4), "-i", src, "-vf", [`fps=${m.fps}`, vf, pad, fx].filter(Boolean).join(","), ...common], { signal });
      } else {
        await ffmpeg(["-loop", "1", "-framerate", String(m.fps), "-i", src, "-vf", [vf, fx].filter(Boolean).join(","), ...common], { signal });
      }
    }
    // Dissolve (manifest ≥ 1.6.0): blend in from the last frame of the picture before, over this clip's first frames.
    if (s.kind === "take" && s.transition?.in === "dissolve" && i > 0) {
      const prev = join(dir, `seg_${String(i - 1).padStart(5, "0")}.mkv`), last = join(dir, `last_${i}.png`), mixed = join(dir, `seg_${String(i).padStart(5, "0")}_x.mkv`);
      await ffmpeg(["-sseof", "-0.5", "-i", prev, "-update", "1", "-frames:v", "999", last], { signal });
      const d = (s.transition.frames / m.fps).toFixed(4);
      await ffmpeg(["-loop", "1", "-framerate", String(m.fps), "-t", d, "-i", last, "-i", out, "-filter_complex",
        `[0:v]fps=${m.fps},setsar=1,format=yuv444p,settb=AVTB[a];[1:v]fps=${m.fps},setsar=1,format=yuv444p,settb=AVTB[b];[a][b]xfade=transition=fade:duration=${d}:offset=0,format=yuv444p`,
        "-frames:v", String(s.duration), "-r", String(m.fps), ...INTERMEDIATE, "-an", mixed], { signal });
      list.push(`file '${mixed}'`);
      onProgress((i + 1) / m.picture.length);
      continue;
    }
    list.push(`file '${out}'`);
    onProgress((i + 1) / m.picture.length);
  }
  const listFile = join(dir, "segments.txt");
  writeFileSync(listFile, list.join("\n") + "\n");
  const joined = join(dir, "picture.mkv");
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", joined], { signal });
  return joined;
}
