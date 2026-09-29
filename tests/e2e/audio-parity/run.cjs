// Parity test: the Audio Studio's real browser mix code (apps/web/.../mixEngine.ts, transpiled as is) rendered by
// Chromium's Web Audio, against engines/audio/studioMixRenderEngine in node — the engine the render worker uses for
// exported films. Every case must match to at least 40 dB below the signal (measured: 46–137 dB).
// Needs `pnpm build` (contracts + engines dist) and Playwright's Chromium (CHROMIUM_PATH).
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "../../..");
const ts = require(require.resolve("typescript", { paths: [ROOT + "/apps/web", ROOT] }));
const { chromium } = require("playwright");
const contracts = require(ROOT + "/packages/contracts/dist/index.js");
const { studioMixRenderEngine } = require(ROOT + "/engines/dist/index.js");
let src = fs.readFileSync(ROOT + "/apps/web/src/modules/audio-studio/state/mixEngine.ts", "utf8");
src = src.replace(/^"use client";/m, "").replace(/^import[^;]*;$/gm, "");
let js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None } }).outputText;
js = js.replace(/^export /gm, "").replace(/Object\.defineProperty\(exports[^;]*;/g, "");
const prelude = `var exports={};const FAMILY_BUS=${JSON.stringify(contracts.FAMILY_BUS)};const NEUTRAL_TRACK_FX=${JSON.stringify(contracts.NEUTRAL_TRACK_FX)};const NEUTRAL_SESSION_MIX=${JSON.stringify(contracts.NEUTRAL_SESSION_MIX)};const audioApi={};const loudnessMeterEngine=()=>null;`;
const SR = 48000, SEC = 3;
function sig(seed, n, stereo, kind) {
  let s = seed; const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  const ch = Array.from({ length: stereo ? 2 : 1 }, () => new Float32Array(n));
  for (let c = 0; c < ch.length; c++) for (let i = 0; i < n; i++) {
    const t = i / SR, env = kind === "speech" ? (Math.sin(t * 5) > 0 ? 1 : 0.05) : 1;
    ch[c][i] = env * (0.3 * Math.sin(2 * Math.PI * (kind === "speech" ? 180 : 110 + c * 3) * t) + 0.15 * r() + 0.1 * Math.sin(2 * Math.PI * 2500 * t));
  }
  return ch;
}
const cases = {
  neutral: { tracks: [{ id: "d", family: "DX", gain_db: -3, pan: 0, mute: false, solo: false, fx: contracts.NEUTRAL_TRACK_FX }], mix: contracts.NEUTRAL_SESSION_MIX },
  eq_only: { tracks: [{ id: "d", family: "DX", gain_db: 0, pan: -0.3, mute: false, solo: false, fx: { ...contracts.NEUTRAL_TRACK_FX, hpf_hz: 100, eq: { low: { freq: 200, gain_db: 4 }, mid: { freq: 2000, gain_db: -3, q: 1.5 }, high: { freq: 9000, gain_db: 5 } } } }], mix: { ...contracts.NEUTRAL_SESSION_MIX, master: { gain_db: 0, limiter: false, ceiling_db: -1 } } },
  phone_lpf: { tracks: [{ id: "d", family: "DX", gain_db: 0, pan: 0, mute: false, solo: false, fx: { ...contracts.NEUTRAL_TRACK_FX, hpf_hz: 300, lpf_hz: 3400, eq: { ...contracts.NEUTRAL_TRACK_FX.eq, mid: { freq: 1500, gain_db: 4, q: 1.2 } } } }], mix: { ...contracts.NEUTRAL_SESSION_MIX, master: { gain_db: 0, limiter: false, ceiling_db: -1 } } },
  comp: { tracks: [{ id: "d", family: "DX", gain_db: 0, pan: 0, mute: false, solo: false, fx: { ...contracts.NEUTRAL_TRACK_FX, comp: { on: true, threshold_db: -24, ratio: 4, attack_ms: 10, release_ms: 150, makeup_db: 2 } } }], mix: { ...contracts.NEUTRAL_SESSION_MIX, master: { gain_db: 0, limiter: false, ceiling_db: -1 } } },
  reverb: { tracks: [{ id: "d", family: "DX", gain_db: 0, pan: 0, mute: false, solo: false, fx: { ...contracts.NEUTRAL_TRACK_FX, reverb_send_db: 0 } }], mix: { ...contracts.NEUTRAL_SESSION_MIX, buses: { ...contracts.NEUTRAL_SESSION_MIX.buses, DX: { gain_db: 0, mute: true } }, reverb: { type: "hall", decay_s: 1.5, pre_delay_ms: 20, return_db: 0 }, master: { gain_db: 0, limiter: false, ceiling_db: -1 } } },
  delay: { tracks: [{ id: "d", family: "DX", gain_db: 0, pan: 0, mute: false, solo: false, fx: { ...contracts.NEUTRAL_TRACK_FX, delay_send_db: 0 } }], mix: { ...contracts.NEUTRAL_SESSION_MIX, buses: { ...contracts.NEUTRAL_SESSION_MIX.buses, DX: { gain_db: 0, mute: true } }, delay: { time_ms: 250, feedback: 0.35, return_db: 0 }, master: { gain_db: 0, limiter: false, ceiling_db: -1 } } },
  limiter_hot: { tracks: [{ id: "d", family: "DX", gain_db: 12, pan: 0, mute: false, solo: false, fx: contracts.NEUTRAL_TRACK_FX }], mix: contracts.NEUTRAL_SESSION_MIX },
  full: {
    tracks: [
      { id: "d", family: "DX", gain_db: 0, pan: -0.3, mute: false, solo: false, fx: { hpf_hz: 100, eq: { low: { freq: 200, gain_db: 4 }, mid: { freq: 2000, gain_db: -3, q: 1.5 }, high: { freq: 9000, gain_db: 5 } }, comp: { on: true, threshold_db: -24, ratio: 4, attack_ms: 10, release_ms: 150, makeup_db: 2 }, reverb_send_db: -10, delay_send_db: -20, automation: [] } },
      { id: "m", family: "SCORE", gain_db: -6, pan: 0.4, mute: false, solo: false, fx: { ...contracts.NEUTRAL_TRACK_FX, automation: [{ t: 0.5, db: 0 }, { t: 2, db: -12 }] } },
    ],
    mix: { buses: { DX: { gain_db: 0, mute: false }, FX: { gain_db: 0, mute: false }, BG: { gain_db: 0, mute: false }, MX: { gain_db: -2, mute: false } }, reverb: { type: "hall", decay_s: 1.5, pre_delay_ms: 20, return_db: -2 }, delay: { time_ms: 250, feedback: 0.35, return_db: -6 }, master: { gain_db: 1, limiter: true, ceiling_db: -1 } },
  },
};
(async () => {
  const pcm = { a: sig(3, SR * SEC, false, "speech"), b: sig(9, SR * SEC, true, "music") };
  let failed = 0;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  const page = await browser.newPage();
  await page.addScriptTag({ content: prelude + js + ";window.renderMix=renderMix;" });
  for (const [name, c] of Object.entries(cases)) {
    const clips = [{ id: "c1", track_id: "d", kind: "asset", asset_id: "a", start_seconds: 0.2, duration_seconds: 2.5, offset_seconds: 0.1, gain_db: -2, fade_in_seconds: 0.3, fade_out_seconds: 0.5 }];
    if (c.tracks.some((t) => t.id === "m")) clips.push({ id: "c2", track_id: "m", kind: "asset", asset_id: "b", start_seconds: 0, duration_seconds: 3, offset_seconds: 0, gain_db: 0, fade_in_seconds: 0, fade_out_seconds: 0 });
    const web = await page.evaluate(async ({ c, clips, pcm, SEC, SR }) => {
      const ctx = new OfflineAudioContext(2, 1, SR);
      const bufs = new Map(Object.entries(pcm).map(([k, chs]) => { const b = ctx.createBuffer(chs.length, chs[0].length, SR); chs.forEach((d, i) => b.copyToChannel(Float32Array.from(d), i)); return [k, b]; }));
      const out = await window.renderMix(SEC, c.tracks, clips, bufs, undefined, c.mix);
      return [Array.from(out.getChannelData(0)), Array.from(out.getChannelData(1))];
    }, { c, clips, pcm: Object.fromEntries(Object.entries(pcm).map(([k, v]) => [k, v.map((x) => Array.from(x))])), SEC, SR });
    const eng = studioMixRenderEngine({ seconds: SEC, tracks: c.tracks, clips: clips.map(({ id, kind, ...x }) => x), mix: c.mix }, new Map(Object.entries(pcm).map(([k, v]) => [k, { channels: v }])), SR);
    const db = (x) => 20 * Math.log10(x);
    for (let ch = 0; ch < 2; ch++) {
      let se = 0, sw = 0, sn = 0;
      for (let i = 0; i < web[ch].length; i++) { const d = eng[ch][i] - web[ch][i]; se += d * d; sw += web[ch][i] ** 2; sn += eng[ch][i] ** 2; }
      const below = -db(Math.sqrt(se / sw)), ok = below >= 40;
      if (!ok) failed++;
      console.log(`${ok ? "PASS" : "FAIL"} ${name} ch${ch}: browser ${db(Math.sqrt(sw / web[ch].length)).toFixed(2)} dBFS, engine ${db(Math.sqrt(sn / web[ch].length)).toFixed(2)} dBFS, difference ${below.toFixed(1)} dB below the signal`);
    }
  }
  await browser.close();
  console.log(failed ? `${failed} FAILED` : "ALL PASSED");
  process.exit(failed ? 1 : 0);
})();
