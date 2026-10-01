import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { medianF0, pickSpeaker, prosody, wavSamples, type VoiceCatalogue } from "../neural/voices";
import { aurastageNeuralVoiceAdapter } from "../neural/aurastageNeuralVoiceAdapter";
import { audioBackendsFor } from "../index";
// The build-time measuring script must measure exactly like the runtime code.
// @ts-expect-error plain JS module
import { medianF0 as scriptF0 } from "../../../../scripts/piper-measure.mjs";

const voiced = (hz: number, rate = 22050, secs = 1) => {
  const s = new Float32Array(rate * secs);
  // A voice-like tone: fundamental plus two harmonics.
  for (let i = 0; i < s.length; i++) s[i] = 0.3 * Math.sin((2 * Math.PI * hz * i) / rate) + 0.15 * Math.sin((4 * Math.PI * hz * i) / rate) + 0.08 * Math.sin((6 * Math.PI * hz * i) / rate);
  return s;
};
function wavOf(samples: Float32Array, rate: number) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write("WAVE", 8); b.write("fmt ", 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((v, i) => b.writeInt16LE(Math.round(v * 32767), 44 + i * 2));
  return b;
}
const cat: VoiceCatalogue = { speakers: [
  { model: "en_GB-vctk-medium", id: 3, f0: 110 }, { model: "en_GB-vctk-medium", id: 7, f0: 132 }, { model: "en_GB-vctk-medium", id: 9, f0: 98 },
  { model: "en_GB-vctk-medium", id: 12, f0: 205 }, { model: "en_GB-vctk-medium", id: 15, f0: 228 }, { model: "en_GB-vctk-medium", id: 21, f0: 186 },
  { model: "en_US-libritts_r-medium", id: 40, f0: 120 }, { model: "en_US-libritts_r-medium", id: 41, f0: 210 },
] };

describe("neural voice: measuring and matching voices", () => {
  it("measures pitch from audio; the build script measures the same", () => {
    for (const hz of [95, 120, 180, 230]) {
      const f = medianF0(voiced(hz), 22050)!;
      expect(Math.abs(f - hz) / hz).toBeLessThan(0.03);
      expect(scriptF0(voiced(hz), 22050)).toBe(f);
    }
    expect(medianF0(new Float32Array(22050), 22050)).toBeNull(); // silence
    const w = wavSamples(new Uint8Array(wavOf(voiced(150, 16000), 16000)));
    expect(w.rate).toBe(16000);
    expect(Math.round(medianF0(w.samples, w.rate)!)).toBeGreaterThan(145);
  });
  it("matches Voice DNA by measured register and accent; the same character always gets the same speaker", () => {
    const deep = pickSpeaker(cat, { language: "en-gb", gender: "male", pitch: 5 }, "Tunde Okafor")!;
    expect(deep.gender).toBe("male");
    expect(deep.f0).toBeLessThan(165);
    expect(deep.model).toBe("en_GB-vctk-medium");
    expect(pickSpeaker(cat, { language: "en-gb", gender: "male", pitch: 5 }, "Tunde Okafor")).toEqual(deep);
    const high = pickSpeaker(cat, { language: "en-gb", gender: "female", pitch: 90 }, "Amara Bello")!;
    expect(high.f0).toBeGreaterThanOrEqual(165);
    expect(high.reason).toMatch(/measured at \d+ Hz/);
    expect(pickSpeaker(cat, { language: "en-us", gender: "female", pitch: 50 }, "Ramos")!.model).toBe("en_US-libritts_r-medium");
    expect(pickSpeaker({ speakers: [] }, { language: "en-gb", gender: "male", pitch: 5 }, "x")).toBeNull();
  });
  it("owner request 2026-10-01: a character's accent picks a speaker the corpus lists with that accent; never the wrong gender; other accents say plainly", () => {
    const acc: VoiceCatalogue = { speakers: [...cat.speakers,
      { model: "en_US-arctic-medium", id: 0, f0: 118, name: "awb" }, { model: "en_US-arctic-medium", id: 1, f0: 112, name: "jmk" },
      { model: "en_US-arctic-medium", id: 2, f0: 125, name: "ksp" }, { model: "en_US-arctic-medium", id: 3, f0: 190, name: "slt" },
      { model: "en_GB-northern_english_male-medium", id: 0, f0: 115, single: true },
    ] };
    const man = { language: "en-gb", gender: "male" as const, pitch: 40 }, woman = { language: "en-gb", gender: "female" as const, pitch: 50 };
    expect(pickSpeaker(acc, man, "Hamish", "Scottish")).toMatchObject({ model: "en_US-arctic-medium", speaker: 0, accent: "Scottish" });
    expect(pickSpeaker(acc, man, "Raj", "Indian")).toMatchObject({ speaker: 2, accent: "Indian" });
    expect(pickSpeaker(acc, man, "Luc", "Canadian")).toMatchObject({ speaker: 1, accent: "Canadian" });
    const north = pickSpeaker(acc, man, "Jack", "Yorkshire")!;
    expect(north).toMatchObject({ model: "en_GB-northern_english_male-medium", single: true, accent: "Northern English" });
    // No Northern English woman's voice: a British Isles woman's voice, said plainly — never a man's voice.
    const her = pickSpeaker(acc, woman, "Jess", "Yorkshire")!;
    expect(her.model).toBe("en_GB-vctk-medium");
    expect(her.f0).toBeGreaterThanOrEqual(165);
    expect(her.reason).toMatch(/no free Northern English female voice is installed/);
    // An accent no free model speaks: the default voice, and the reason says a paid provider can match it.
    const lagos = pickSpeaker(acc, man, "Tunde", "Nigerian")!;
    expect(lagos.accent).toBeNull();
    expect(lagos.reason).toMatch(/no free voice speaks a Nigerian accent yet; a paid voice provider can match it/);
  });
  it("delivery follows the line: slower and softer for sadness, faster and louder for anger", () => {
    const sad = prosody({ speed: 130, amplitude: 95 }), angry = prosody({ speed: 200, amplitude: 150 });
    expect(sad.length_scale).toBeGreaterThan(1);
    expect(angry.length_scale).toBeLessThan(1);
    expect(angry.gain).toBeGreaterThan(sad.gain);
  });
});

