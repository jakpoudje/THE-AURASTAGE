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

export class AssetConflictError extends Error {
  code = "AURA-AST-409";
}

/** Library uploads (any type). Audio keeps its own sniffing above. */
export const MAX_ASSET_BYTES = 50 * 1024 * 1024;
const OTHER_TYPES: Record<string, { ext: string; type: "image" | "video" | "document"; ok: (b: Buffer) => boolean }> = {
  "image/png": { ext: "png", type: "image", ok: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  "image/jpeg": { ext: "jpg", type: "image", ok: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/webp": { ext: "webp", type: "image", ok: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
  "image/gif": { ext: "gif", type: "image", ok: (b) => /^GIF8[79]a$/.test(b.subarray(0, 6).toString("latin1")) },
  "video/mp4": { ext: "mp4", type: "video", ok: (b) => b.subarray(4, 8).toString("latin1") === "ftyp" },
  "video/quicktime": { ext: "mov", type: "video", ok: (b) => ["ftyp", "moov", "wide", "mdat"].includes(b.subarray(4, 8).toString("latin1")) },
  "video/webm": { ext: "webm", type: "video", ok: (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 },
  "application/pdf": { ext: "pdf", type: "document", ok: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  "text/plain": { ext: "txt", type: "document", ok: (b) => !b.subarray(0, 4096).includes(0) },
  "text/csv": { ext: "csv", type: "document", ok: (b) => !b.subarray(0, 4096).includes(0) },
  "application/x-cube": { ext: "cube", type: "document", ok: (b) => /LUT_3D_SIZE|LUT_1D_SIZE/.test(b.subarray(0, 65536).toString("latin1")) },
};
export const LIBRARY_CONTENT_TYPES = [...Object.keys(OTHER_TYPES), "audio/*"];

/** What a library upload really is, from its contents. */
export function sniffAsset(buf: Buffer, declared: string): { ext: string; media_type: string; type: "audio" | "image" | "video" | "document" } {
  const t = declared.split(";")[0].trim().toLowerCase();
  if (!Buffer.isBuffer(buf) || buf.length === 0) throw new AssetValidationError("No file was received.");
  if (buf.length > MAX_ASSET_BYTES) throw new AssetValidationError("That file is larger than 50 MB.");
  if (t.startsWith("audio/")) return { ...sniffAudio(buf, t), type: "audio" };
  const k = OTHER_TYPES[t];
  if (!k) throw new AssetValidationError("That kind of file can't be added yet. Images (PNG, JPEG, WebP, GIF), video (MP4, MOV, WebM), audio, PDF, text/CSV and .cube LUTs are supported.");
  if (buf.length < 8 || !k.ok(buf)) throw new AssetValidationError("That file's contents don't match its type.");
  return { ext: k.ext, media_type: t, type: k.type };
}
