// apps/api/src/providers/audio/elevenlabs/elevenLabsAdapter.ts
// ElevenLabs (paid, one key: ELEVENLABS_API_KEY) — realism programme R2. Speaks dialogue in a voice chosen from the
// ElevenLabs voice library by the character's ACCENT (as written in Casting, never inferred from a name), gender and
// age band, with the line's emotion shaping delivery; makes sound effects/ambience/Foley from the cue's words and
// length; and composes score/theme music. Every result says which voice or model was used and why. Nothing here is
// called unless a person picks ElevenLabs (built-in generators stay the default, so nothing spends money by default).
import { ProviderError } from "../../types";
import type { AudioAdapter, AudioGenerateResult } from "../types";

const BASE = "https://api.elevenlabs.io";
type Env = Record<string, string | undefined>;
type Dna = { gender?: string; age_band?: string; pace?: string; speed?: number; description?: string };

/**
 * Casting accent / nationality words → the accent label used in the ElevenLabs voice library. African accents first
 * (owner request 2026-10-01). Region words (Yoruba, Igbo, Hausa…) map to their country and are kept as a hint.
 */
const ACCENTS: [RegExp, string][] = [
  [/nigeria|yoruba|igbo|hausa|lagos|abuja/i, "nigerian"],
  [/ghana|twi|akan|accra/i, "ghanaian"],
  [/kenya|swahili.*kenya|nairobi|kikuyu|luo\b/i, "kenyan"],
  [/south africa|zulu|xhosa|afrikaans|johannesburg|cape town/i, "south african"],
  [/uganda|kampala|luganda/i, "ugandan"],
  [/tanzania|dar es salaam/i, "tanzanian"],
  [/ethiopia|amharic|addis/i, "ethiopian"],
  [/cameroon|douala|yaound/i, "cameroonian"],
  [/senegal|dakar|wolof/i, "senegalese"],
  [/zimbabwe|shona|harare/i, "zimbabwean"],
  [/rwanda|kigali/i, "rwandan"],
  [/sierra leone|freetown/i, "sierra leonean"],
  [/jamaica/i, "jamaican"],
  [/scottish|scotland|glasgow|edinburgh/i, "scottish"],
  [/irish|ireland|dublin/i, "irish"],
  [/welsh|wales/i, "welsh"],
  [/indian|india|mumbai|delhi/i, "indian"],
  [/australia/i, "australian"],
  [/canad/i, "canadian"],
  [/american|united states|\busa?\b|new york|texas/i, "american"],
  [/british|english|england|london|rp\b/i, "british"],
  [/french|france|francophone/i, "french"],
];
export function accentLabel(text: string | null | undefined): string | null {
  if (!text) return null;
  for (const [re, label] of ACCENTS) if (re.test(text)) return label;
  return null;
}
const AGE: Record<string, string> = { child: "young", young: "young", adult: "middle_aged", elder: "old" };

/** Delivery from the line's emotion and intensity (stability lower = more expressive) and the Voice DNA's pace. */
export function deliverySettings(emotion: string | null, intensity: number | null, dna: Dna | undefined) {
  const i = Math.max(0, Math.min(10, intensity ?? 5));
  const calm = /calm|neutral|tender|sad|grief|tired/i.test(emotion ?? "");
  const stability = Math.round((calm ? 0.6 - i * 0.02 : 0.55 - i * 0.035) * 100) / 100;
  const style = Math.round(Math.min(0.8, i * 0.06) * 100) / 100;
  const speed = dna?.pace === "slow" ? 0.9 : dna?.pace === "quick" ? 1.1 : 1;
  return { stability: Math.max(0.2, stability), similarity_boost: 0.8, style, use_speaker_boost: true, speed };
}

/** 16-bit mono PCM → WAV, so the duration is exact and every browser can play it. */
function wav(pcm: Uint8Array, rate: number): Uint8Array {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return new Uint8Array(Buffer.concat([h, Buffer.from(pcm)]));
}

async function call(f: typeof fetch, env: Env, path: string, init: RequestInit & { json?: unknown }, signal?: AbortSignal) {
  const res = await f(`${BASE}${path}`, {
    method: init.method ?? (init.json ? "POST" : "GET"), signal,
    headers: { "xi-api-key": env.ELEVENLABS_API_KEY ?? "", ...(init.json ? { "content-type": "application/json" } : {}) },
    ...(init.json ? { body: JSON.stringify(init.json) } : {}),
  });
  const rid = res.headers.get("request-id") ?? res.headers.get("x-request-id");
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = text.slice(0, 300);
    try { const j = JSON.parse(text); msg = j?.detail?.message ?? j?.detail ?? j?.message ?? msg; } catch { /* plain text */ }
    throw new ProviderError(`ElevenLabs: ${typeof msg === "string" ? msg : JSON.stringify(msg).slice(0, 300)} (${res.status})`, rid, res.status === 429 || res.status >= 500);
  }
  return { res, rid };
}

