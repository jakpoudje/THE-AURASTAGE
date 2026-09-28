// Tolerances for delivery QC (SRS §12 Final QC: picture, audio, subtitle and package integrity).
/** Container durations may differ from the manifest by at most this many frames. */
export const DURATION_TOLERANCE_FRAMES = 1;
export const CODEC_NAMES: Record<string, string[]> = { h264: ["h264"], prores: ["prores"], aac: ["aac"], pcm_s24le: ["pcm_s24le"] };
