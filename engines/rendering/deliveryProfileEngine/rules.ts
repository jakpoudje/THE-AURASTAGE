// Versioned delivery profiles (SRS §15 deliveryProfileEngine). Only formats the
// render worker can really produce are "available"; the rest say why not.
import type { DeliveryProfile } from "./output.schema";
import { ENGINE_VERSION as V } from "./version";

const R128 = { integrated_lufs: -23, tolerance_lu: 1, max_true_peak_dbtp: -1 };
const none = { watermark: false, burn_timecode: false, subtitles_sidecar: false };

export const PROFILES: DeliveryProfile[] = [
  {
    id: "streaming_master", version: V, label: "Streaming Master", category: "streaming",
    description: "MP4 · H.264 High · 1920×1080 · 24 fps · Rec.709 SDR · AAC 48 kHz stereo 320 kb/s, with SRT captions",
    available: true, unavailable_reason: null, container: "mp4",
    video: { codec: "h264", width: 1920, height: 1080, pix_fmt: "yuv420p", quality: "CRF 18, High profile", color: "Rec.709 SDR" },
    audio: { codec: "aac", sample_rate: 48000, channels: 2, bitrate: "320k" }, loudness: R128,
    files: ["streaming_1080p24.mp4", "captions.srt"], supports: { ...none, subtitles_sidecar: true },
  },
  {
    id: "review_copy", version: V, label: "Review Copy", category: "review",
    description: "MP4 · H.264 · 1280×720 · 24 fps · AAC 192 kb/s — optional watermark and burned-in timecode for notes",
    available: true, unavailable_reason: null, container: "mp4",
    video: { codec: "h264", width: 1280, height: 720, pix_fmt: "yuv420p", quality: "CRF 23", color: "Rec.709 SDR" },
    audio: { codec: "aac", sample_rate: 48000, channels: 2, bitrate: "192k" }, loudness: R128,
    files: ["review_720p24.mp4"], supports: { watermark: true, burn_timecode: true, subtitles_sidecar: false },
  },
  {
    id: "mezzanine_master", version: V, label: "Mezzanine Master (ProRes)", category: "master",
    description: "MOV · Apple ProRes 422 HQ · 1920×1080 · 24 fps · 10-bit 4:2:2 · PCM 24-bit 48 kHz stereo",
    available: true, unavailable_reason: null, container: "mov",
    video: { codec: "prores", width: 1920, height: 1080, pix_fmt: "yuv422p10le", quality: "ProRes 422 HQ", color: "Rec.709 SDR" },
    audio: { codec: "pcm_s24le", sample_rate: 48000, channels: 2, bitrate: null }, loudness: R128,
    files: ["master_prores422hq_1080p24.mov"], supports: none,
  },
  {
    id: "audio_package", version: V, label: "Audio Package (mix, stems, M&E)", category: "audio",
    description: "WAV · 48 kHz · 24-bit stereo — full mix, DX / FX / BG / MX stems and an M&E (everything but dialogue)",
    available: true, unavailable_reason: null, container: "wav", video: null,
    audio: { codec: "pcm_s24le", sample_rate: 48000, channels: 2, bitrate: null }, loudness: R128,
    files: ["mix.wav", "stem_DX.wav", "stem_FX.wav", "stem_BG.wav", "stem_MX.wav", "ME.wav"], supports: none,
  },
  {
    id: "subtitles", version: V, label: "Subtitles", category: "subtitles",
    description: "SRT and WebVTT from the approved dialogue, timed to where each line is heard in the locked cut",
    available: true, unavailable_reason: null, container: "srt+vtt", video: null, audio: null, loudness: null,
    files: ["subtitles.srt", "subtitles.vtt"], supports: none,
  },
  {
    id: "edit_decision_list", version: V, label: "Edit Decision List", category: "editorial",
    description: "CMX 3600 EDL of the locked cut, for conform in other editors",
    available: true, unavailable_reason: null, container: "edl", video: null, audio: null, loudness: null,
    files: ["picture_lock.edl"], supports: none,
  },
  {
    id: "dcp_theatrical", version: V, label: "Theatrical Master (DCP)", category: "cinema",
    description: "Digital Cinema Package (JPEG 2000, XYZ, MXF)", available: false,
    unavailable_reason: "DCP packaging (JPEG 2000 in XYZ colour, MXF wrapping, CPL/PKL) isn't built yet.",
    container: null, video: null, audio: null, loudness: null, files: [], supports: none,
  },
  {
    id: "hdr_4k", version: V, label: "Streaming Master (4K HDR)", category: "streaming",
    description: "3840×2160 HDR10", available: false,
    unavailable_reason: "The project's pictures are 1080p SDR — there's no 4K HDR material to master from.",
    container: null, video: null, audio: null, loudness: null, files: [], supports: none,
  },
  {
    id: "broadcast_mxf", version: V, label: "Broadcast Master (MXF)", category: "broadcast",
    description: "XDCAM HD / AS-11 MXF", available: false,
    unavailable_reason: "MXF / AS-11 broadcast packaging isn't built yet.",
    container: null, video: null, audio: null, loudness: null, files: [], supports: none,
  },
  {
    id: "social_vertical", version: V, label: "Social Pack (9:16)", category: "social",
    description: "Vertical 1080×1920 cut-downs", available: false,
    unavailable_reason: "Needs per-shot vertical reframing, which isn't built yet.",
    container: null, video: null, audio: null, loudness: null, files: [], supports: none,
  },
];
