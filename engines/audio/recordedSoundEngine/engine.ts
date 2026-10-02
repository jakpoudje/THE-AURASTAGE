// engines/audio/recordedSoundEngine — real recordings for a planned cue (owner request 2026-10-02: "we want … real life
// prop sounds"). AuraStage keeps a built-in library of field recordings (public domain / CC0, fetched and screened at
// image build — apps/api/scripts/sfx-install.mjs). This engine reads the cue's words, chooses which recordings it needs
// (rain + traffic + crowd for a street at night; a door then footsteps for "she slams the door and walks out"), and
// lays them out: backgrounds looped with equal-power crossfades and spread across the stereo field, events placed one
// after another. `planRecordedSound` decides (pure, no samples); `renderRecordedSound` mixes the decoded samples.
// When nothing in the cue matches the library, the plan is null and the caller uses the synthesiser — said, never hidden.
import { SOUND_CATEGORIES, categoryById, type SoundCategory } from "./categories";
import { RecordedSoundInputSchema, type LibraryClip, type RecordedSoundInput } from "./input.schema";
import { ENGINE_VERSION } from "./version";

export interface PlannedLayer {
  clip_id: string;
  category: string;
  label: string;
  /** Background (looped) or one event. */
  bed: boolean;
  /** Where the layer starts in the output, seconds. */
  at_seconds: number;
  gain_db: number;
  /** -1 left … 1 right. */
  pan: number;
  /** The cue words that asked for it. */
  because: string;
}
export interface RecordedSoundPlan {
  layers: PlannedLayer[];
  /** A quiet room tone under an interior background (the synthesiser makes it). */
  room_tone: "interior" | "exterior" | null;
  /** Words in the cue the library has no recording for (said in the result). */
  missing: string[];
  engine_version: string;
}

const hash = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0; return h; };
const MAX_BEDS = 4, MAX_EVENTS = 3;

/** Categories the cue asks for, in the order the words appear in the cue (so "knocks, then the door opens" stays in order). */
function wanted(description: string) {
  const out: { c: SoundCategory; word: string; at: number }[] = [];
  for (const c of SOUND_CATEGORIES) {
    const m = c.words.exec(description);
    if (m) out.push({ c, word: m[0], at: m.index });
  }
  return out.sort((a, b) => a.at - b.at);
}

export function planRecordedSound(raw: unknown): RecordedSoundPlan | null {
  const input: RecordedSoundInput = RecordedSoundInputSchema.parse(raw);
  const byCat = new Map<string, LibraryClip[]>();
  for (const c of input.library) byCat.set(c.category, [...(byCat.get(c.category) ?? []), c]);
  for (const list of byCat.values()) list.sort((a, b) => a.id.localeCompare(b.id));
  const pick = (cat: string, salt: string) => {
    const list = byCat.get(cat);
    return list?.length ? list[hash(`${input.seed}:${salt}`) % list.length] : null;
  };
  const asked = wanted(input.description);
  const missing = asked.filter((w) => !byCat.has(w.c.id)).map((w) => w.word);
  const have = asked.filter((w) => byCat.has(w.c.id));
  const d = input.duration_seconds;
  const layers: PlannedLayer[] = [];

  if (input.kind === "ambience") {
    const beds = have.filter((w) => w.c.bed).slice(0, MAX_BEDS);
    if (!beds.length) return null;
    beds.forEach((w, i) => {
      const clip = pick(w.c.id, `${w.c.id}`)!;
      // Backgrounds are spread a little across the stereo field so they don't pile up in the middle.
      layers.push({ clip_id: clip.id, category: w.c.id, label: w.c.label, bed: true, at_seconds: 0, gain_db: w.c.level_db, pan: beds.length === 1 ? 0 : -0.5 + i / (beds.length - 1), because: `“${w.word}”` });
    });
    // Thunder in a storm: one roll somewhere in the middle of the cue.
    const thunder = have.find((w) => w.c.id === "thunder");
    if (thunder && d > 4) {
      const clip = pick("thunder", "thunder")!;
      layers.push({ clip_id: clip.id, category: "thunder", label: "distant thunder", bed: false, at_seconds: Math.round(d * (0.3 + (hash(`${input.seed}:t`) % 40) / 100) * 100) / 100, gain_db: -6, pan: 0.2, because: `“${thunder.word}”` });
    }
    const interior = /\binterior\b|\bint\b|\binside\b/i.test(input.description);
    return { layers, room_tone: interior ? "interior" : "exterior", missing, engine_version: ENGINE_VERSION };
  }

  // Effects and Foley: the events the cue names, one after another; a background word alone (e.g. "fire crackling")
  // plays that background for the length of the cue.
  const events = have.filter((w) => !w.c.bed).slice(0, MAX_EVENTS);
  const chosen = events.length ? events : have.filter((w) => w.c.bed).slice(0, 1);
  if (!chosen.length) return null;
  let t = 0.05;
  for (const w of chosen) {
    const clip = pick(w.c.id, `${w.c.id}:${t}`)!;
    const bed = w.c.bed || (w.c.id === "footsteps" && d > clip.seconds + 0.5);
    layers.push({ clip_id: clip.id, category: w.c.id, label: w.c.label, bed, at_seconds: Math.round(t * 100) / 100, gain_db: w.c.level_db, pan: 0, because: `“${w.word}”` });
    if (bed) break; // a looped layer fills the rest of the cue
    t += Math.min(clip.seconds, Math.max(0.6, (d - t) / (chosen.length - layers.length + 1))) + 0.15;
    if (t >= d - 0.2) break;
  }
  return { layers, room_tone: null, missing, engine_version: ENGINE_VERSION };
}

