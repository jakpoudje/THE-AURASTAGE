// engines/rendering/subtitleTimelineEngine
// Places each approved dialogue line where it is heard in the locked cut: the
// line's position inside its scene mix, mapped through the A1 clip that plays
// that part of the mix. Lines cut out of the edit are dropped; lines partly cut
// are clipped. Text is wrapped to two lines of at most 42 characters.
import { GAP_FRAMES, MAX_CHARS_PER_LINE, MAX_CPS, MAX_LINES, MIN_SECONDS } from "./rules";
import { validateSubtitleInput } from "./validator";
import { ENGINE_VERSION } from "./version";
import type { SubtitleCue, SubtitleOutput } from "./output.schema";

function wrap(text: string): string {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur && (cur + " " + w).length > MAX_CHARS_PER_LINE) (lines.push(cur), (cur = w));
    else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  if (lines.length <= MAX_LINES) return lines.join("\n");
  // Too long for two lines: balance into two.
  const all = words.join(" "), mid = all.lastIndexOf(" ", Math.ceil(all.length / 2));
  return mid > 0 ? `${all.slice(0, mid)}\n${all.slice(mid + 1)}` : all;
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
function stamp(frame: number, fps: number, sep: string) {
  const ms = Math.round((frame / fps) * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(ms % 1000, 3)}`;
}

export function subtitleTimelineEngine(raw: unknown): SubtitleOutput {
  const { fps, audio, mixes, lines } = validateSubtitleInput(raw);
  const found: Omit<SubtitleCue, "index">[] = [];
  for (const a of audio) {
    const mix = mixes[a.mix_version_id];
    if (!mix) continue;
    for (const d of mix.dialogue) {
      const line = lines[d.line_id];
      if (!line || !line.text.trim()) continue;
      const s = Math.round(d.start_seconds * fps), e = Math.round((d.start_seconds + d.duration_seconds) * fps);
      // Scene frames [s,e) -> timeline, only inside the part of the mix this A1 clip plays.
      const from = Math.max(s, a.source_in), to = Math.min(e, a.source_in + a.duration);
      if (to <= from) continue;
      found.push({ start_frame: a.record_in + (from - a.source_in), end_frame: a.record_in + (to - a.source_in), text: wrap(line.text), line_id: d.line_id });
    }
  }
  found.sort((x, y) => x.start_frame - y.start_frame);
  const warnings: string[] = [];
  const tc = (f: number) => stamp(f, fps, ".");
  const cues: SubtitleCue[] = found.map((c, i) => ({ ...c, index: i + 1 }));
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i], next = cues[i + 1];
    const limit = next ? next.start_frame - GAP_FRAMES : Infinity;
    const min = Math.round(MIN_SECONDS * fps);
    if (c.end_frame - c.start_frame < min) c.end_frame = Math.max(c.end_frame, Math.min(c.start_frame + min, limit));
    if (next && c.end_frame > limit) c.end_frame = Math.max(c.start_frame + 1, limit);
    const secs = (c.end_frame - c.start_frame) / fps;
    const cps = c.text.replace(/\n/g, "").length / secs;
    if (cps > MAX_CPS) warnings.push(`${tc(c.start_frame)} reads at ${cps.toFixed(0)} characters per second (over ${MAX_CPS}).`);
    if (secs < MIN_SECONDS) warnings.push(`${tc(c.start_frame)} is on screen for only ${secs.toFixed(2)} s.`);
  }
  const srt = cues.map((c) => `${c.index}\n${stamp(c.start_frame, fps, ",")} --> ${stamp(c.end_frame, fps, ",")}\n${c.text}\n`).join("\n");
  const vtt = "WEBVTT\n\n" + cues.map((c) => `${c.index}\n${stamp(c.start_frame, fps, ".")} --> ${stamp(c.end_frame, fps, ".")}\n${c.text}\n`).join("\n");
  return { cues, srt, vtt, warnings, engine_version: ENGINE_VERSION };
}