/** Audio as WAV when the account allows raw PCM, otherwise MP3 (duration from the requested length or the bitrate). */
async function audio(f: typeof fetch, env: Env, path: string, json: unknown, fallbackSeconds: number | null, signal?: AbortSignal) {
  const sep = path.includes("?") ? "&" : "?";
  try {
    const { res, rid } = await call(f, env, `${path}${sep}output_format=pcm_24000`, { json }, signal);
    const pcm = new Uint8Array(await res.arrayBuffer());
    return { bytes: wav(pcm, 24000), media_type: "audio/wav", duration_seconds: pcm.length / 2 / 24000, sample_rate: 24000, channels: 1, rid };
  } catch (e) {
    if (!(e instanceof ProviderError) || !/output_format|pcm|tier|subscription/i.test(e.message)) throw e;
    const { res, rid } = await call(f, env, `${path}${sep}output_format=mp3_44100_128`, { json }, signal);
    const bytes = new Uint8Array(await res.arrayBuffer());
    return { bytes, media_type: "audio/mpeg", duration_seconds: fallbackSeconds ?? (bytes.length * 8) / 128000, sample_rate: 44100, channels: null, rid };
  }
}

type LibraryVoice = { voice_id: string; public_owner_id: string; name: string; accent?: string; gender?: string; age?: string; language?: string };
type MyVoice = { voice_id: string; name: string; labels?: Record<string, string> };

/** The voice for a character: one already in the account with the same accent/gender/age, else the library's best match (added to the account once). */
export async function chooseVoice(f: typeof fetch, env: Env, want: { accent: string | null; gender: string | null; age: string | null; character: string }, signal?: AbortSignal) {
  const mine = ((await (await call(f, env, "/v1/voices", {}, signal)).res.json()) as { voices?: MyVoice[] }).voices ?? [];
  const fits = (v: { accent?: string; gender?: string; age?: string }, strict: boolean) =>
    (!want.accent || (v.accent ?? "").toLowerCase() === want.accent) && (!want.gender || (v.gender ?? "").toLowerCase() === want.gender) && (!strict || !want.age || (v.age ?? "").toLowerCase() === want.age);
  const own = mine.find((v) => fits(v.labels ?? {}, true)) ?? mine.find((v) => fits(v.labels ?? {}, false));
  if (own) return { voice_id: own.voice_id, name: own.name, matched: own.labels?.accent ? `accent ${own.labels.accent}` : "account voice", source: "account" as const };
  const q = new URLSearchParams({ page_size: "30", language: "en", ...(want.accent ? { accent: want.accent } : {}), ...(want.gender ? { gender: want.gender } : {}), ...(want.age ? { age: want.age } : {}) });
  let lib = ((await (await call(f, env, `/v1/shared-voices?${q}`, {}, signal)).res.json()) as { voices?: LibraryVoice[] }).voices ?? [];
  let dropped: string | null = null;
  if (!lib.length && want.age) { q.delete("age"); dropped = "age"; lib = ((await (await call(f, env, `/v1/shared-voices?${q}`, {}, signal)).res.json()) as { voices?: LibraryVoice[] }).voices ?? []; }
  if (!lib.length && want.accent) {
    q.delete("accent"); dropped = "accent";
    lib = ((await (await call(f, env, `/v1/shared-voices?${q}`, {}, signal)).res.json()) as { voices?: LibraryVoice[] }).voices ?? [];
  }
  const pick = lib[0];
  if (!pick) throw new ProviderError("ElevenLabs has no library voice for this character's gender and age.");
  const added = (await (await call(f, env, `/v1/voices/add/${pick.public_owner_id}/${pick.voice_id}`, { json: { new_name: `${pick.name} (AuraStage)`.slice(0, 100) } }, signal)).res.json()) as { voice_id?: string };
  return { voice_id: added.voice_id ?? pick.voice_id, name: pick.name, matched: dropped === "accent" ? `no ${want.accent} voice in the library — closest by gender and age` : `library accent ${pick.accent ?? want.accent ?? "any"}`, source: "library" as const };
}

