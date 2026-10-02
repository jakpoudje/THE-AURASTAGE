// AuraStage natural voice — Kokoro-82M (Apache-2.0) through kokoro-js (Apache-2.0), run on AuraStage's own servers.
// Installed into /opt/kokoro by kokoro-install.sh. Two modes:
//   node kokoro-say.mjs --setup /opt/kokoro   downloads the model once (at image build), speaks a test sentence in
//                                            every voice, MEASURES each voice's pitch and writes voices.json — the
//                                            evidence the API uses to cast voices. No voices.json → not installed.
//   node kokoro-say.mjs /opt/kokoro           a long-lived speaker: one JSON request per stdin line
//                                            {id, text, voice, speed, out}, one JSON reply per stdout line
//                                            {id, ok, seconds, rate} or {id, ok:false, error}. The model loads once.
// Self-contained on purpose (it runs before the app source is copied, so the download stays cached between deploys).
import { createInterface } from "node:readline";
import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
const setup = process.argv[2] === "--setup";
const root = (setup ? process.argv[3] : process.argv[2]) || "/opt/kokoro";

// This file lives in /opt/kokoro, so these resolve to /opt/kokoro/node_modules — the same transformers instance
// kokoro-js uses, so the cache settings below apply to its model.
const { env } = await import("@huggingface/transformers");
env.cacheDir = join(root, "models");
env.allowRemoteModels = setup; // at run time only the model downloaded at build time is used
const { KokoroTTS } = await import("kokoro-js");
// The phonemizer's runtime rethrows any uncaught error with its whole minified source; fail with a short message instead.
const fail = (e) => { process.stderr.write(`kokoro: ${String(e?.message ?? e).slice(0, 300)}\n`); process.exit(1); };
const tts = await KokoroTTS.from_pretrained(MODEL, { dtype: "q8", device: "cpu" }).catch(fail);

/** Float samples → 16-bit PCM mono WAV. */
function wav(samples, rate) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write("WAVE", 8); b.write("fmt ", 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  return b;
}
async function say(text, voice, speed, out) {
  const a = await tts.generate(text, { voice, speed });
  writeFileSync(out, wav(a.audio, a.sampling_rate));
  return { seconds: Math.round((a.audio.length / a.sampling_rate) * 1000) / 1000, rate: a.sampling_rate };
}

// Same pitch method as src/providers/audio/neural/voices.ts (median F0 by normalised autocorrelation).
function medianF0(samples, rate) {
  const frame = Math.round(rate * 0.04), hop = Math.round(rate * 0.02), minLag = Math.floor(rate / 400), maxLag = Math.ceil(rate / 70), f0s = [];
  for (let start = 0; start + frame + maxLag < samples.length; start += hop) {
    let energy = 0;
    for (let i = 0; i < frame; i++) energy += samples[start + i] ** 2;
    if (energy / frame < 1e-4) continue;
    const rs = [];
    let best = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let num = 0, e2 = 0;
      for (let i = 0; i < frame; i++) { num += samples[start + i] * samples[start + i + lag]; e2 += samples[start + i + lag] ** 2; }
      const r = num / Math.sqrt(energy * e2 + 1e-12);
      rs.push(r);
      if (r > best) best = r;
    }
    if (best <= 0.6) continue;
    let bestLag = 0;
    for (let k = 1; k < rs.length - 1; k++) if (rs[k] >= best * 0.9 && rs[k] >= rs[k - 1] && rs[k] >= rs[k + 1]) { bestLag = minLag + k; break; }
    if (bestLag) f0s.push(rate / bestLag);
  }
  if (f0s.length < 5) return null;
  f0s.sort((a, b) => a - b);
  return f0s[Math.floor(f0s.length / 2)];
}

if (setup) await (async () => {
  const TEXT = "Good morning. I have been waiting here since dawn, and I am still not sure you will come.";
  const voices = [];
  for (const [id, v] of Object.entries(tts.voices)) {
    // English voices only (a = American, b = British); the model's published grade is kept so better voices win ties.
    if (!/^[ab][fm]_/.test(id)) continue;
    const a = await tts.generate(TEXT, { voice: id, speed: 1 });
    const f0 = medianF0(a.audio, a.sampling_rate);
    if (!f0) { console.log(`voice ${id}: no pitch measured — skipped`); continue; }
    voices.push({ id, name: v.name, gender: id[1] === "f" ? "female" : "male", accent: id[0] === "a" ? "american" : "british", grade: v.overallGrade ?? null, f0: Math.round(f0 * 10) / 10 });
    console.log(`voice ${id}: ${Math.round(f0)} Hz`);
  }
  if (voices.length < 4) throw new Error(`only ${voices.length} voices measured`);
  writeFileSync(join(root, "voices.json"), JSON.stringify({ model: MODEL, dtype: "q8", measured_at: new Date().toISOString(), voices }, null, 1));
  // A real line through the same path the server uses, so a broken install never reaches production.
  const check = await say("The ferry leaves at six.", voices[0].id, 1, join(tmpdir(), "kokoro-check.wav"));
  if (!(check.seconds > 0.5)) throw new Error("test line too short");
  console.log(`kokoro ready: ${voices.length} voices`);
  process.exit(0);
})().catch(fail);

process.stdout.write(JSON.stringify({ ready: true }) + "\n");
// Requests are handled one at a time (the model is single-threaded per call); the caller queues.
let chain = Promise.resolve();
createInterface({ input: process.stdin }).on("line", (line) => {
  chain = chain.then(async () => {
    let req;
    try {
      req = JSON.parse(line);
      if (!req.out || !existsSync(join(req.out, ".."))) throw new Error("no output path");
      const r = await say(String(req.text ?? "").slice(0, 1000), req.voice, Math.max(0.5, Math.min(2, Number(req.speed) || 1)), req.out);
      process.stdout.write(JSON.stringify({ id: req.id, ok: true, ...r }) + "\n");
    } catch (e) {
      process.stdout.write(JSON.stringify({ id: req?.id ?? null, ok: false, error: String(e?.message ?? e).slice(0, 300) }) + "\n");
    }
  });
}).on("close", () => chain.then(() => process.exit(0)));
