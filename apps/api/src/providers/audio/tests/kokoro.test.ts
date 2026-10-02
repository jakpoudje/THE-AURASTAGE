import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { accentOf, kokoroSpeed, pickKokoroVoice, type KokoroCatalogue } from "../kokoro/cast";
import { audioBackendsFor, defaultVoiceBackend, kokoroVoiceAdapter } from "..";

// Measured pitches as voices.json records them (values in the range the build measures).
const cat: KokoroCatalogue = {
  model: "onnx-community/Kokoro-82M-v1.0-ONNX",
  voices: [
    { id: "af_heart", name: "Heart", gender: "female", accent: "american", grade: "A", f0: 205 },
    { id: "af_bella", name: "Bella", gender: "female", accent: "american", grade: "A-", f0: 222 },
    { id: "af_nicole", name: "Nicole", gender: "female", accent: "american", grade: "B-", f0: 188 },
    { id: "af_sky", name: "Sky", gender: "female", accent: "american", grade: "C-", f0: 245 },
    { id: "am_fenrir", name: "Fenrir", gender: "male", accent: "american", grade: "C+", f0: 112 },
    { id: "am_michael", name: "Michael", gender: "male", accent: "american", grade: "C+", f0: 124 },
    { id: "am_puck", name: "Puck", gender: "male", accent: "american", grade: "C+", f0: 140 },
    { id: "am_onyx", name: "Onyx", gender: "male", accent: "american", grade: "D", f0: 98 },
    { id: "bf_emma", name: "Emma", gender: "female", accent: "british", grade: "B-", f0: 210 },
    { id: "bf_isabella", name: "Isabella", gender: "female", accent: "british", grade: "C", f0: 196 },
    { id: "bm_george", name: "George", gender: "male", accent: "british", grade: "C", f0: 108 },
    { id: "bm_fable", name: "Fable", gender: "male", accent: "british", grade: "C", f0: 131 },
  ],
};
const dna = (over: Record<string, unknown> = {}) => ({ language: "en-gb", gender: "male" as const, pitch: 40, age_band: "adult" as const, ...over });

