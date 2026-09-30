// End-to-end render with the real ffmpeg: every available delivery profile is
// rendered from a manifest compiled by the real manifest engine, then measured
// and checked by final QC. Skipped only when ffmpeg isn't installed.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, statSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NEUTRAL_GRADE } from "@aurastage/contracts";
import { getDeliveryProfile, renderManifestEngine, titleSequenceEngine, type RenderManifest } from "@aurastage/engines";
import { creditMetadata, encodeArgs, renderDeliverable, type RenderClaim } from "./render";
import { gradeFilter } from "./picture";

const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="#808080"/><circle cx="320" cy="180" r="80" fill="#c04040"/></svg>`;
function wav(seconds: number, amp: number) {
  const sr = 48000, n = sr * seconds, data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(amp * 32767 * Math.sin((2 * Math.PI * 1000 * i) / sr)), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8); h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
const media: Record<string, { bytes: Uint8Array; contentType: string }> = {
  "k/take.svg": { bytes: Buffer.from(svg), contentType: "image/svg+xml" },
  "k/line.wav": { bytes: wav(1.5, 0.3), contentType: "audio/wav" },
};
function manifest(profile: string, extra: Record<string, unknown> = {}): RenderManifest {
  const clip = (n: number, over: Record<string, unknown>) => ({ id: U(n), source_in: 0, source_frames: null, scene_id: U(90), shot_id: U(80), take_id: null, audio_session_version_id: null, grade: NEUTRAL_GRADE, label: `C${n}`, ...over });
  const r = renderManifestEngine({
    project: { id: U(1), title: "Render Test" }, profile: getDeliveryProfile(profile), options: { watermark: "FOR REVIEW", burn_timecode: true },
    picture_lock: { id: U(2), lock_number: 1, timeline_version_id: U(3) }, fps: 24,
    clips: [
      clip(10, { track: "V1", kind: "take", record_in: 0, duration: 24, take_id: U(20) }),
      clip(11, { track: "V1", kind: "take", record_in: 36, duration: 12, take_id: U(20), grade: { ...NEUTRAL_GRADE, exposure: 1 } }),
      clip(12, { track: "A1", kind: "audio_mix", record_in: 0, duration: 48, source_frames: 48, audio_session_version_id: U(30) }),
    ],
    takes: { [U(20)]: { storage_key: "k/take.svg", media_type: "image/svg+xml", capability: "image", duration_seconds: null } },
    mixes: { [U(30)]: { scene_id: U(90), version_number: 1, seconds: 2, tracks: [{ id: "t", family: "DX", gain_db: 0, pan: 0, mute: false, solo: false }, { id: "m", family: "MX", gain_db: -6, pan: 0, mute: false, solo: false }],
      clips: [
        { track_id: "t", kind: "asset", asset_id: U(40), start_seconds: 0.25, duration_seconds: 1.5, offset_seconds: 0, gain_db: 0, fade_in_seconds: 0.1, fade_out_seconds: 0.1, source: { dialogue_line_id: "l1" } },
        { track_id: "m", kind: "asset", asset_id: U(40), start_seconds: 0, duration_seconds: 1.5, offset_seconds: 0, gain_db: 0, fade_in_seconds: 0, fade_out_seconds: 0, source: {} },
      ] } },
    assets: { [U(40)]: { storage_key: "k/line.wav", media_type: "audio/wav" } },
    lines: { l1: { speaker: "TUNDE", text: "You came." } },
    ...extra,
  });
  if (!r.manifest) throw new Error(r.missing.join("; "));
  return r.manifest;
}
async function render(profile: string, extra: Record<string, unknown> = {}) {
  const store = mkdtempSync(join(tmpdir(), "store-"));
  const stages: string[] = [];
  const claim: RenderClaim = { render: { id: U(99), org_id: U(7), project_id: U(1), profile_id: profile, attempt: 1 }, manifest: manifest(profile, extra) };
  const out = await renderDeliverable(claim, {
    fetchMedia: async (k) => media[k],
    putFile: async (key, path) => (copyFileSync(path, join(store, key.split("/").pop()!)), statSync(path).size),
    keyFor: (r, name) => `${r.org_id}/${r.project_id}/renders/${r.id}/${name}`,
    progress: async (_p, stage) => (stages.push(stage), false),
    log: () => {},
    fontDir: "/usr/share/fonts/truetype/dejavu",
  });
  return { ...out, store, stages };
}
const failing = (qc: { checks: { ok: boolean; id: string; evidence: string }[] }) => qc.checks.filter((c) => !c.ok).map((c) => `${c.id}: ${c.evidence}`);

describe.skipIf(!hasFfmpeg)("render worker (real ffmpeg)", () => {
  it("streaming master: H.264 1080p24 + AAC + captions, exact length, QC passed", async () => {
    const r = await render("streaming_master");
    expect(failing(r.qc).filter((f) => !/^(loudness|true_peak)/.test(f))).toEqual([]);
    expect(r.qc.passed).toBe(true);
    expect(r.outputs.map((o) => o.name)).toEqual(["streaming_1080p24.mp4", "captions.srt"]);
    expect(r.outputs[0].sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(readFileSync(join(r.store, "captions.srt"), "utf8")).toContain("00:00:00,250 --> 00:00:01,750\nYou came.");
    expect(r.stages).toContain("Checking quality");
  }, 120000);
  it("the gap is black and the graded clip is brighter (grade survives the render)", async () => {
    const r = await render("streaming_master");
    const luma = (t: number) => {
      const raw = execFileSync("ffmpeg", ["-v", "error", "-ss", String(t), "-i", join(r.store, "streaming_1080p24.mp4"), "-frames:v", "1", "-vf", "crop=100:100:0:0,scale=1:1", "-f", "rawvideo", "-pix_fmt", "gray", "-"]);
      return raw[0];
    };
    const plain = luma(0.5), gap = luma(1.25), graded = luma(1.75);
    expect(gap).toBeLessThan(25);
    expect(graded).toBeGreaterThan(plain + 30);
  }, 120000);
  it("review copy (watermark + burned timecode) and ProRes master pass QC", async () => {
    const rv = await render("review_copy");
    expect(rv.qc.passed).toBe(true);
    const pr = await render("mezzanine_master");
    expect(pr.qc.passed).toBe(true);
    expect(pr.qc.checks.find((c) => c.id.startsWith("video_format"))!.evidence).toBe("prores 1920×1080 yuv422p10le");
  }, 180000);
  it("audio package: mix, four stems and M&E; the dialogue stem only has dialogue", async () => {
    const r = await render("audio_package");
    expect(r.qc.passed).toBe(true);
    expect(r.outputs.map((o) => o.name)).toEqual(["mix.wav", "stem_DX.wav", "stem_FX.wav", "stem_BG.wav", "stem_MX.wav", "ME.wav"]);
    const maxDb = (f: string) => {
      const res = execFileSync("sh", ["-c", `ffmpeg -hide_banner -i '${join(r.store, f)}' -af volumedetect -f null - 2>&1`], { encoding: "utf8" });
      return Number((/max_volume: (-?[\d.]+|-inf) dB/.exec(res)?.[1] ?? "NaN").replace("-inf", "-200"));
    };
    // Dialogue (0.3 peak, centre pan -3 dB) ≈ -13.5 dBFS; music at -6 dB ≈ -19.5 dBFS; FX/BG tracks don't exist -> silence.
    // The approved mix's default master limiter reaches the render (timelineAudioMix 2.0.0) and, like the browser's
    // DynamicsCompressorNode, adds its automatic make-up of +1.14 dB below the threshold.
    const MAKEUP = 1.14;
    expect(maxDb("stem_DX.wav")).toBeCloseTo(-13.5 + MAKEUP, 0);
    expect(maxDb("ME.wav")).toBeCloseTo(-19.5 + MAKEUP, 0);
    expect(maxDb("stem_MX.wav")).toBeCloseTo(-19.5 + MAKEUP, 0);
    expect(maxDb("stem_FX.wav")).toBeLessThan(-90);
    const size = (f: string) => statSync(join(r.store, f)).size;
    expect(size("mix.wav")).toBe(44 + 2 * 48000 * 2 * 3);
  }, 120000);
  it("timeline volume automation drawn in Editorial shapes the delivered sound (manifest 1.3.0)", async () => {
    const r = await render("audio_package", { automation: { A1: [{ frame: 0, db: -6 }] }, automation_revision: U(55) });
    expect(r.qc.passed).toBe(true);
    const maxDb = (f: string) => {
      const res = execFileSync("sh", ["-c", `ffmpeg -hide_banner -i '${join(r.store, f)}' -af volumedetect -f null - 2>&1`], { encoding: "utf8" });
      return Number(/max_volume: (-?[\d.]+) dB/.exec(res)?.[1]);
    };
    expect(maxDb("stem_DX.wav")).toBeCloseTo(-13.5 + 1.14 - 6, 0); // 6 dB lower than without automation
  }, 120000);
  it("opening title card and end-credits roll: the film is longer by exactly both, the captions move with the cut (manifest 1.4.0)", async () => {
    const t = titleSequenceEngine({ title: "Render Test", width: 1920, height: 1080, fps: 24, opening: { enabled: true, seconds: 2 }, end_credits: { enabled: true, speed: "fast" },
      credits: { director: "Ada Obi" }, cast: [{ character: "Tunde" }] });
    const titles = { opening: { frames: t.opening!.frames, svg: t.opening!.svg }, end_credits: { frames: t.end_credits!.frames, svg: t.end_credits!.svg, image_height: t.end_credits!.image_height }, engine_version: t.engine_version };
    const r = await render("streaming_master", { titles });
    expect(failing(r.qc).filter((f) => !/^(loudness|true_peak)/.test(f))).toEqual([]);
    const secs = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", join(r.store, "streaming_1080p24.mp4")]).toString());
    expect(secs).toBeCloseTo(2 + 2 + t.end_credits!.frames / 24, 1);
    expect(readFileSync(join(r.store, "captions.srt"), "utf8")).toContain("00:00:02,250 --> 00:00:03,750\nYou came.");
    const bright = (at: number) => { const raw = execFileSync("ffmpeg", ["-v", "error", "-ss", String(at), "-i", join(r.store, "streaming_1080p24.mp4"), "-frames:v", "1", "-vf", "scale=64:36", "-f", "rawvideo", "-pix_fmt", "gray", "-"]); return Math.max(...raw); };
    expect(bright(1)).toBeGreaterThan(120); // the title is on screen mid-card
    expect(bright(0.02)).toBeLessThan(60); // …and fades in from black
    expect(bright(4 + (t.end_credits!.frames / 24) * 0.45)).toBeGreaterThan(100); // credit lines are scrolling through
    // With the theme on, the title card is no longer silent (and the cut's own sound is unchanged).
    const r2 = await render("streaming_master", { titles, title_music: { description: "Main theme for the titles", mood: ["tense"], seed: 3 } });
    // Mean volume of the title card (0.3–1.5 s), from ffmpeg's volumedetect report.
    const probe = (store: string) => {
      const res = spawnSync("ffmpeg", ["-v", "info", "-ss", "0.3", "-t", "1.2", "-i", join(store, "streaming_1080p24.mp4"), "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" });
      const m = /mean_volume: (-?[\d.]+|-inf) dB/.exec(res.stderr)?.[1];
      return m === undefined || m === "-inf" ? -99 : Number(m);
    };
    expect(probe(r.store)).toBeLessThan(-80); // silent title card without the theme
    expect(probe(r2.store)).toBeGreaterThan(-40); // the theme plays under it
  }, 240000);
  it("on-screen text from Scene DNA is burned in over the start of its scene, then gone (manifest 1.5.0); QC passes", async () => {
    const captions = { [U(90)]: { text: "LAGOS — 1995", position: "lower_third" } };
    const r = await render("streaming_master", { captions });
    expect(failing(r.qc).filter((f) => !/^(loudness|true_peak)/.test(f))).toEqual([]);
    const plain = await render("streaming_master");
    // Brightest pixel in the lower-left third (where the text sits), from a frame at `at` seconds.
    const peak = (store: string, at: number) => Math.max(...execFileSync("ffmpeg", ["-v", "error", "-ss", String(at), "-i", join(store, "streaming_1080p24.mp4"), "-frames:v", "1",
      "-vf", "crop=900:200:60:820,scale=180:40", "-f", "rawvideo", "-pix_fmt", "gray", "-"]));
    expect(peak(r.store, 0.5)).toBeGreaterThan(peak(plain.store, 0.5) + 40); // the white text is on screen mid-scene-start
    expect(Math.abs(peak(r.store, 1.75) - peak(plain.store, 1.75))).toBeLessThan(6); // …and gone after its stretch
  }, 240000);
  it("subtitles and EDL", async () => {
    const s = await render("subtitles");
    expect(s.qc.passed).toBe(true);
    expect(readFileSync(join(s.store, "subtitles.vtt"), "utf8").startsWith("WEBVTT")).toBe(true);
    const e = await render("edit_decision_list");
    expect(readFileSync(join(e.store, "picture_lock.edl"), "utf8")).toContain("FCM: NON-DROP FRAME");
  }, 60000);
  it("cancelling stops the render", async () => {
    const claim: RenderClaim = { render: { id: U(98), org_id: U(7), project_id: U(1), profile_id: "streaming_master", attempt: 1 }, manifest: manifest("streaming_master") };
    await expect(renderDeliverable(claim, { fetchMedia: async (k) => media[k], putFile: async () => 0, keyFor: () => "k", progress: async () => true, log: () => {} })).rejects.toThrow(/Cancelled/);
  });
  it("regression: the final encode is limited by duration, never by a video frame count (ffmpeg 5.x truncated the sound)", () => {
    const a = encodeArgs(manifest("streaming_master"), [], "out.mp4");
    expect(a).not.toContain("-frames:v");
    expect(a[a.indexOf("-t") + 1]).toBe("2.000000");
    expect(a.slice(0, 4)).toEqual(["-map", "0:v:0", "-map", "1:a:0"]);
  });
  it("writes Project Settings credits into the file's metadata, and nothing when none are set", () => {
    const m = manifest("streaming_master");
    expect(creditMetadata(m)).toEqual([]);
    const withCredits = { ...m, project: { ...m.project, credits: { director: "Ada Obi", company: "Lagos Pictures", year: 2026, copyright: null } } };
    expect(creditMetadata(withCredits)).toEqual(["-metadata", "artist=Ada Obi", "-metadata", "director=Ada Obi", "-metadata", "publisher=Lagos Pictures", "-metadata", "date=2026"]);
    expect(encodeArgs(withCredits, [], "out.mp4")).toContain("publisher=Lagos Pictures");
  });
  it("grade filter is neutral when the grade is", () => {
    expect(gradeFilter(NEUTRAL_GRADE)).toBeNull();
    expect(gradeFilter({ ...NEUTRAL_GRADE, exposure: 1 })).toContain("rr=2.0000");
  });
});
