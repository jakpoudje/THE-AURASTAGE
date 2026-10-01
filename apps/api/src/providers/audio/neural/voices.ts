// Speaker choice for AuraStage's neural voice (Piper). The voice models are multi-speaker (VCTK: British Isles accents;
// LibriTTS-R: American English), both CC BY 4.0. Each speaker's register was MEASURED at image build time
// (median pitch of a test sentence, scripts/piper-install.sh + piper-measure.mjs), so matching a character's Voice DNA
// to a speaker uses evidence, not guesses. Pure functions — unit-tested without the models.

export interface Speaker { model: string; id: number; f0: number; /** The speaker's name in the model (speaker_id_map), e.g. "awb". */ name?: string; /** A single-speaker model (no --speaker argument). */ single?: boolean }
export interface VoiceCatalogue { speakers: Speaker[] }
export interface VoicePick { model: string; speaker: number; f0: number; gender: "female" | "male"; reason: string; accent: string | null; single?: boolean }

/**
 * Accents the free, licence-clear voice models can actually speak (owner request 2026-10-01), from each corpus's
 * PUBLISHED speaker list — never guessed. CMU ARCTIC (free for any use; Piper en_US-arctic-medium): awb Scottish,
 * jmk Canadian, ksp Indian, bdl/clb/rms/slt American. OpenSLR 83 UK dialects (CC BY-SA 4.0; Piper
 * en_GB-northern_english_male-medium): Northern English. VCTK (CC BY 4.0): British Isles. LibriTTS-R (CC BY 4.0):
 * American. Corpora with non-commercial licences (e.g. L2-ARCTIC) are deliberately not used. Any other accent is said
 * plainly to need a paid voice provider.
 */
export const ACCENTS: { id: string; label: string; match: RegExp; voices: { model: string; names?: string[] }[] }[] = [
  { id: "scottish", label: "Scottish", match: /scot|glasgow|edinburgh|aberdeen|dundee/i, voices: [{ model: "en_US-arctic-medium", names: ["awb"] }] },
  { id: "northern_english", label: "Northern English", match: /northern english|yorkshire|manchester|mancunian|liverpool|scouse|geordie|newcastle|leeds|lancashire/i, voices: [{ model: "en_GB-northern_english_male-medium" }] },
  { id: "canadian", label: "Canadian", match: /canad|toronto|vancouver|montreal/i, voices: [{ model: "en_US-arctic-medium", names: ["jmk"] }] },
  { id: "south_asian", label: "Indian", match: /india|hindi|punjab|mumbai|delhi|bengal|tamil|gujarat/i, voices: [{ model: "en_US-arctic-medium", names: ["ksp"] }] },
  { id: "american", label: "American", match: /americ|\busa?\b|united states|new york|texas|california|chicago/i, voices: [{ model: "en_US-libritts_r-medium" }, { model: "en_US-arctic-medium", names: ["bdl", "clb", "rms", "slt"] }] },
  { id: "british", label: "British Isles", match: /brit|english|england|wales|welsh|irish|ireland|london|\buk\b|united kingdom/i, voices: [{ model: "en_GB-vctk-medium" }] },
];

/** The accent a character's Casting accent/nationality asks for, if a free voice model can speak it. */
export function accentFor(text: string | null | undefined) {
  const t = (text ?? "").trim();
  return t ? ACCENTS.find((a) => a.match.test(t)) ?? null : null;
}

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
export function pickSpeaker(cat: VoiceCatalogue, dna: { language: string; gender: "female" | "male" | "unspecified"; pitch: number }, name: string, accentText: string | null = null): VoicePick | null {
  const model = dna.language === "en-us" ? "en_US-libritts_r-medium" : "en_GB-vctk-medium";
  // The character's accent first (only speakers a published corpus list says have it), then the language default.
  const acc = accentFor(accentText);
  const h = hash(name.trim().toLowerCase());
  const gender = dna.gender === "unspecified" ? (h % 2 ? "female" : "male") : dna.gender;
  const isGender = (x: Speaker) => (gender === "female" ? x.f0 >= GENDER_SPLIT_HZ : x.f0 < GENDER_SPLIT_HZ);
  const inAccent = acc ? cat.speakers.filter((x) => acc.voices.some((v) => v.model === x.model && (!v.names || (x.name && v.names.some((n) => new RegExp(`(^|[^a-z])${n}([^a-z]|$)`, "i").test(x.name!)))))) : [];
  // An accent is only used when it has a voice of the character's gender (never a man's voice for a woman to keep an accent).
  const accented = inAccent.some(isGender) ? inAccent : [];
  const pool0 = accented.length ? accented : cat.speakers.filter((x) => x.model === model);
  const pool1 = pool0.length ? pool0 : cat.speakers;
  if (!pool1.length) return null;
  const same = pool1.filter(isGender);
  const pool = same.length ? same : pool1;
  // Voice DNA pitch 0–99 → a target register inside the gender's usual range.
  const [lo, hi] = gender === "female" ? [165, 255] : [85, 160];
  const target = lo + ((hi - lo) * Math.max(0, Math.min(99, dna.pitch))) / 99;
  const ranked = [...pool].sort((a, b) => Math.abs(a.f0 - target) - Math.abs(b.f0 - target) || a.id - b.id);
  // Among the closest few, the character's name decides — so two similar characters don't share one voice.
  const near = ranked.slice(0, Math.min(4, ranked.length));
  const s = near[h % near.length];
  const accentLabel = accented.length ? acc!.label : null;
  const where = accentLabel ? `${accentLabel} English` : model.startsWith("en_US") ? "American" : "British Isles";
  const note = acc && !accented.length ? ` — no free ${acc.label} ${gender} voice is installed on this server, so the nearest default is used` : !acc && accentText ? ` — no free voice speaks a ${accentText} accent yet; a paid voice provider can match it` : "";
  return {
    model: s.model, speaker: s.id, f0: s.f0, gender, accent: accentLabel, single: !!s.single,
    reason: `${where} speaker ${s.name ?? s.id}, measured at ${Math.round(s.f0)} Hz (target ${Math.round(target)} Hz for a ${gender} voice at register ${dna.pitch}/99)${note}`,
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
