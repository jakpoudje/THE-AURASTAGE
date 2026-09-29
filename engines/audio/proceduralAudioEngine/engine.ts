// engines/audio/proceduralAudioEngine — AuraStage's built-in sound generator. It turns a planned cue (ambience,
// effect, Foley or score) into real stereo audio by synthesis: filtered noise for rain, wind, sea and room tone,
// shaped bursts for footsteps, knocks and thunder, and chord pads for score in a key and tempo chosen from the mood.
// It is honest about what it is: synthesised placeholder-quality sound for timing, mixing and testing the whole
// pipeline — every layer it used is listed as evidence, and nothing claims to be a recording or AI.
import { ProceduralAudioInputSchema, type ProceduralAudioInput } from "./input.schema";
import { ENGINE_VERSION } from "./version";

export interface ProceduralAudioOutput {
  sample_rate: number;
  channels: [Float32Array, Float32Array];
  duration_seconds: number;
  /** What was synthesised and why (the words that triggered each layer). */
  layers: { name: string; because: string }[];
  peak_db: number;
  engine_version: string;
}

// ---- deterministic randomness ----
function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const TAU = Math.PI * 2;

/** One-pole low-pass state helper. */
const lp = (cut: number, sr: number) => { const k = 1 - Math.exp((-TAU * cut) / sr); let y = 0; return (x: number) => (y += k * (x - y)); };
const hp = (cut: number, sr: number) => { const f = lp(cut, sr); return (x: number) => x - f(x); };

type Buf = { L: Float32Array; R: Float32Array; sr: number; n: number; rand: () => number };
const add = (b: Buf, i: number, l: number, r = l) => { if (i >= 0 && i < b.n) { b.L[i] += l; b.R[i] += r; } };

// ---- ambience layers ----
function roomTone(b: Buf, level: number) {
  const f1 = lp(180, b.sr), f2 = lp(180, b.sr);
  for (let i = 0; i < b.n; i++) add(b, i, f1(b.rand() * 2 - 1) * level, f2(b.rand() * 2 - 1) * level);
}
function rain(b: Buf, heavy: boolean) {
  const fl = hp(900, b.sr), fr = hp(900, b.sr), sl = lp(6000, b.sr), sr = lp(6000, b.sr);
  const bed = heavy ? 0.22 : 0.12;
  for (let i = 0; i < b.n; i++) add(b, i, sl(fl(b.rand() * 2 - 1)) * bed, sr(fr(b.rand() * 2 - 1)) * bed);
  const drops = Math.round((b.n / b.sr) * (heavy ? 90 : 35));
  for (let d = 0; d < drops; d++) {
    const at = Math.floor(b.rand() * b.n), pan = b.rand(), amp = 0.05 + b.rand() * 0.12, len = Math.floor(b.sr * 0.012);
    for (let k = 0; k < len; k++) { const e = Math.exp(-k / (len / 5)) * (b.rand() * 2 - 1) * amp; add(b, at + k, e * (1 - pan), e * pan); }
  }
}
function wind(b: Buf, strong: boolean) {
  const f1 = lp(400, b.sr), f2 = lp(420, b.sr);
  const rate = strong ? 0.35 : 0.15, depth = strong ? 0.8 : 0.5, lvl = strong ? 0.5 : 0.3;
  for (let i = 0; i < b.n; i++) {
    const t = i / b.sr, g = lvl * (1 - depth + depth * (0.5 + 0.5 * Math.sin(TAU * rate * t + Math.sin(TAU * 0.07 * t) * 2)));
    add(b, i, f1(b.rand() * 2 - 1) * g, f2(b.rand() * 2 - 1) * g);
  }
}
function sea(b: Buf) {
  const f1 = lp(700, b.sr), f2 = lp(650, b.sr);
  for (let i = 0; i < b.n; i++) {
    const t = i / b.sr, swell = Math.pow(0.5 + 0.5 * Math.sin(TAU * t / 7.5), 2);
    add(b, i, f1(b.rand() * 2 - 1) * 0.45 * swell, f2(b.rand() * 2 - 1) * 0.45 * Math.pow(0.5 + 0.5 * Math.sin(TAU * t / 7.5 + 0.8), 2));
  }
}
function city(b: Buf) {
  const f1 = lp(120, b.sr), f2 = lp(130, b.sr);
  for (let i = 0; i < b.n; i++) add(b, i, f1(b.rand() * 2 - 1) * 0.9, f2(b.rand() * 2 - 1) * 0.9);
  const horns = Math.floor((b.n / b.sr) / 9);
  for (let h = 0; h < horns; h++) tone(b, Math.floor(b.rand() * b.n), 0.35, 392 + b.rand() * 60, 0.03, b.rand());
}
function birds(b: Buf) {
  const calls = Math.round((b.n / b.sr) * 1.2);
  for (let c = 0; c < calls; c++) {
    const at = Math.floor(b.rand() * b.n), base = 2500 + b.rand() * 2500, pan = b.rand(), len = Math.floor(b.sr * (0.06 + b.rand() * 0.1));
    let ph = 0;
    for (let k = 0; k < len; k++) { const f = base * (1 + 0.3 * Math.sin((k / len) * Math.PI)); ph += (TAU * f) / b.sr; const e = Math.sin((k / len) * Math.PI) * 0.06 * Math.sin(ph); add(b, at + k, e * (1 - pan), e * pan); }
  }
}
function crickets(b: Buf) {
  for (let i = 0; i < b.n; i++) {
    const t = i / b.sr, gate = Math.sin(TAU * 28 * t) > 0.6 && Math.sin(TAU * 0.9 * t) > -0.2 ? 1 : 0;
    add(b, i, gate * 0.025 * Math.sin(TAU * 4400 * t), gate * 0.02 * Math.sin(TAU * 4700 * t));
  }
}
function crowd(b: Buf) {
  const f1 = lp(900, b.sr), f2 = lp(900, b.sr), h1 = hp(200, b.sr), h2 = hp(200, b.sr);
  for (let i = 0; i < b.n; i++) { const t = i / b.sr, m = 0.6 + 0.4 * Math.sin(TAU * 0.4 * t) * Math.sin(TAU * 1.3 * t); add(b, i, h1(f1(b.rand() * 2 - 1)) * 0.5 * m, h2(f2(b.rand() * 2 - 1)) * 0.5 * m); }
}