/** Equal-power fade shapes. */
const fin = (x: number) => Math.sin((x * Math.PI) / 2), fout = (x: number) => Math.cos((x * Math.PI) / 2);

/**
 * Mixes the plan from the decoded recordings (mono samples at `sample_rate`). Backgrounds loop with an equal-power
 * crossfade; events play once with a short fade-out if the cue ends first. The result peaks at −3 dBFS.
 */
export function renderRecordedSound(plan: RecordedSoundPlan, sources: Record<string, Float32Array>, duration_seconds: number, sample_rate = 48000) {
  const n = Math.max(1, Math.round(duration_seconds * sample_rate));
  const L = new Float32Array(n), R = new Float32Array(n);
  const xf = Math.round(1.5 * sample_rate);
  for (const layer of plan.layers) {
    const src = sources[layer.clip_id];
    if (!src || !src.length) continue;
    const g = Math.pow(10, layer.gain_db / 20);
    // Constant-power pan.
    const a = ((layer.pan + 1) / 2) * (Math.PI / 2), gl = Math.cos(a) * g, gr = Math.sin(a) * g;
    const start = Math.max(0, Math.round(layer.at_seconds * sample_rate));
    if (layer.bed) {
      // Loop: each pass overlaps the previous one by the crossfade (or a quarter of the recording if it is short).
      const fade = Math.min(xf, Math.floor(src.length / 4));
      const step = Math.max(1, src.length - fade);
      for (let pass = 0; start + pass * step < n; pass++) {
        const off = start + pass * step;
        for (let i = 0; i < src.length && off + i < n; i++) {
          const k = pass > 0 && i < fade ? fin(i / fade) : 1;
          const e = src.length - i <= fade && off + src.length < n ? fout(1 - (src.length - i) / fade) : 1;
          const s = src[i] * k * e;
          L[off + i] += s * gl; R[off + i] += s * gr;
        }
      }
    } else {
      const len = Math.min(src.length, n - start), tail = Math.min(Math.round(0.08 * sample_rate), len);
      for (let i = 0; i < len; i++) {
        const e = start + src.length > n && i >= len - tail ? (len - i) / tail : 1;
        L[start + i] += src[i] * gl * e; R[start + i] += src[i] * gr * e;
      }
    }
  }
  // Fades at the edges of a background cue so it can be laid end to end; then a safe peak.
  const edge = Math.min(Math.round(0.05 * sample_rate), Math.floor(n / 4));
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const g = plan.layers.some((l) => l.bed) ? Math.min(1, (i + 1) / edge, (n - i) / edge) : Math.min(1, (n - i) / edge);
    L[i] *= g; R[i] *= g;
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const target = Math.pow(10, -3 / 20);
  if (peak > 0) { const k = target / peak; for (let i = 0; i < n; i++) { L[i] *= k; R[i] *= k; } }
  return { sample_rate, channels: [L, R] as [Float32Array, Float32Array], duration_seconds: n / sample_rate, peak_db: peak > 0 ? -3 : -Infinity };
}

export { categoryById };
