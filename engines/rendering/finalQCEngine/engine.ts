// engines/rendering/finalQCEngine
// Checks every produced file against the manifest and the delivery profile.
// Blocking checks decide "QC passed"; loudness is advisory because a render
// never re-levels an approved mix (the Audio Studio owns the mix).
import type { DeliveryQCCheck } from "@aurastage/contracts";
import { CODEC_NAMES, DURATION_TOLERANCE_FRAMES } from "./rules";
import { validateFinalQCInput } from "./validator";
import { ENGINE_VERSION } from "./version";
import type { FinalQCOutput } from "./output.schema";

export function finalQCEngine(raw: unknown): FinalQCOutput {
  const { profile: p, fps, duration_frames, expected_files, expected_cues, files } = validateFinalQCInput(raw);
  const checks: DeliveryQCCheck[] = [];
  const add = (c: DeliveryQCCheck) => checks.push(c);
  const secs = duration_frames / fps, tol = DURATION_TOLERANCE_FRAMES / fps + 1e-3;
  const byName = new Map(files.map((f) => [f.name, f]));

  const absent = expected_files.filter((n) => !byName.get(n) || byName.get(n)!.bytes <= 0);
  const unsummed = files.filter((f) => !f.sha256);
  add({ id: "package_complete", label: "Every file of the package is present", ok: absent.length === 0, blocking: true, evidence: absent.length ? `Missing: ${absent.join(", ")}` : `${expected_files.length} file${expected_files.length === 1 ? "" : "s"}`, file: null });
  add({ id: "checksums", label: "Every file has a SHA-256 checksum", ok: unsummed.length === 0 && files.length > 0, blocking: true, evidence: unsummed.length ? `No checksum: ${unsummed.map((f) => f.name).join(", ")}` : "Recorded", file: null });

  for (const f of files) {
    if (p.video && f.video !== undefined && (f.name.endsWith(".mp4") || f.name.endsWith(".mov"))) {
      const v = f.video;
      add({ id: `video_format:${f.name}`, label: `Picture is ${p.video.codec === "prores" ? "ProRes" : "H.264"} ${p.video.width}×${p.video.height} ${p.video.pix_fmt}`, ok: !!v && (CODEC_NAMES[p.video.codec] ?? []).includes(v.codec) && v.width === p.video.width && v.height === p.video.height && v.pix_fmt === p.video.pix_fmt, blocking: true, evidence: v ? `${v.codec} ${v.width}×${v.height} ${v.pix_fmt}` : "No video stream", file: f.name });
      add({ id: `frame_rate:${f.name}`, label: `Frame rate is ${fps} fps`, ok: !!v && Math.abs(v.fps - fps) < 0.01, blocking: true, evidence: v ? `${v.fps.toFixed(3)} fps` : "No video stream", file: f.name });
      add({ id: `video_duration:${f.name}`, label: "Picture runs exactly as long as the locked cut", ok: !!v && Math.abs(v.duration - secs) <= tol, blocking: true, evidence: v ? `${v.duration.toFixed(3)} s vs ${secs.toFixed(3)} s` : "No video stream", file: f.name });
    }
    if (p.audio && (f.name.endsWith(".mp4") || f.name.endsWith(".mov") || f.name.endsWith(".wav"))) {
      const a = f.audio;
      add({ id: `audio_format:${f.name}`, label: `Sound is ${p.audio.codec === "aac" ? "AAC" : "24-bit PCM"} 48 kHz stereo`, ok: !!a && (CODEC_NAMES[p.audio.codec] ?? []).includes(a.codec) && a.sample_rate === 48000 && a.channels === 2, blocking: true, evidence: a ? `${a.codec} ${a.sample_rate} Hz ${a.channels} ch` : "No audio stream", file: f.name });
      add({ id: `audio_duration:${f.name}`, label: "Sound runs exactly as long as the locked cut", ok: !!a && Math.abs(a.duration - secs) <= tol + 0.05, blocking: true, evidence: a ? `${a.duration.toFixed(3)} s vs ${secs.toFixed(3)} s` : "No audio stream", file: f.name });
      if (p.loudness && f.loudness && (f.name.endsWith(".mp4") || f.name.endsWith(".mov") || f.name === "mix.wav")) {
        const I = f.loudness.integrated_lufs, TP = f.loudness.true_peak_dbtp;
        add({ id: `loudness:${f.name}`, label: `Loudness ${p.loudness.integrated_lufs} LUFS ±${p.loudness.tolerance_lu} (EBU R128)`, ok: I !== null && Math.abs(I - p.loudness.integrated_lufs) <= p.loudness.tolerance_lu, blocking: false, evidence: I === null ? "Silent" : `${I.toFixed(1)} LUFS`, file: f.name });
        add({ id: `true_peak:${f.name}`, label: `True peak ≤ ${p.loudness.max_true_peak_dbtp} dBTP`, ok: TP !== null && TP <= p.loudness.max_true_peak_dbtp, blocking: false, evidence: TP === null ? "No signal" : `${TP.toFixed(1)} dBTP`, file: f.name });
      }
    }
    if ((f.name.endsWith(".srt") || f.name.endsWith(".vtt")) && expected_cues !== null) {
      add({ id: `subtitles:${f.name}`, label: "Subtitle file reads back with every cue", ok: f.cues === expected_cues, blocking: true, evidence: `${f.cues ?? 0} of ${expected_cues} cues`, file: f.name });
    }
  }
  return { checks, passed: checks.filter((c) => c.blocking).every((c) => c.ok), engine_version: ENGINE_VERSION };
}