// ---- effects ----
function tone(b: Buf, at: number, secs: number, freq: number, amp: number, pan = 0.5, decay = 0) {
  const len = Math.floor(secs * b.sr);
  for (let k = 0; k < len; k++) {
    const env = Math.min(1, k / (0.01 * b.sr), (len - k) / (0.02 * b.sr)) * (decay ? Math.exp(-k / (decay * b.sr)) : 1);
    const s = amp * env * (Math.sin((TAU * freq * k) / b.sr) + 0.3 * Math.sin((TAU * 2 * freq * k) / b.sr));
    add(b, at + k, s * (1 - pan), s * pan);
  }
}
function thump(b: Buf, at: number, amp: number, freq = 70, secs = 0.25, noise = 0.3) {
  const len = Math.floor(secs * b.sr), f = lp(1500, b.sr);
  for (let k = 0; k < len; k++) {
    const e = Math.exp(-k / (secs * b.sr * 0.18)), fr = freq * (1 + 1.5 * Math.exp(-k / (0.01 * b.sr)));
    add(b, at + k, amp * e * (Math.sin((TAU * fr * k) / b.sr) + noise * f(b.rand() * 2 - 1)));
  }
}
function burst(b: Buf, at: number, secs: number, amp: number, cut: number, decay: number) {
  const len = Math.floor(secs * b.sr), f1 = lp(cut, b.sr), f2 = lp(cut, b.sr);
  for (let k = 0; k < len; k++) { const e = amp * Math.exp(-k / (decay * b.sr)); add(b, at + k, f1(b.rand() * 2 - 1) * e, f2(b.rand() * 2 - 1) * e); }
}
const FX: { name: string; words: RegExp; make: (b: Buf, d: string) => void }[] = [
  { name: "footsteps", words: /footstep|steps|walks?|running|runs/i, make: (b, d) => { const gap = /run/i.test(d) ? 0.3 : 0.55; for (let t = 0.1; t < b.n / b.sr - 0.2; t += gap) { const at = Math.floor(t * b.sr); thump(b, at, 0.5, 90, 0.12, 0.8); burst(b, at, 0.08, 0.2, 3000, 0.02); } } },
  { name: "door knock", words: /knock/i, make: (b) => { for (const t of [0.2, 0.45, 0.7]) thump(b, Math.floor(t * b.sr), 0.7, 110, 0.15, 0.5); } },
  { name: "door slam", words: /slam|door/i, make: (b) => { thump(b, Math.floor(0.1 * b.sr), 0.9, 60, 0.6, 0.6); burst(b, Math.floor(0.1 * b.sr), 0.4, 0.3, 2500, 0.08); } },
  { name: "thunder", words: /thunder|storm|lightning/i, make: (b) => { burst(b, Math.floor(0.05 * b.sr), Math.min(4, b.n / b.sr), 0.8, 220, 0.9); burst(b, Math.floor(0.05 * b.sr), 0.3, 0.5, 3000, 0.05); } },
  { name: "gunshot", words: /gun|shot|shoot|fires?/i, make: (b) => { burst(b, 0, 0.8, 1, 8000, 0.03); thump(b, 0, 0.8, 55, 0.8, 0.4); } },
  { name: "glass", words: /glass|smash|shatter/i, make: (b) => { burst(b, 0, 0.6, 0.6, 9000, 0.1); for (let i = 0; i < 6; i++) tone(b, Math.floor((0.02 + i * 0.05) * b.sr), 0.8, 2500 + i * 700, 0.08, 0.5, 0.2); } },
  { name: "phone ringing", words: /phone|ring/i, make: (b) => { for (let t = 0; t < b.n / b.sr - 0.5; t += 3) { tone(b, Math.floor(t * b.sr), 0.4, 440, 0.2); tone(b, Math.floor(t * b.sr), 0.4, 480, 0.2); tone(b, Math.floor((t + 0.6) * b.sr), 0.4, 440, 0.2); } } },
  { name: "engine / car", words: /car|engine|truck|motor|drive/i, make: (b) => { const f = lp(400, b.sr); for (let i = 0; i < b.n; i++) { const t = i / b.sr; add(b, i, 0.3 * Math.sin(TAU * 48 * t + Math.sin(TAU * 3 * t)) * (0.7 + 0.3 * Math.sin(TAU * 0.5 * t)) + 0.2 * f(b.rand() * 2 - 1)); } } },
  { name: "typing", words: /typing|keyboard|types/i, make: (b) => { for (let t = 0.05; t < b.n / b.sr; t += 0.09 + b.rand() * 0.12) burst(b, Math.floor(t * b.sr), 0.02, 0.35, 5000, 0.004); } },
  { name: "paper", words: /paper|document|pages?/i, make: (b) => { const h = hp(2000, b.sr); for (let i = 0; i < b.n; i++) { const t = i / b.sr; add(b, i, h(b.rand() * 2 - 1) * 0.15 * Math.max(0, Math.sin(TAU * 1.7 * t))); } } },
  { name: "breath", words: /breath|sigh|gasp/i, make: (b) => { const f = lp(1800, b.sr); for (let i = 0; i < b.n; i++) { const t = i / b.sr; add(b, i, f(b.rand() * 2 - 1) * 0.25 * Math.pow(Math.max(0, Math.sin(TAU * 0.3 * t)), 2)); } } },
  { name: "punch / impact", words: /punch|hit|slap|impact|crash|explosion|explodes/i, make: (b) => { thump(b, Math.floor(0.05 * b.sr), 1, 50, 0.7, 0.9); burst(b, Math.floor(0.05 * b.sr), 0.3, 0.5, 4000, 0.04); } },
];

