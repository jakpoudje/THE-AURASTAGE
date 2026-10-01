// Measures the register (median pitch) of each Piper speaker at image build time → /opt/piper/voices/speakers.json.
// Self-contained on purpose (it runs before the source is copied, so the models stay cached between deploys); the pitch
// method is the same as src/providers/audio/neural/voices.ts (a test checks they agree).
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export function medianF0(samples, rate) {
  const frame = Math.round(rate * 0.04), hop = Math.round(rate * 0.02);
  const minLag = Math.floor(rate / 400), maxLag = Math.ceil(rate / 70);
  const f0s = [];
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
    // Multiples of the period correlate almost as well; the shortest strong peak is the true pitch (no octave errors).
    let bestLag = 0;
    for (let k = 1; k < rs.length - 1; k++) if (rs[k] >= best * 0.9 && rs[k] >= rs[k - 1] && rs[k] >= rs[k + 1]) { bestLag = minLag + k; break; }
    if (bestLag) f0s.push(rate / bestLag);
  }
  if (f0s.length < 5) return null;
  f0s.sort((a, b) => a - b);
  return f0s[Math.floor(f0s.length / 2)];
}
function wav(buf) {
  const rate = buf.readUInt32LE(24);
  let o = 12;
  while (o + 8 <= buf.length) {
    const id = buf.toString("ascii", o, o + 4), size = buf.readUInt32LE(o + 4);
    if (id === "data") { const n = Math.min(size, buf.length - o - 8) >> 1, s = new Float32Array(n); for (let i = 0; i < n; i++) s[i] = buf.readInt16LE(o + 8 + i * 2) / 32768; return { s, rate }; }
    o += 8 + size;
  }
  return { s: new Float32Array(0), rate };
}

const main = () => {
  const root = process.argv[2] || "/opt/piper", vdir = join(root, "voices"), tmp = mkdtempSync(join(tmpdir(), "measure-"));
  const TEXT = "Good morning. I have been waiting here since dawn, and I am still not sure you will come.";
  const speakers = [];
  for (const f of readdirSync(vdir).filter((x) => x.endsWith(".onnx"))) {
    const model = f.replace(/\.onnx$/, ""), cfg = JSON.parse(readFileSync(join(vdir, f + ".json"), "utf8"));
    // Speaker names (e.g. "awb") let accents be matched to a corpus's published speaker list; a single-speaker model is id 0.
    const names = new Map(Object.entries(cfg.speaker_id_map ?? {}).map(([n, id]) => [Number(id), n]));
    const single = names.size === 0;
    const ids = single ? [0] : [...names.keys()].sort((a, b) => a - b);
    // Large catalogues are sampled evenly (about 150 voices) to keep the build short.
    const step = Math.max(1, Math.ceil(ids.length / 150)), chosen = ids.filter((_, i) => i % step === 0);
    const lines = chosen.map((id) => JSON.stringify({ text: TEXT, ...(single ? {} : { speaker_id: id }), output_file: join(tmp, `${model}-${id}.wav`) })).join("\n") + "\n";
    const r = spawnSync(join(root, "piper"), ["--model", join(vdir, f), "--json-input", "--quiet"], { input: lines, maxBuffer: 1 << 26 });
    if (r.status !== 0) throw new Error(`piper failed for ${model}: ${String(r.stderr).slice(-400)}`);
    for (const id of chosen) {
      const p = join(tmp, `${model}-${id}.wav`);
      if (!existsSync(p)) continue;
      const { s, rate } = wav(readFileSync(p));
      const f0 = medianF0(s, rate);
      if (f0) speakers.push({ model, id, f0: Math.round(f0 * 10) / 10, ...(single ? { single: true } : { name: names.get(id) }) });
    }
  }
  if (speakers.length < 20) throw new Error(`only ${speakers.length} voices measured`);
  writeFileSync(join(vdir, "speakers.json"), JSON.stringify({ measured_at: new Date().toISOString(), text: TEXT, speakers }));
  const f = speakers.filter((x) => x.f0 >= 165).length;
  console.log(`measured ${speakers.length} voices (${f} higher / ${speakers.length - f} lower register)`);
};
if (process.argv[1] && process.argv[1].endsWith("piper-measure.mjs")) main();
