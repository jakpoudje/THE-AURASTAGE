import { describe, expect, it } from "vitest";
import { accentLabel, audioBackendsFor, audioStatuses, deliverySettings, elevenLabsAdapter } from "..";
import { accentLabel as al } from "../elevenlabs/elevenLabsAdapter";

type Call = { url: string; method: string; body: any; key: string | null };
function fakeFetch(routes: (c: Call) => { status?: number; json?: unknown; bytes?: Uint8Array } ) {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit) => {
    const c: Call = { url, method: String(init.method), body: init.body ? JSON.parse(String(init.body)) : null, key: (init.headers as Record<string, string>)["xi-api-key"] ?? null };
    calls.push(c);
    const r = routes(c);
    const status = r.status ?? 200;
    const body = r.bytes ? Buffer.from(r.bytes) : JSON.stringify(r.json ?? {});
    return new Response(body, { status, headers: { "request-id": "req-1" } });
  }) as unknown as typeof fetch;
  return { f, calls };
}
const pcm = new Uint8Array(24000 * 2); // one second of 24 kHz mono 16-bit silence
const env = { ELEVENLABS_API_KEY: "k" };

describe("ElevenLabs (R2)", () => {
  it("is never a default and never offered without its key", () => {
    expect(audioBackendsFor("voice", {}).map((a) => a.id)).not.toContain("elevenlabs");
    expect(audioBackendsFor("fx", env)[0].id).toBe("aurastage-synth"); // built-in stays first: nothing spends money by default
    expect(audioBackendsFor("fx", env).map((a) => a.id)).toContain("elevenlabs");
    expect(audioStatuses({}).find((a) => a.id === "elevenlabs")).toMatchObject({ state: "not_configured", execution: "external" });
  });
  it("maps Casting accents to library accents — African accents included; nothing from a name", () => {
    expect(al("Nigerian English (Yoruba)")).toBe("nigerian");
    expect(accentLabel("Igbo")).toBe("nigerian");
    expect(accentLabel("Ghanaian (Twi)")).toBe("ghanaian");
    expect(accentLabel("Kenyan")).toBe("kenyan");
    expect(accentLabel("South African (Zulu)")).toBe("south african");
    expect(accentLabel("Ethiopian (Amharic)")).toBe("ethiopian");
    expect(accentLabel("Senegalese (Wolof)")).toBe("senegalese");
    expect(accentLabel("Zimbabwean")).toBe("zimbabwean");
    expect(accentLabel("Scottish (Glasgow)")).toBe("scottish");
    expect(accentLabel(null)).toBeNull();
    expect(accentLabel("Mysterious")).toBeNull();
  });
  it("emotion shapes delivery: an intense line is more expressive than a calm one", () => {
    const hot = deliverySettings("anger", 9, { pace: "quick" }), calm = deliverySettings("calm", 3, { pace: "slow" });
    expect(hot.stability).toBeLessThan(calm.stability);
    expect(hot.style).toBeGreaterThan(calm.style);
    expect([hot.speed, calm.speed]).toEqual([1.1, 0.9]);
  });
  it("speaks a line in a library voice found by accent, gender and age; adds it to the account once; returns a WAV", async () => {
    const { f, calls } = fakeFetch((c) => {
      if (c.url.endsWith("/v1/voices")) return { json: { voices: [] } };
      if (c.url.includes("/v1/shared-voices")) return { json: { voices: [{ voice_id: "lib1", public_owner_id: "own1", name: "Adaeze", accent: "nigerian", gender: "female", age: "middle_aged" }] } };
      if (c.url.includes("/v1/voices/add/own1/lib1")) return { json: { voice_id: "acct1" } };
      if (c.url.includes("/v1/text-to-speech/acct1")) return { bytes: pcm };
      return { status: 404, json: { detail: { message: "unexpected " + c.url } } };
    });
    const r = await elevenLabsAdapter.generate({ kind: "voice", model: "eleven_multilingual_v2", description: "You came.", duration_seconds: 2, mood: [], seed: 1,
      params: { voice_base: { gender: "female", age_band: "adult", pace: "medium" }, voice: { gender: "female", age_band: "adult" }, accent: "Nigerian English (Igbo)", character_name: "Amara", emotion: "relief", intensity: 6 } }, env, { fetchImpl: f });
    const search = calls.find((c) => c.url.includes("shared-voices"))!.url;
    expect(search).toMatch(/accent=nigerian/); expect(search).toMatch(/gender=female/); expect(search).toMatch(/age=middle_aged/);
    const tts = calls.find((c) => c.url.includes("text-to-speech"))!;
    expect(tts.url).toMatch(/output_format=pcm_24000/);
    expect(tts.body).toMatchObject({ text: "You came.", model_id: "eleven_multilingual_v2" });
    expect(tts.key).toBe("k");
    expect(Buffer.from(r.bytes.slice(0, 4)).toString()).toBe("RIFF");
    expect(r).toMatchObject({ media_type: "audio/wav", duration_seconds: 1, sample_rate: 24000, provider_request_id: "req-1", cost_usd: null });
    expect(JSON.stringify(r.detail)).toMatch(/Nigerian English \(Igbo\).*nigerian/);
  });
  it("uses a voice already in the account with the same accent instead of adding another", async () => {
    const { f, calls } = fakeFetch((c) => {
      if (c.url.endsWith("/v1/voices")) return { json: { voices: [{ voice_id: "mine", name: "Kofi", labels: { accent: "ghanaian", gender: "male", age: "middle_aged" } }] } };
      if (c.url.includes("text-to-speech/mine")) return { bytes: pcm };
      return { status: 500, json: { detail: "should not be called: " + c.url } };
    });
    await elevenLabsAdapter.generate({ kind: "voice", model: "x", description: "Hello.", duration_seconds: 1, mood: [], seed: 1, params: { voice_base: { gender: "male", age_band: "adult" }, accent: "Ghanaian" } }, env, { fetchImpl: f });
    expect(calls.some((c) => c.url.includes("shared-voices") || c.url.includes("/voices/add/"))).toBe(false);
  });
  it("says plainly when the library has no voice with that accent (closest by gender and age)", async () => {
    const { f } = fakeFetch((c) => {
      if (c.url.endsWith("/v1/voices")) return { json: { voices: [] } };
      if (c.url.includes("shared-voices") && c.url.includes("accent=")) return { json: { voices: [] } };
      if (c.url.includes("shared-voices")) return { json: { voices: [{ voice_id: "v", public_owner_id: "o", name: "Sam", gender: "male" }] } };
      if (c.url.includes("/voices/add/")) return { json: { voice_id: "v2" } };
      return { bytes: pcm };
    });
    const r = await elevenLabsAdapter.generate({ kind: "voice", model: "x", description: "Hi.", duration_seconds: 1, mood: [], seed: 1, params: { voice_base: { gender: "male", age_band: "elder" }, accent: "Cameroonian" } }, env, { fetchImpl: f });
    expect(JSON.stringify(r.detail)).toMatch(/no cameroonian voice in the library/);
  });
  it("makes a sound effect for the cue's length (max 30 s) and music for score; falls back to MP3 when raw audio isn't on the plan", async () => {
    const { f, calls } = fakeFetch((c) => {
      if (c.url.includes("sound-generation") && c.url.includes("pcm")) return { status: 403, json: { detail: { message: "output_format pcm_24000 requires a higher tier" } } };
      return { bytes: new Uint8Array(1000) };
    });
    const fx = await elevenLabsAdapter.generate({ kind: "fx", model: "x", description: "door slams", duration_seconds: 45, mood: [], seed: 1, params: {} }, env, { fetchImpl: f });
    expect(calls.find((c) => c.url.includes("sound-generation") && c.url.includes("mp3"))!.body).toMatchObject({ text: "door slams", duration_seconds: 30 });
    expect(fx).toMatchObject({ media_type: "audio/mpeg", duration_seconds: 30 });
    const m = await elevenLabsAdapter.generate({ kind: "score", model: "music_v1", description: "Tense strings", duration_seconds: 20, mood: ["tense"], seed: 1, params: {} }, env, { fetchImpl: f });
    expect(calls.find((c) => c.url.includes("/v1/music"))!.body).toMatchObject({ music_length_ms: 20000, model_id: "music_v1" });
    expect(m.duration_seconds).toBeGreaterThan(0);
  });
  it("reports provider errors plainly with the request id; never runs without the key", async () => {
    const { f } = fakeFetch(() => ({ status: 401, json: { detail: { message: "Invalid API key" } } }));
    await expect(elevenLabsAdapter.generate({ kind: "fx", model: "x", description: "rain", duration_seconds: 2, mood: [], seed: 1, params: {} }, env, { fetchImpl: f })).rejects.toThrow(/ElevenLabs: Invalid API key \(401\)/);
    await expect(elevenLabsAdapter.generate({ kind: "fx", model: "x", description: "rain", duration_seconds: 2, mood: [], seed: 1, params: {} }, {}, { fetchImpl: f })).rejects.toThrow(/isn't connected/);
  });
});