// ---- score ----
const MOOD: { words: RegExp; minor: boolean; bpm: number; root: number; name: string; pulse: boolean; low: boolean }[] = [
  { words: /tense|nervous|threat|menac|suspense|danger|fear|oppressive|claustrophobic/i, minor: true, bpm: 96, root: 110, name: "tense minor pulse", pulse: true, low: true },
  { words: /sad|melanchol|grief|loss|lonely|desperate/i, minor: true, bpm: 60, root: 146.83, name: "slow minor pad", pulse: false, low: false },
  { words: /romantic|love|intimate|tender|warm/i, minor: false, bpm: 72, root: 174.61, name: "warm major sevenths", pulse: false, low: false },
  { words: /hope|joy|triumph|uplift|bright/i, minor: false, bpm: 100, root: 196, name: "bright major progression", pulse: true, low: false },
  { words: /eerie|dark|cold|mysterious|uneasy/i, minor: true, bpm: 70, root: 98, name: "dark drone", pulse: false, low: true },
  { words: /chaotic|action|chase|frenetic|fight/i, minor: true, bpm: 140, root: 123.47, name: "driving minor ostinato", pulse: true, low: true },
];
/** A plucked/bell note: a few harmonics with an exponential decay (the theme's melody voice). */
function pluck(b: Buf, at: number, secs: number, freq: number, amp: number, pan: number) {
  const len = Math.floor(secs * b.sr);
  for (let k = 0; k < len; k++) {
    const t = k / b.sr, env = Math.min(1, k / (0.004 * b.sr)) * Math.exp(-t / (secs * 0.45));
    const s = amp * env * (Math.sin(TAU * freq * t) + 0.35 * Math.sin(TAU * 2 * freq * t) + 0.12 * Math.sin(TAU * 3 * freq * t) * Math.exp(-t * 6));
    add(b, at + k, s * (1 - pan), s * pan);
  }
}
/**
 * A main theme: a four-bar motif over the chord progression, stated, answered a step higher, then resolved — with a
 * walking bass. Deterministic from the seed, so the same film always gets the same tune. Used for "theme", "main
 * title" and "credits" cues (1.1.0); other score cues are unchanged.
 */
