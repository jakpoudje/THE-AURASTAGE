// Speaker choice for AuraStage's neural voice (Piper). The voice models are multi-speaker (VCTK: British Isles accents;
// LibriTTS-R: American English), both CC BY 4.0. Each speaker's register was MEASURED at image build time
// (median pitch of a test sentence, scripts/piper-install.sh + piper-measure.mjs), so matching a character's Voice DNA
// to a speaker uses evidence, not guesses. Pure functions — unit-tested without the models.

export interface Speaker { model: string; id: number; f0: number }
export interface VoiceCatalogue { speakers: Speaker[] }
export interface VoicePick { model: string; speaker: number; f0: number; gender: "female" | "male"; reason: string }

/** Median F0 (Hz) of voiced 40 ms frames by normalised autocorrelation; null if too little voicing. */
export function medianF0(samples: Float32Array, rate: number): number | null {
  const frame = Math.round(rate * 0.04), hop = Math.round(rate * 0.02);
  const minLag = Math.floor(rate / 400), maxLag = Math.ceil(rate / 70);
  const f0s: number[] = [];
  for (let start = 0; start + frame + maxLag < samples.length; start += hop) {
    let energy = 0;
    for (let i = 0; i < frame; i++) energy += samples[start + i] ** 2;
    if (energy / frame < 1e-4) continue; // silence
    const rs: number[] = [];
    let best = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let num = 0, e2 = 0;
      for (let i = 0; i < frame; i++) { num += samples[start + i] * samples[start + i + lag]; e2 += samples[start + i + lag] ** 2; }
      const r = num / Math.sqrt(energy * e2 + 1e-12);
      rs.push(r);
      if (r > best) best = r;
    }
    if (best <= 0.6) continue;
    // Multiples of the period correlate almost as well; the shortest strong peak is the true pitch (no octave errors).
    let bestLag = 0;
    for (let k = 1; k < rs.length - 1; k++) if (rs[k] >= best * 0.9 && rs[k] >= rs[k - 1] && rs[k] >= rs[k + 1]) { bestLag = minLag + k; break; }
    if (bestLag) f0s.push(rate / bestLag);
  }
  if (f0s.length < 5) return null;
  f0s.sort((a, b) => a - b);
  return f0s[Math.floor(f0s.length / 2)];
}

/** 16-bit PCM mono WAV → samples in [-1, 1]. */
export function wavSamples(buf: Uint8Array): { samples: Float32Array; rate: number } {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const rate = v.getUint32(24, true);
  let o = 12;
  while (o + 8 <= buf.length) {
    const id = String.fromCharCode(buf[o], buf[o + 1], buf[o + 2], buf[o + 3]);
    const size = v.getUint32(o + 4, true);
    if (id === "data") {
      const n = Math.min(size, buf.length - o - 8) >> 1, out = new Float32Array(n);
      for (let i = 0; i < n; i++) out[i] = v.getInt16(o + 8 + i * 2, true) / 32768;
      return { samples: out, rate };
    }
    o += 8 + size;
  }
  return { samples: new Float32Array(0), rate };
}

/** A pitch above this reads as a female voice; below it as male (the usual adult split). */
export const GENDER_SPLIT_HZ = 165;
const hash = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0; return h; };

/**
 * Picks the speaker for a character from their BASE Voice DNA (profile only), so the same character keeps the same
 * speaker in every line; each line's emotion then changes delivery (pace, energy), never the person.
 */
export function pickSpeaker(cat: VoiceCatalogue, dna: { language: string; gender: "female" | "male" | "unspecified"; pitch: number }, name: string): VoicePick | null {
  const model = dna.language === "en-us" ? "en_US-libritts_r-medium" : "en_GB-vctk-medium";
  const pool0 = cat.speakers.filter((s) => s.model === model);
  const pool1 = pool0.length ? pool0 : cat.speakers;
  if (!pool1.length) return null;
  const h = hash(name.trim().toLowerCase());
  const gender = dna.gender === "unspecified" ? (h % 2 ? "female" : "male") : dna.gender;
  const same = pool1.filter((s) => (gender === "female" ? s.f0 >= GENDER_SPLIT_HZ : s.f0 < GENDER_SPLIT_HZ));
  const pool = same.length ? same : pool1;
  // Voice DNA pitch 0–99 → a target register inside the gender's usual range.
  const [lo, hi] = gender === "female" ? [165, 255] : [85, 160];
  const target = lo + ((hi - lo) * Math.max(0, Math.min(99, dna.pitch))) / 99;
  const ranked = [...pool].sort((a, b) => Math.abs(a.f0 - target) - Math.abs(b.f0 - target) || a.id - b.id);
  // Among the closest few, the character's name decides — so two similar characters don't share one voice.
  const near = ranked.slice(0, Math.min(4, ranked.length));
  const s = near[h % near.length];
  return {
    model: s.model, speaker: s.id, f0: s.f0, gender,
    reason: `${model.startsWith("en_US") ? "American" : "British Isles"} speaker ${s.id}, measured at ${Math.round(s.f0)} Hz (target ${Math.round(target)} Hz for a ${gender} voice at register ${dna.pitch}/99)`,
  };
}

/** Delivery from the line's Voice DNA (speed words/min, amplitude) relative to the base. */
export function prosody(line: { speed: number; amplitude: number }) {
  return {
    length_scale: Math.round(Math.max(0.7, Math.min(1.45, 168 / Math.max(80, line.speed))) * 100) / 100,
    noise_scale: Math.round(Math.max(0.45, Math.min(0.9, 0.667 * (0.85 + (line.amplitude - 110) / 400))) * 1000) / 1000,
    gain: Math.round(Math.max(0.4, Math.min(1.6, line.amplitude / 110)) * 100) / 100,
  };
}