describe("Kokoro natural voice casting (owner request 2026-10-02: voices that know male, female, adult, young)", () => {
  it("casts by gender and accent from Casting: never a man's voice for a woman, British or American as asked", () => {
    const w = pickKokoroVoice(cat, dna({ gender: "female", pitch: 60 }), "Amara Bello", "British")!;
    expect(w).toMatchObject({ gender: "female", accent: "british" });
    expect(w.voice).toMatch(/^bf_/);
    const m = pickKokoroVoice(cat, dna({ language: "en-us", pitch: 30 }), "Tunde", "New York")!;
    expect(m.voice).toMatch(/^am_/);
    expect(m.reason).toMatch(/American male voice/);
  });
  it("the same character always gets the same voice; different characters of the same kind are spread across voices", () => {
    const a = pickKokoroVoice(cat, dna(), "Chidi Okafor", "British")!.voice;
    expect(pickKokoroVoice(cat, dna(), "Chidi Okafor", "British")!.voice).toBe(a);
    const names = ["Chidi", "Emeka", "Femi", "Kola", "Segun", "Dayo", "Bayo", "Ike"];
    const us = new Set(names.map((n) => pickKokoroVoice(cat, dna({ language: "en-us" }), n, "American")!.voice));
    expect(us.size).toBeGreaterThan(1);
  });
  it("age shapes the voice: elders lower and slower, the young higher and quicker; children are said to need a paid provider", () => {
    const elder = pickKokoroVoice(cat, dna({ language: "en-us", gender: "female", pitch: 50, age_band: "elder" }), "Mama Ngozi", "American")!;
    const young = pickKokoroVoice(cat, dna({ language: "en-us", gender: "female", pitch: 50, age_band: "young" }), "Mama Ngozi", "American")!;
    expect(elder.speed_factor).toBeLessThan(1);
    expect(young.speed_factor).toBeGreaterThan(1);
    expect(elder.reason).toMatch(/an elder female/);
    const child = pickKokoroVoice(cat, dna({ language: "en-us", gender: "male", pitch: 50, age_band: "child" }), "Little Obi", null)!;
    expect(child.reason).toMatch(/no child voices/);
    expect(kokoroSpeed({ speed: 168 }, elder)).toBeLessThan(kokoroSpeed({ speed: 168 }, young));
    expect(kokoroSpeed({ speed: 400 }, young)).toBe(1.4);
  });
  it("an accent the free model can't speak is said plainly (never pretended)", () => {
    expect(accentOf("en-gb", "Nigerian (Yoruba)")).toMatchObject({ accent: "british", matched: false });
    const p = pickKokoroVoice(cat, dna(), "Adebayo", "Nigerian (Yoruba)")!;
    expect(p.reason).toMatch(/no free voice speaks a Nigerian \(Yoruba\) accent yet .*ElevenLabs/);
    expect(accentOf("en-us", null)).toMatchObject({ accent: "american", matched: true });
    // Regional British Isles accents are never claimed by Kokoro's standard-English voices.
    expect(accentOf("en-gb", "Scottish (Glasgow)")).toMatchObject({ matched: false });
    expect(accentOf("en-gb", "Northern English")).toMatchObject({ matched: false });
    expect(accentOf("en-gb", "London")).toMatchObject({ accent: "british", matched: true });
    // Live regression 2026-10-02: "Nigerian English" contains "English" but is not a British accent.
    expect(accentOf("en-gb", "Nigerian English (south-west, Lagos)")).toMatchObject({ matched: false });
    expect(pickKokoroVoice(cat, dna({ gender: "female" }), "Amara", "Nigerian English (south-west, Lagos)")!.reason).toMatch(/no free voice speaks a Nigerian English .* accent yet/);
    expect(accentOf("en-gb", "Standard British English")).toMatchObject({ matched: true });
    expect(accentOf("en-us", "General American")).toMatchObject({ accent: "american", matched: true });
  });
  it("comes before the Piper voice when installed, and reports not configured (Piper used) when it isn't", () => {
    expect(kokoroVoiceAdapter.isConfigured({ KOKORO_DIR: "/nonexistent" })).toBe(false);
    expect(audioBackendsFor("voice", { KOKORO_DIR: "/nonexistent", PIPER_DIR: "/nonexistent" }).map((a) => a.id)).not.toContain("aurastage-kokoro-voice");
  });

  it("speaks through one long-lived speaker process (stand-in model): a WAV comes back with the cast voice and the reason; failures are reported", async () => {
    const d = mkdtempSync(join(tmpdir(), "kokoro-test-"));
    writeFileSync(join(d, "voices.json"), JSON.stringify(cat));
    // Same protocol as scripts/kokoro-say.mjs: {ready} first, then one reply per request line (a 0.5 s tone at 24 kHz).
    writeFileSync(join(d, "kokoro-say.mjs"), `
      import { createInterface } from "node:readline"; import { writeFileSync } from "node:fs";
      process.stdout.write(JSON.stringify({ ready: true }) + "\\n");
      createInterface({ input: process.stdin }).on("line", (l) => {
        const r = JSON.parse(l);
        if (r.text === "fail") return process.stdout.write(JSON.stringify({ id: r.id, ok: false, error: "model error" }) + "\\n");
        const n = 12000, b = Buffer.alloc(44 + n * 2);
        b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVE", 8); b.write("fmt ", 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
        b.writeUInt32LE(24000, 24); b.writeUInt32LE(48000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(n * 2, 40);
        for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(8000 * Math.sin(i / 10)), 44 + i * 2);
        writeFileSync(r.out, b); process.stdout.write(JSON.stringify({ id: r.id, ok: true, seconds: 0.5, rate: 24000, voice: r.voice, speed: r.speed }) + "\\n");
      });`);
    const env = { KOKORO_DIR: d };
    expect(kokoroVoiceAdapter.isConfigured(env)).toBe(true);
    expect(audioBackendsFor("voice", env)[0].id).toBe("aurastage-kokoro-voice");
    const voice = { language: "en-gb", gender: "female", pitch: 60, speed: 150, amplitude: 110, description: "Adult female voice", age_band: "adult", why: ["Emotion: calm"] };
    const req = { kind: "voice" as const, model: "kokoro-82m", description: "The ferry leaves at six.", duration_seconds: 2, mood: [], seed: 1, params: { voice, voice_base: voice, character_name: "Amara", accent: "British" } };
    const [a, b] = await Promise.all([kokoroVoiceAdapter.generate(req, env), kokoroVoiceAdapter.generate({ ...req, description: "And she won't wait." }, env)]);
    expect(a).toMatchObject({ media_type: "audio/wav", duration_seconds: 0.5, sample_rate: 24000, channels: 1, cost_usd: 0 });
    expect((a.detail.voice as any).voice).toMatch(/^bf_/);
    expect((a.detail.voice as any).speed).toBe(0.89);
    expect(String((a.detail.layers as any)[0].because)).toMatch(/British female voice/);
    expect(b.bytes.length).toBe(44 + 24000);
    await expect(kokoroVoiceAdapter.generate({ ...req, description: "fail" }, env)).rejects.toThrow(/natural voice failed: model error/);
    // An accent only the Piper corpora speak (Scottish, Northern English, Canadian, Indian) keeps the Piper voice.
    const piper = mkdtempSync(join(tmpdir(), "piper-test-"));
    writeFileSync(join(piper, "piper"), "");
    mkdirSync(join(piper, "voices"));
    writeFileSync(join(piper, "voices", "speakers.json"), JSON.stringify({ speakers: [{ model: "en_US-arctic-medium", id: 0, f0: 110, name: "awb" }] }));
    const both = { KOKORO_DIR: d, PIPER_DIR: piper };
    expect(defaultVoiceBackend("Scottish (Glasgow)", both)?.id).toBe("aurastage-neural-voice");
    expect(defaultVoiceBackend("British", both)?.id).toBe("aurastage-kokoro-voice");
    expect(defaultVoiceBackend(null, both)?.id).toBe("aurastage-kokoro-voice");
    expect(defaultVoiceBackend("Scottish", env)?.id).toBe("aurastage-kokoro-voice");
  });
});
