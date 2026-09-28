// engines/audio/loudnessMeterEngine
// ITU-R BS.1770-4 integrated loudness (K-weighting, 400 ms blocks with 75%
// overlap, -70 LUFS absolute and -10 LU relative gates), EBU Tech 3342
// loudness range (3 s short-term, -20 LU relative gate, 10th–95th percentile)
// and a 4x-oversampled true-peak estimate. Pure maths on real samples — the
// Audio Studio runs it on the actually rendered mix; nothing is estimated.

import { ABSOLUTE_GATE_LUFS, applyBiquad, BLOCK_SECONDS, BLOCK_STEP_SECONDS, kWeighting, LRA_RELATIVE_GATE_LU, oversampleKernel, OVERSAMPLE, RELATIVE_GATE_LU, SHORT_TERM_SECONDS } from "./rules";
import { validateLoudnessInput } from "./validator";
import { ENGINE_VERSION } from "./version";
import type { LoudnessOutput } from "./output.schema";

const lufs = (power: number) => -0.691 + 10 * Math.log10(power);
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Weighted mean-square power of each window (length win samples, hop samples). */
function windowPowers(filtered: Float64Array[], weights: number[], win: number, hop: number): number[] {
  const n = filtered[0].length;
  if (n < win) return [];
  // Prefix sums of squares per channel for O(1) windows.
  const prefix = filtered.map((ch) => {
    const p = new Float64Array(ch.length + 1);
    for (let i = 0; i < ch.length; i++) p[i + 1] = p[i] + ch[i] * ch[i];
    return p;
  });
  const out: number[] = [];
  for (let start = 0; start + win <= n; start += hop) {
    let sum = 0;
    for (let c = 0; c < filtered.length; c++) sum += (weights[c] * (prefix[c][start + win] - prefix[c][start])) / win;
    out.push(sum);
  }
  return out;
}

function gatedMean(powers: number[], relativeGateLu: number) {
  const abs = powers.filter((p) => p > 0 && lufs(p) > ABSOLUTE_GATE_LUFS);
  if (!abs.length) return { mean: null as number | null, passed: [] as number[] };
  const absMean = abs.reduce((s, p) => s + p, 0) / abs.length;
  const gate = lufs(absMean) + relativeGateLu;
  const passed = abs.filter((p) => lufs(p) > gate);
  return { mean: passed.length ? passed.reduce((s, p) => s + p, 0) / passed.length : null, passed };
}

function truePeak(channels: Float32Array[]): number {
  const phases = oversampleKernel();
  const taps = phases[0].length;
  let peak = 0;
  for (const ch of channels) {
    for (let n = 0; n < ch.length; n++) {
      const a = Math.abs(ch[n]);
      if (a > peak) peak = a;
      for (let p = 1; p < OVERSAMPLE; p++) {
        const k = phases[p];
        let s = 0;
        for (let i = 0; i < taps; i++) {
          const idx = n + i - taps / 2 + 1;
          if (idx >= 0 && idx < ch.length) s += ch[idx] * k[i];
        }
        const v = Math.abs(s);
        if (v > peak) peak = v;
      }
    }
  }
  return peak;
}

export function loudnessMeterEngine(raw: unknown): LoudnessOutput {
  const { sample_rate: fs, channels, weights: w } = validateLoudnessInput(raw);
  const weights = channels.map((_, i) => w?.[i] ?? 1);
  const [shelf, hp] = kWeighting(fs);
  const filtered = channels.map((ch) => applyBiquad(applyBiquad(ch, shelf), hp));

  const blocks = windowPowers(filtered, weights, Math.round(BLOCK_SECONDS * fs), Math.round(BLOCK_STEP_SECONDS * fs));
  const integrated = gatedMean(blocks, RELATIVE_GATE_LU).mean;

  const short = windowPowers(filtered, weights, Math.round(SHORT_TERM_SECONDS * fs), Math.round(BLOCK_STEP_SECONDS * fs));
  const lraSet = gatedMean(short, LRA_RELATIVE_GATE_LU).passed.map(lufs).sort((a, b) => a - b);
  const pct = (q: number) => lraSet[Math.min(lraSet.length - 1, Math.max(0, Math.round(q * (lraSet.length - 1))))];
  const lra = lraSet.length >= 2 ? pct(0.95) - pct(0.1) : null;

  let sp = 0;
  for (const ch of channels) for (let i = 0; i < ch.length; i++) sp = Math.max(sp, Math.abs(ch[i]));
  const tp = sp > 0 ? truePeak(channels) : 0;

  return {
    integrated_lufs: integrated === null ? null : r2(lufs(integrated)),
    true_peak_dbtp: tp > 0 ? r2(20 * Math.log10(tp)) : null,
    sample_peak_dbfs: sp > 0 ? r2(20 * Math.log10(sp)) : null,
    lra_lu: lra === null ? null : r2(lra),
    duration_seconds: r2(channels[0].length / fs),
    engine_version: ENGINE_VERSION,
  };
}