function theme(b: Buf, root: number, minor: boolean, bpm: number, prog: number[][]) {
  const scale = minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
  const beat = 60 / bpm, bar = beat * 4, total = b.n / b.sr;
  // The motif: 8 notes over 2 bars, as scale degrees chosen from the seed (stepwise, leaning on chord tones).
  const rhythm = [1, 0.5, 0.5, 1, 1, 1.5, 0.5, 2];
  const motif: number[] = [];
  let deg = 4;
  for (let i = 0; i < rhythm.length; i++) { deg = Math.max(0, Math.min(9, deg + [-2, -1, 1, 2, 0, 1][Math.floor(b.rand() * 6)])); motif.push(deg); }
  motif[motif.length - 1] = 0; // resolve home
  const noteHz = (d: number, shift: number) => root * 2 * Math.pow(2, (scale[(d + shift) % 7] + 12 * Math.floor((d + shift) / 7)) / 12);
  for (let t = 0, phrase = 0; t < total - beat; phrase++) {
    const shift = phrase % 4 === 1 ? 1 : phrase % 4 === 3 ? -1 : 0; // statement, answer a step higher, statement, resolution
    for (let i = 0; i < motif.length && t < total - beat * 0.5; i++) {
      pluck(b, Math.floor(t * b.sr), Math.min(rhythm[i] * beat * 1.6, 2.5), noteHz(motif[i], shift), 0.12, 0.45 + 0.1 * Math.sin(i));
      t += rhythm[i] * beat;
    }
  }
  for (let t = 0, idx = 0; t < total; t += beat, idx++) {
    const chord = prog[Math.floor(t / bar) % prog.length];
    tone(b, Math.floor(t * b.sr), beat * 0.9, (root / 2) * Math.pow(2, chord[idx % 2 ? 2 : 0] / 12), 0.07, 0.5, beat * 0.6);
  }
}

function score(b: Buf, text: string, mood: string[]) {
  const all = `${text} ${mood.join(" ")}`;
  const m = MOOD.find((x) => x.words.test(all)) ?? { minor: false, bpm: 80, root: 164.81, name: "neutral pad", pulse: false, low: false, words: /./ };
  // i–VI–III–VII (minor) or I–V–vi–IV (major), in semitones from the root.
  const prog = m.minor ? [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17]] : [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]];
  if (/sevenths/.test(m.name)) prog.forEach((c) => c.push(c[0] + (m.minor ? 10 : 11)));
  const bar = (60 / m.bpm) * 4, total = b.n / b.sr;
  for (let t = 0, idx = 0; t < total; t += bar, idx++) {
    const chord = prog[idx % prog.length];
    const at = Math.floor(t * b.sr), len = Math.min(bar + 0.3, total - t);
    chord.forEach((st, j) => tone(b, at, len, m.root * Math.pow(2, st / 12), 0.05, 0.3 + 0.2 * j));
    if (m.low) tone(b, at, len, (m.root / 2) * Math.pow(2, chord[0] / 12), 0.08, 0.5);
    if (m.pulse) for (let q = 0; q < 8; q++) { const pt = t + (q * bar) / 8; if (pt < total) tone(b, Math.floor(pt * b.sr), (bar / 8) * 0.6, m.root * 2 * Math.pow(2, chord[q % chord.length] / 12), 0.035, q % 2 ? 0.35 : 0.65, 0.12); }
  }
  if (/\b(theme|main title|title music|titles|credits|theme tune)\b/i.test(text)) { theme(b, m.root, m.minor, m.bpm, prog); return `${m.name} + main theme melody`; }
  return m.name;
}

