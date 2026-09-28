// apps/api/src/modules/assets/assets.validator.ts
// Domain: Assets Library
export class AssetValidationError extends Error {
  code = "AURA-AST-002";
}
export class AssetNotFoundError extends Error {
  code = "AURA-AST-404";
}
export class AssetNotReadyError extends Error {
  code = "AURA-AST-412";
}

export const MAX_AUDIO_BYTES = 50 * 1024 * 1024;

const AUDIO_TYPES: Record<string, string> = {
  "audio/wav": "wav", "audio/x-wav": "wav", "audio/wave": "wav", "audio/mpeg": "mp3", "audio/mp3": "mp3",
  "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/aac": "aac", "audio/ogg": "ogg", "audio/webm": "webm", "audio/flac": "flac", "audio/x-flac": "flac",
};

/** Checks the bytes really are audio (magic numbers), not just the declared type. */
export function sniffAudio(buf: Buffer, declared: string): { ext: string; media_type: string } {
  const type = declared.split(";")[0].trim().toLowerCase();
  const ext = AUDIO_TYPES[type];
  if (!ext) throw new AssetValidationError("Only audio files can be added here (WAV, MP3, M4A/AAC, OGG, WebM, FLAC).");
  if (buf.length < 12) throw new AssetValidationError("That file is empty or too small to be audio.");
  const ascii = (a: number, b: number) => buf.subarray(a, b).toString("latin1");
  const ok =
    (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") ||
    ascii(0, 3) === "ID3" || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) || // MP3 / ADTS AAC
    ascii(4, 8) === "ftyp" || // MP4 / M4A
    ascii(0, 4) === "OggS" || ascii(0, 4) === "fLaC" ||
    (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3); // WebM/Matroska
  if (!ok) throw new AssetValidationError("That file doesn't look like audio — its contents don't match an audio format.");
  return { ext, media_type: type };
}

export function cleanName(name: unknown) {
  const n = String(name ?? "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 200);
  if (!n) throw new AssetValidationError("Give the recording a name.");
  return n;
}
