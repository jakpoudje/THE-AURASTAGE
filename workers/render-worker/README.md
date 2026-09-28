# render-worker (Export & Deliver)

Consumes renders from the MOS queue (migration 0018) — the only place deliverables
are produced (CLAUDE.md rule 8). Railway service `render-worker`
(`RAILWAY_DOCKERFILE_PATH=workers/render-worker/Dockerfile`, restart ALWAYS).

Loop: `worker_claim_render` → render from the immutable RenderManifest →
measure every file → final QC (`engines/rendering/finalQCEngine`) → upload to the
private media bucket → `worker_complete_render` (or `worker_fail_render`).

## How a deliverable is made
- **Sound:** recordings are decoded to 48 kHz float with ffmpeg and mixed by
  `timelineAudioMixEngine` — the same maths as the Audio Studio's browser mix
  (clip gain + linear fades, track gain, Web Audio equal-power pan, mute/solo) —
  in 10-second chunks written straight to a 24-bit WAV.
- **Picture:** each segment (approved take or black) becomes a lossless
  intermediate of exactly its frame count (SVG takes rasterised with resvg,
  grade applied in RGB, one Rec.709 conversion), joined without re-encoding, then
  encoded once: H.264 High (streaming/review) or ProRes 422 HQ (mezzanine).
  Review copies can carry a watermark and burned-in timecode.
- **QC:** ffprobe (codec, size, pixel format, frame rate, duration), ffmpeg
  `ebur128` (integrated loudness, true peak, LRA — an independent meter), SHA-256
  of every file, subtitle cue read-back.

Progress is reported every ~2 s; the heartbeat also returns "cancel requested",
which stops ffmpeg. Completing twice is a no-op; a render with no heartbeat for
30 minutes is re-claimed (max 3 attempts).

## Env
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `WORKER_TOKEN` (its SHA-256 is in
`worker_credentials` as `render-worker`), `MEDIA_BUCKET`, `MEDIA_ENDPOINT`,
`MEDIA_REGION`, `MEDIA_ACCESS_KEY_ID`, `MEDIA_SECRET_ACCESS_KEY`.

## Tests
`src/render.test.ts` renders every profile with the real ffmpeg (skipped only if
ffmpeg is missing) and checks QC, captions, black gaps, grade, stems and cancel.

## Limits (tracked)
Single-file uploads (PutObject) are limited to 5 GB — long ProRes masters need
multipart upload. Recordings are held in memory while mixing.