export function proceduralAudioEngine(raw: unknown): ProceduralAudioOutput {
  const input: ProceduralAudioInput = ProceduralAudioInputSchema.parse(raw);
  const sr = input.sample_rate, n = Math.round(input.duration_seconds * sr);
  const b: Buf = { L: new Float32Array(n), R: new Float32Array(n), sr, n, rand: rng(input.seed) };
  const d = input.description, layers: ProceduralAudioOutput["layers"] = [];
  const hit = (re: RegExp) => d.match(re)?.[0];

  if (input.kind === "ambience") {
    const interior = /\binterior\b|\bint\b/i.test(d);
    roomTone(b, interior ? 0.5 : 0.35); layers.push({ name: "room tone", because: interior ? "interior scene" : "base bed" });
    let w: string | undefined;
    if ((w = hit(/heavy rain|torrential|storm|rain\w*|drizzle/i))) { rain(b, /heavy|torrential|storm/i.test(w)); layers.push({ name: "rain", because: `“${w}”` }); }
    if ((w = hit(/strong wind|wind\w*|gale|breeze/i))) { wind(b, /strong|gale/i.test(w)); layers.push({ name: "wind", because: `“${w}”` }); }
    if ((w = hit(/harbour|harbor|sea|ocean|beach|shore|waves?|port|dock|lagoon/i))) { sea(b); layers.push({ name: "sea / waves", because: `“${w}”` }); }
    if ((w = hit(/city|street|traffic|market|road|downtown|lagos/i)) && !interior) { city(b); layers.push({ name: "distant traffic", because: `“${w}”` }); }
    if ((w = hit(/dawn|morning|sunrise|garden|park|forest/i))) { birds(b); layers.push({ name: "birds", because: `“${w}”` }); }
    if ((w = hit(/\bnight\b|midnight|evening/i)) && !interior) { crickets(b); layers.push({ name: "night insects", because: `“${w}”` }); }
    if ((w = hit(/crowd|bar|restaurant|newsroom|office|party|club|station/i))) { crowd(b); layers.push({ name: "walla / crowd murmur", because: `“${w}”` }); }
    if ((w = hit(/thunder|storm/i))) { const t = Math.floor(b.n * (0.3 + 0.4 * b.rand())); burst(b, t, Math.min(3, input.duration_seconds / 3), 0.5, 200, 0.8); layers.push({ name: "distant thunder", because: `“${w}”` }); }
  } else if (input.kind === "score") {
    const name = score(b, d, input.mood);
    layers.push({ name, because: input.mood.length ? `mood: ${input.mood.join(", ")}` : "cue description" });
  } else {
    const fx = FX.filter((f) => f.words.test(d));
    if (!fx.length) {
      burst(b, Math.floor(0.05 * sr), Math.min(0.6, input.duration_seconds), 0.5, 2500, 0.08);
      layers.push({ name: "generic impact", because: "no known sound word in the cue — edit the cue or replace with a recording" });
    }
    for (const f of fx.slice(0, 3)) { f.make(b, d); layers.push({ name: f.name, because: `“${d.match(f.words)?.[0]}”` }); }
  }

  // Gentle fades and a safe peak (−3 dBFS), so a generated file can go straight onto a track.
  const fade = Math.min(Math.floor(0.05 * sr), Math.floor(n / 4));
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const g = input.kind === "ambience" || input.kind === "score" ? Math.min(1, i / fade, (n - 1 - i) / fade) : Math.min(1, (n - 1 - i) / fade);
    b.L[i] *= g; b.R[i] *= g;
    peak = Math.max(peak, Math.abs(b.L[i]), Math.abs(b.R[i]));
  }
  const target = Math.pow(10, -3 / 20);
  if (peak > 0) { const k = target / peak; for (let i = 0; i < n; i++) { b.L[i] *= k; b.R[i] *= k; } }
  return { sample_rate: sr, channels: [b.L, b.R], duration_seconds: n / sr, layers, peak_db: peak > 0 ? -3 : -Infinity, engine_version: ENGINE_VERSION };
}