export const elevenLabsAdapter: AudioAdapter = {
  id: "elevenlabs",
  name: "ElevenLabs",
  execution: "external",
  kinds: ["voice", "fx", "foley", "ambience", "score"],
  models: [
    { id: "eleven_multilingual_v2", kinds: ["voice"], label: "Voices with accents (Multilingual v2)" },
    { id: "eleven_text_to_sound_v2", kinds: ["fx", "foley", "ambience"], label: "Sound effects" },
    { id: "music_v1", kinds: ["score"], label: "Music" },
  ],
  isConfigured: (env) => !!env.ELEVENLABS_API_KEY,
  note: "Paid. Voices chosen from the ElevenLabs library by the character's accent (African accents included), gender and age, with each line's emotion; sound effects timed to each cue; music for score and theme. Used only when you choose it.",
  async generate(req, env, opts = {}): Promise<AudioGenerateResult> {
    const f = opts.fetchImpl ?? fetch;
    if (!env.ELEVENLABS_API_KEY) throw new ProviderError("ElevenLabs isn't connected (ELEVENLABS_API_KEY is not set).");
    if (req.kind === "voice") {
      const dna = (req.params.voice_base ?? req.params.voice) as Dna | undefined;
      const lineDna = req.params.voice as (Dna & { emotion?: string; intensity?: number }) | undefined;
      const accentText = typeof req.params.accent === "string" ? req.params.accent : null;
      const want = { accent: accentLabel(accentText), gender: dna?.gender === "female" || dna?.gender === "male" ? dna.gender : null, age: AGE[dna?.age_band ?? ""] ?? null, character: String(req.params.character_name ?? "") };
      const v = await chooseVoice(f, env, want, opts.signal);
      const settings = deliverySettings((req.params.emotion as string | null) ?? null, (req.params.intensity as number | null) ?? null, lineDna ?? dna);
      const a = await audio(f, env, `/v1/text-to-speech/${v.voice_id}`, { text: req.description.slice(0, 5000), model_id: "eleven_multilingual_v2", voice_settings: settings }, null, opts.signal);
      return {
        bytes: a.bytes, media_type: a.media_type, duration_seconds: a.duration_seconds, sample_rate: a.sample_rate, channels: a.channels, provider_request_id: a.rid, cost_usd: null,
        detail: {
          layers: [{ name: `Voice: ${v.name}`, because: `${accentText ? `Casting accent “${accentText}” → ${want.accent ?? "no library accent match"}; ` : "No accent in Casting; "}${want.gender ?? "any"} ${want.age ?? ""} voice — ${v.matched}` }],
          voice: { id: v.voice_id, name: v.name, source: v.source, accent: want.accent, settings },
        },
      };
    }
    if (req.kind === "score") {
      const ms = Math.round(Math.min(300, Math.max(10, req.duration_seconds)) * 1000);
      const prompt = [req.description, req.mood.length ? `Mood: ${req.mood.join(", ")}.` : "", "Instrumental film score, no vocals."].filter(Boolean).join(" ").slice(0, 2000);
      const a = await audio(f, env, "/v1/music", { prompt, music_length_ms: ms, model_id: "music_v1" }, ms / 1000, opts.signal);
      return { bytes: a.bytes, media_type: a.media_type, duration_seconds: a.duration_seconds, sample_rate: a.sample_rate, channels: a.channels, provider_request_id: a.rid, cost_usd: null,
        detail: { layers: [{ name: "Music (ElevenLabs)", because: `Composed from the cue: ${prompt.slice(0, 160)}` }] } };
    }
    // Effects, Foley, ambience: up to 30 s per call (longer beds are looped in the mix).
    const secs = Math.round(Math.min(30, Math.max(0.5, req.duration_seconds)) * 10) / 10;
    const a = await audio(f, env, "/v1/sound-generation", { text: req.description.slice(0, 1000), duration_seconds: secs, prompt_influence: 0.4 }, secs, opts.signal);
    return { bytes: a.bytes, media_type: a.media_type, duration_seconds: a.duration_seconds, sample_rate: a.sample_rate, channels: a.channels, provider_request_id: a.rid, cost_usd: null,
      detail: { layers: [{ name: `${req.kind === "foley" ? "Foley" : req.kind === "ambience" ? "Ambience" : "Effect"} (ElevenLabs)`, because: `${secs} s from the cue “${req.description.slice(0, 120)}”${req.duration_seconds > 30 ? " (ElevenLabs makes up to 30 s; loop it across the scene)" : ""}` }] } };
  },
};