describe("neural voice adapter", () => {
  const dna = { language: "en-gb", gender: "male", pitch: 20, speed: 150, amplitude: 110, description: "Adult male voice, low register", why: ["Male (profile)"] };
  it("isn't configured without the engine and models, so it is never offered", () => {
    const env = { PIPER_DIR: join(tmpdir(), "no-piper-here") };
    expect(aurastageNeuralVoiceAdapter.isConfigured(env)).toBe(false);
    expect(audioBackendsFor("voice", env).map((a) => a.id)).not.toContain("aurastage-neural-voice");
  });
  it("runs the engine with the matched speaker and the line's pace, text on stdin, and returns the WAV with its credits", async () => {
    const dir = mkdtempSync(join(tmpdir(), "piper-"));
    mkdirSync(join(dir, "voices"));
    writeFileSync(join(dir, "voices", "speakers.json"), JSON.stringify(cat));
    writeFileSync(join(dir, "tone.wav"), wavOf(voiced(120), 22050));
    // A stand-in for the piper program: records its arguments and stdin, writes a WAV to --output_file.
    writeFileSync(join(dir, "piper"), `#!/bin/sh\necho "$@" > "${dir}/args.txt"\ncat > "${dir}/stdin.txt"\nwhile [ $# -gt 0 ]; do if [ "$1" = "--output_file" ]; then cp "${dir}/tone.wav" "$2"; fi; shift; done\n`);
    chmodSync(join(dir, "piper"), 0o755);
    const env = { PIPER_DIR: dir };
    expect(audioBackendsFor("voice", env)[0].id).toBe("aurastage-neural-voice");
    const r = await aurastageNeuralVoiceAdapter.generate({ kind: "voice", model: "piper-1", description: "They buried it; rm -rf /", duration_seconds: 2, mood: [], seed: 1,
      params: { voice: { ...dna, speed: 120 }, voice_base: dna, character_name: "Tunde Okafor" } }, env);
    const { readFileSync } = await import("node:fs");
    const args = readFileSync(join(dir, "args.txt"), "utf8");
    expect(args).toMatch(/--model .*en_GB-vctk-medium\.onnx --speaker (3|7|9) --length_scale 1\.4/);
    expect(readFileSync(join(dir, "stdin.txt"), "utf8")).toBe("They buried it; rm -rf /\n");
    expect(r.media_type).toBe("audio/wav");
    expect(r.duration_seconds).toBeCloseTo(1, 1);
    expect(r.detail.credits).toMatch(/VCTK \(CC BY 4\.0\)/);
    expect((r.detail.layers as any)[0].because).toMatch(/British Isles speaker \d+, measured at \d+ Hz/);
  });
});
