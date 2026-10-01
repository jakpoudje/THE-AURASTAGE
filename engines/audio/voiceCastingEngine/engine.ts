// engines/audio/voiceCastingEngine — Voice DNA (owner, 2026-09-28: "different voice types that reflect character DNAs").
// A character's base voice (type, pitch, pace, accent) comes from the Casting profile — gender, age, nationality,
// personality — and is stable for that character (same name → same voice). Each line's delivery adjusts it from the
// line's emotion and intensity (Dialogue Intelligence). The output is provider-neutral: the built-in voice uses the
// espeak parameters; paid voice providers use the description to pick a matching voice. Every choice says why.
import { z } from "zod";
import { ENGINE_VERSION } from "./version";

export const VoiceInputSchema = z.object({
  character: z.object({
    name: z.string().min(1).max(120), age: z.string().max(40).nullable().optional(), gender: z.string().max(60).nullable().optional(),
    nationality: z.string().max(100).nullable().optional(), accent: z.string().max(120).nullable().optional(), personality: z.string().max(4000).nullable().optional(), description: z.string().max(2000).nullable().optional(),
  }),
  line: z.object({ emotion: z.string().max(40).nullable().optional(), intensity: z.number().min(0).max(10).nullable().optional() }).nullable().default(null),
});
export type VoiceInput = z.input<typeof VoiceInputSchema>;

export interface VoiceOutput {
  voice_id: string; language: string; variant: string;
  /** espeak-style controls: pitch 0–99, speed words/min, amplitude 0–200. */
  pitch: number; speed: number; amplitude: number;
  gender: "female" | "male" | "unspecified"; age_band: "child" | "young" | "adult" | "elder";
  description: string;
  why: string[];
  engine_version: string;
}

function hash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}
const POOLS: Record<string, string[]> = {
  "female:child": ["f4"], "female:young": ["f2", "f4", "f5"], "female:adult": ["f1", "f3", "f5"], "female:elder": ["grandma", "f1"],
  "male:child": ["m3"], "male:young": ["m1", "m3", "m7"], "male:adult": ["m2", "m4", "m5", "m6"], "male:elder": ["grandpa", "m6"],
};
const EMOTION: Record<string, { speed: number; pitch: number; amp: number; word: string }> = {
  anger: { speed: 15, pitch: 4, amp: 30, word: "sharper and louder" }, fear: { speed: 20, pitch: 8, amp: 0, word: "faster and higher" },
  sadness: { speed: -25, pitch: -6, amp: -10, word: "slower and lower" }, joy: { speed: 10, pitch: 6, amp: 10, word: "brighter" },
  surprise: { speed: 12, pitch: 10, amp: 10, word: "lifted" }, tension: { speed: 8, pitch: 2, amp: 5, word: "tighter" },
  resignation: { speed: -20, pitch: -4, amp: -10, word: "flatter and slower" }, love: { speed: -10, pitch: 2, amp: -5, word: "softer" },
  contempt: { speed: -5, pitch: -3, amp: 5, word: "colder" }, determination: { speed: 5, pitch: 0, amp: 15, word: "firmer" },
  disgust: { speed: -5, pitch: -2, amp: 5, word: "clipped" }, trust: { speed: -5, pitch: 0, amp: 0, word: "steady" },
  anticipation: { speed: 8, pitch: 3, amp: 5, word: "leaning forward" },
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));

