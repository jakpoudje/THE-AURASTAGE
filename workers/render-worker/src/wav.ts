// Streaming 24-bit PCM stereo WAV writer: the mix is produced in chunks, so
// memory stays bounded whatever the film length.
import { closeSync, openSync, writeSync } from "node:fs";

export function writeWav24(path: string, sampleRate: number, totalSamples: number, chunk: number, produce: (start: number, length: number) => [Float32Array, Float32Array], onChunk?: (done: number) => void) {
  const dataBytes = totalSamples * 2 * 3;
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + dataBytes, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * 6, 28); h.writeUInt16LE(6, 32); h.writeUInt16LE(24, 34); h.write("data", 36); h.writeUInt32LE(dataBytes, 40);
  const fd = openSync(path, "w");
  let clipped = 0;
  try {
    writeSync(fd, h);
    for (let start = 0; start < totalSamples; start += chunk) {
      const n = Math.min(chunk, totalSamples - start);
      const [L, R] = produce(start, n);
      const b = Buffer.alloc(n * 6);
      for (let i = 0; i < n; i++) {
        for (let c = 0; c < 2; c++) {
          let v = (c === 0 ? L : R)[i];
          if (v > 1 || v < -1) (clipped++, (v = Math.max(-1, Math.min(1, v))));
          const s = Math.max(-8388608, Math.min(8388607, Math.round(v * 8388607)));
          b.writeIntLE(s, i * 6 + c * 3, 3);
        }
      }
      writeSync(fd, b);
      onChunk?.(start + n);
    }
  } finally {
    closeSync(fd);
  }
  return { clipped_samples: clipped };
}