export function voiceCastingEngine(raw: VoiceInput): VoiceOutput {
  const { character: c, line } = VoiceInputSchema.parse(raw);
  const why: string[] = [];
  const g = (c.gender ?? "").toLowerCase();
  const gender = /\b(female|woman|girl|she|her|lady)\b/.test(g) ? "female" : /\b(male|man|boy|he|him|gentleman)\b/.test(g) ? "male" : "unspecified";
  const ageNum = Number((c.age ?? "").match(/\d{1,3}/)?.[0] ?? NaN);
  const age_band = Number.isNaN(ageNum) ? (/child|kid|boy|girl/i.test(`${c.age} ${c.description}`) ? "child" : "adult") : ageNum < 13 ? "child" : ageNum < 26 ? "young" : ageNum <= 55 ? "adult" : "elder";
  const h = hash(c.name.trim().toLowerCase());
  const sex = gender === "unspecified" ? (h % 2 ? "female" : "male") : gender;
  why.push(gender === "unspecified" ? `No gender in the profile — chose a ${sex} voice; set Gender in Casting to decide.` : `${gender === "female" ? "Female" : "Male"} (profile)`);
  why.push(Number.isNaN(ageNum) ? `Age not set — ${age_band} voice` : `Age ${ageNum} → ${age_band} voice`);
  const pool = POOLS[`${sex}:${age_band}`];
  const variant = pool[h % pool.length];

  // The accent the writer chose in Casting leads; otherwise the stated nationality (1.0.0 behaviour).
  const nat = (c.accent || c.nationality || "").toLowerCase();
  const language = /americ|u\.?s\.?a?\b|canad/.test(nat) ? "en-us" : /scot/.test(nat) ? "en-gb-scotland" : /irish|ireland/.test(nat) ? "en-gb-x-rp" : "en-gb";
  // Accents the free built-in voices speak from licence-clear corpora (1.2.0): Scottish, Northern English, Canadian,
  // Indian (male voices) and American / British Isles; the voice says when it falls back.
  const builtIn = /americ|u\.?s\.?a?\b|scot|british|england|northern english|english \(southern|irish|ireland|london|wales|welsh|canad|india|hindi|yorkshire|manchester|liverpool|geordie|newcastle/.test(nat)
    && !/niger|ghan|kenya|africa|jamaica|caribbean|nigeria/.test(nat);
  const spoken = language === "en-us" ? "American" : language === "en-gb-scotland" ? "Scottish" : "British";
  if (c.accent) why.push(`Accent (profile): ${c.accent} → built-in voice speaks ${builtIn ? `${c.accent} English where a matching free voice is installed` : `${spoken} English`}${builtIn ? "" : "; a paid voice provider matches the accent itself"}`);
  else if (c.nationality) why.push(`${c.nationality} → ${builtIn ? `${c.nationality} English where a matching free voice is installed` : `${spoken} English`}${builtIn ? "" : " (the built-in voice has no " + c.nationality + " accent; a paid voice provider can match it)"}`);

  let pitch = (sex === "female" ? 62 : 38) + (age_band === "child" ? 18 : age_band === "elder" ? -8 : age_band === "young" ? 4 : 0) + ((h >>> 3) % 13) - 6;
  let speed = 165 + ((h >>> 7) % 21) - 10;
  let amplitude = 110;
  const p = (c.personality ?? "").toLowerCase();
  if (/nervous|anxious|restless|energetic|excitable|impulsive/.test(p)) { speed += 18; why.push("Personality: quick, restless → faster"); }
  if (/calm|measured|deliberate|composed|stoic|reserved/.test(p)) { speed -= 15; why.push("Personality: measured → slower"); }
  if (/weary|tired|melanchol|world-weary/.test(p)) { speed -= 18; pitch -= 4; why.push("Personality: weary → slower, lower"); }
  if (/loud|brash|commanding|authoritative|forceful/.test(p)) { amplitude += 25; why.push("Personality: commanding → stronger"); }
  if (/shy|timid|quiet|soft-spoken|gentle/.test(p)) { amplitude -= 20; why.push("Personality: quiet → softer"); }

  let delivery = "";
  if (line?.emotion && EMOTION[line.emotion]) {
    const e = EMOTION[line.emotion], k = (line.intensity ?? 5) / 5;
    speed += e.speed * k; pitch += e.pitch * k; amplitude += e.amp * k;
    delivery = `, ${e.word} for ${line.emotion}${line.intensity != null ? ` (intensity ${line.intensity}/10)` : ""}`;
    why.push(`Line emotion ${line.emotion}${line.intensity != null ? ` at ${line.intensity}/10` : ""} → ${e.word}`);
  }
  pitch = clamp(pitch, 0, 99); speed = clamp(speed, 80, 260); amplitude = clamp(amplitude, 40, 200);
  const pace = speed < 150 ? "slow" : speed > 185 ? "quick" : "medium";
  const register = pitch < 35 ? "low" : pitch > 65 ? "high" : "mid";
  const description = `${age_band === "adult" ? "Adult" : age_band[0].toUpperCase() + age_band.slice(1)} ${sex} voice, ${register} register, ${pace} pace, ${language === "en-us" ? "American" : language === "en-gb-scotland" ? "Scottish" : "British"} English${c.accent ? `; accent: ${c.accent}` : ""}${c.nationality ? `; character is ${c.nationality}` : ""}${delivery}.`;
  return { voice_id: `${language}+${variant}`, language, variant, pitch, speed, amplitude, gender, age_band, description, why, engine_version: ENGINE_VERSION };
}
