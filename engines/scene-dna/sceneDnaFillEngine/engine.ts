// engines/scene-dna/sceneDnaFillEngine
// Built-in story intelligence (owner, 2026-09-30): proposes every Scene DNA field — Scene Overview (purpose, stakes,
// story time, mood), Visual & Sound (weather, atmosphere, lighting, sound, camera energy) and Continuity — from the
// scene's own action lines, its dialogue and performance, the scenes around it and the story setup. Deterministic and
// free; each field carries the evidence it came from. Callers only fill fields that are empty.
import { ATMOSPHERE, SOUND, WEATHER } from "../sceneDnaAssemblyEngine/rules";
import { SceneDnaFillInputSchema, type SceneDnaFillOutput } from "./schema";
import { ENGINE_VERSION } from "./version";

type Emotion = string;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const title = (s: string) => s.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
const clip = (s: string, n: number) => {
  const t = s.trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n - 1);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return end > n * 0.5 ? cut.slice(0, end + 1) : `${cut.slice(0, Math.max(cut.lastIndexOf(" "), n * 0.5)).trimEnd()}…`;
};
const quote = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const sentences = (lines: string[]) => lines.join(" ").replace(/\s+/g, " ").split(/(?<=[.!?])\s+(?=[A-Z"“(])/).map((x) => x.trim()).filter(Boolean);
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

const CONTINUOUS = /^(CONTINUOUS|SAME|SAME TIME)$/i;
const LATER = /^(LATER|MOMENTS LATER|A MOMENT LATER|SHORTLY AFTER)$/i;
const MOOD_OF: Record<Emotion, string> = {
  tension: "tense", fear: "uneasy", sadness: "melancholic", love: "intimate", anger: "volatile", determination: "resolute",
  anticipation: "expectant", surprise: "unsettled", joy: "warm", contempt: "hostile", resignation: "weary", trust: "hopeful", disgust: "sour",
};
const WEATHER_TEXT: Record<string, string> = { rain: "Rain", storm: "Stormy — thunder and lightning", fog: "Fog and haze", snow: "Snow", wind: "Windy", heat: "Hot and humid", sun: "Bright, hard sun" };
const PRACTICALS: [RegExp, string][] = [
  [/\b(fluorescent|tube light|strip light)\b/i, "a fluorescent tube"], [/\b(lamp|lamps|bulb|bulbs)\b/i, "lamps"], [/\bcandles?\b/i, "candlelight"],
  [/\b(torch|torches|flashlight)\b/i, "torch beams"], [/\b(phone screens?|phones? (?:glow|light)|screen glow)\b/i, "phone screens"], [/\b(tv|television|monitor|screens?)\b/i, "screen glow"],
  [/\bneon\b/i, "neon"], [/\b(fire|bonfire|flames?|brazier)\b/i, "firelight"], [/\bheadlights?\b/i, "headlights"], [/\blanterns?\b/i, "lanterns"],
  [/\b(street ?lights?|sodium)\b/i, "streetlights"], [/\bmoon(?:light)?\b/i, "moonlight"], [/\bwindows?\b/i, "window light"],
];
const ACTION_VERBS = /\b(runs?|running|chases?|chasing|fights?|fighting|struggles?|explodes?|explosion|crash(?:es)?|punch(?:es)?|grabs?|flees?|fleeing|shoves?|scrambles?|sprints?|bursts?|shoots?|fires|riot|stampede)\b/gi;
const MARKS = /\b(bleed\w*|blood\w*|wound\w*|bruis\w*|limp\w*|bandag\w*|stain\w*|torn|ripped|soaked|drenched|wet|sweat\w*|mud\w*|dust\w*|ink|purple thumb)\b/i;
const HELD = /\b(?:holds?|holding|carr(?:y|ies|ying)|clutch(?:es|ing)?|picks? up|grabs?|pockets?|hands? (?:over|him|her|them))\s+(?:up\s+)?(?:a |an |the |his |her |their |its )?((?:[a-z][a-z-]* ){0,2}[a-z][a-z-]*)/gi;
const STOP = new Set(["it", "him", "her", "them", "up", "out", "back", "on", "to", "and", "breath", "hand", "hands", "gaze", "moment", "tongue", "silence", "position", "ground"]);

export function sceneDnaFillEngine(raw: unknown): SceneDnaFillOutput {
  const { scene, lines, characters, previous, next, is_first, is_last, project } = SceneDnaFillInputSchema.parse(raw);
  const ev: Record<string, string> = {};
  const all = scene.action.join("\n");
  const sents = sentences(scene.action);
  const place = title(scene.location ?? scene.heading.replace(/^(INT|EXT|INT\/EXT|I\/E)\.?\s*/i, "").split(/\s+-\s+/)[0] ?? "the location");
  const rawTime = (scene.time_of_day ?? "").trim();
  const inherits = CONTINUOUS.test(rawTime) || LATER.test(rawTime);
  const time = (inherits ? previous?.time_of_day ?? "" : rawTime).toUpperCase();
  const tod = /NIGHT|MIDNIGHT/.test(time) ? "night" : /DAWN|SUNRISE/.test(time) ? "dawn" : /DUSK|SUNSET|EVENING/.test(time) ? "evening" : /MORNING/.test(time) ? "morning" : /AFTERNOON/.test(time) ? "afternoon" : /DAY|NOON/.test(time) ? "day" : "";
  const ext = /EXT/i.test(scene.int_ext ?? scene.heading.slice(0, 8)) && !/^INT\b/i.test(scene.int_ext ?? "");

  // Speakers by how much they carry the scene, and the peak moment.
  const count = new Map<string, number>();
  for (const l of lines) count.set(l.speaker, (count.get(l.speaker) ?? 0) + 1);
  const speakers = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => title(s));
  const peak = lines.reduce<(typeof lines)[number] | null>((best, l) => ((l.intensity ?? 0) > (best?.intensity ?? -1) ? l : best), null);
  const cast = characters.length ? characters.map(title) : speakers;
  const who = cast.length ? list(cast.slice(0, 4)) + (cast.length > 4 ? ` and ${cast.length - 4} more` : "") : "";

  // ---- Mood: the dialogue's emotions, then the action's atmosphere words, then the story's tone ----
  const emo = new Map<string, number>();
  for (const l of lines) if (l.emotion && l.emotion !== "neutral") emo.set(l.emotion, (emo.get(l.emotion) ?? 0) + 1 + (l.intensity ?? 0) / 10);
  const moods = [...emo.entries()].sort((a, b) => b[1] - a[1]).map(([e]) => MOOD_OF[e]).filter(Boolean);
  for (const a of ATMOSPHERE) if (a.re.test(all) && ["tense", "dark", "quiet"].includes(a.value) && !(a.value === "quiet" && /\b(crowd|packed|bustling)/i.test(all))) moods.push(a.value);
  if (!moods.length && project.tone) moods.push(...project.tone.toLowerCase().split(/[,/]| and /).map((x) => x.trim()).filter((x) => x && x.length <= 40));
  if (!moods.length) moods.push(tod === "night" ? "hushed" : "grounded");
  const mood = [...new Set(moods)].slice(0, 3);
  ev.mood = emo.size ? "the emotions in the scene's dialogue" : project.tone ? "the story's tone" : "the action lines";

  // ---- Story time ----
  const flash = /\b(flash\s*back|memory|dream)\b/i.test(`${scene.heading} ${all}`);
  const year = `${scene.heading} ${all}`.match(/\b(1[5-9]\d\d|20\d\d)\b/)?.[1];
  let story_time: string;
  if (CONTINUOUS.test(rawTime) && previous) story_time = `Continuous from Scene ${previous.number}${previous.time_of_day && !CONTINUOUS.test(previous.time_of_day) ? ` (${previous.time_of_day.toLowerCase()})` : ""}`;
  else if (LATER.test(rawTime) && previous) story_time = `${cap(rawTime.toLowerCase())}, after Scene ${previous.number}`;
  else story_time = cap(tod || rawTime.toLowerCase() || "unspecified time");
  if (flash) story_time += " — a flashback";
  if (year) story_time += `, ${year}`;
  else if (project.time_period && !flash) story_time += `, ${project.time_period}`;
  ev.story_time = rawTime ? `the heading (${rawTime})` : "the story setup";

  // ---- Weather ----
  const found = WEATHER.filter((w) => w.re.test(all)).map((w) => WEATHER_TEXT[w.value] ?? w.value);
  // Bodies sweating in an exterior scene say it is hot even when the script never says "heat".
  if (ext && !found.includes(WEATHER_TEXT.heat) && /\bsweat\w*/i.test(all)) found.push(WEATHER_TEXT.heat);
  const weather = found.length ? `${list(found)}${tod ? `, ${tod}` : ""}.` : ext ? `Dry and still${tod ? ` ${tod}` : ""}${project.setting ? ` in ${project.setting}` : ""} — the script names no weather.` : "Interior — outside weather doesn't play.";
  ev.weather = found.length ? "weather words in the action" : ext ? "exterior scene with no weather in the script" : "interior scene";

  // ---- Atmosphere: the script's own opening picture, with its atmosphere words ----
  const atmoWords = ATMOSPHERE.filter((a) => a.re.test(all)).map((a) => a.value).filter((v, _i, xs) => !(v === "quiet" && xs.includes("crowded")));
  const opening = sents.slice(0, 2).join(" ");
  const atmosphere = clip(`${atmoWords.length ? `${cap(list(atmoWords))}. ` : ""}${opening || `${place}${tod ? ` at ${tod}` : ""}.`}`, 500);
  ev.atmosphere = opening ? "the scene's opening action lines" : "the heading";

  // ---- Lighting: time of day and interior/exterior, motivated by the sources the action names ----
  const sources = PRACTICALS.filter(([re]) => re.test(all)).map(([, s]) => s);
  const dark = mood.some((m) => /tense|uneasy|volatile|hostile|dark|hushed/.test(m));
  const warm = mood.some((m) => /warm|intimate|hopeful/.test(m));
  const base = ext
    ? ({ night: "Night exterior: only motivated sources", dawn: "Cool pre-dawn blue warming as the sun comes up", evening: "Low, warm sun fading into the first practicals", morning: "Soft, low morning sun", afternoon: "High afternoon sun, hard shadows", day: "Natural daylight" } as Record<string, string>)[tod] ?? "Natural light"
    : ({ night: "Interior night lit by practicals", dawn: "First light through the windows", evening: "Warm practicals as daylight goes", morning: "Morning light through the windows as the key", afternoon: "Daylight through the windows as the key", day: "Daylight through the windows as the key" } as Record<string, string>)[tod] ?? "Motivated interior light";
  const lighting_intent = clip(`${base}${sources.length ? ` — ${list(sources)}` : ext && tod === "night" ? " — streetlight and moonlight" : ""}. ${dark ? "Hard contrast; faces picked out of the dark by the nearest source." : warm ? "Warm and soft on faces." : "Naturalistic and even."}${peak && (peak.intensity ?? 0) >= 7 ? ` At the peak ("${quote(peak.text, 50)}"), let the light tighten on ${title(peak.speaker)}.` : ""}`, 1000);
  ev.lighting_intent = sources.length ? `light sources in the action (${list(sources)})` : `${ext ? "exterior" : "interior"} ${tod || "scene"}`;

  // ---- Sound ----
  const cues = SOUND.filter((s) => s.re.test(all)).map((s) => s.cue.toLowerCase());
  const bed = cues.length ? `A bed of ${list(cues.slice(0, 5))}` : ext ? `The ambience of ${place}${tod === "night" ? " at night" : ""}` : `Room tone for ${place}`;
  const talk = lines.length >= 6 ? "Dialogue carries the scene; keep effects under the voices." : lines.length ? "Dialogue sits clean over the ambience." : "No dialogue — sound tells this scene.";
  const music = dark ? "Music stays out or holds a low, uneasy bed." : warm ? "Music can lift gently under the end of the scene." : "Music only if it earns its place.";
  const sound_intent = clip(`${bed}. ${talk} ${music}${peak && (peak.intensity ?? 0) >= 8 ? ` Drop the ambience back at "${quote(peak.text, 40)}" so the line lands.` : ""}`, 1000);
  ev.sound_intent = cues.length ? "sounds named in the action" : "the location and the dialogue";

  // ---- Camera energy ----
  const actionHits = (all.match(ACTION_VERBS) ?? []).length;
  const withI = lines.filter((l) => l.intensity !== null);
  const avg = withI.length ? withI.reduce((s, l) => s + (l.intensity ?? 0), 0) / withI.length : 4;
  const camera_energy = actionHits >= 3 && avg >= 6 ? "frenetic" : actionHits >= 2 || avg >= 6.5 ? "dynamic" : avg < 4 && actionHits === 0 ? "calm" : "measured";
  ev.camera_energy = `${actionHits} action verb(s); average line intensity ${avg.toFixed(1)}`;

  // ---- Purpose and stakes ----
  const where = `${is_first ? "Opens the film" : is_last ? "Closes the film" : "Moves the story on"}${who ? ` with ${who}` : ""} at ${place}${tod ? ` (${tod})` : ""}.`;
  const turn = peak && (peak.intensity ?? 0) >= 5 ? ` It turns on ${title(peak.speaker)}: "${quote(peak.text)}"` : lines[0] ? ` It starts with ${title(lines[0].speaker)}: "${quote(lines[0].text)}"` : "";
  const purpose = clip(`${where} ${sents[0] ?? ""}${turn}`, 1000);
  ev.purpose = "the scene's place in the script, its opening action and its strongest line";
  const lead = peak ? title(peak.speaker) : cast[0] ?? "the characters";
  const second = speakers.find((s) => s !== lead) ?? cast.find((s) => s !== lead);
  const topEmotion = peak?.emotion ?? [...emo.keys()][0] ?? null;
  const stakeLine = ({
    anger: `whether ${lead}'s anger breaks something that can't be repaired`, fear: `${lead}'s safety — what happens if this goes wrong`,
    determination: `whether ${lead} holds to what they have decided`, sadness: `what ${lead} has already lost, and whether there is more to lose`,
    love: `the bond between ${lead}${second ? ` and ${second}` : ""}`, tension: `whether what is being kept hidden stays hidden`, joy: `whether this win will last`,
    contempt: `who holds power in this room`, trust: `whether ${lead} can trust ${second ?? "the others"}`, resignation: `whether ${lead} gives up`,
    anticipation: `what ${lead} is waiting to find out`, surprise: `what ${lead} has just learned and what it changes`, disgust: `what ${lead} refuses to be part of`,
  } as Record<string, string>)[topEmotion ?? ""] ?? `what this scene changes for ${lead}`;
  const stakes = clip(`At stake: ${stakeLine}.${project.logline ? ` In the story — ${project.logline}` : ""}`, 1000);
  ev.stakes = topEmotion ? `the strongest emotion in the dialogue (${topEmotion})${project.logline ? " and the logline" : ""}` : "the scene's characters";

  // ---- Continuity ----
  const notes: string[] = [];
  if (previous) {
    if (CONTINUOUS.test(rawTime)) notes.push(`Continues directly from Scene ${previous.number} — wardrobe, props, hair and light must match exactly.`);
    else if (previous.location && scene.location && previous.location.toLowerCase() === scene.location.toLowerCase()) notes.push(`Same location as Scene ${previous.number} — keep the set dressing matching.`);
    const pt = (previous.time_of_day ?? "").toUpperCase();
    if (pt && time && !CONTINUOUS.test(pt) && !CONTINUOUS.test(rawTime) && pt !== time) notes.push(`Time moves from ${pt.toLowerCase()} (Scene ${previous.number}) to ${time.toLowerCase()} — light and possibly wardrobe change.`);
    const shared = cast.filter((c) => previous.characters.map(title).includes(c));
    if (shared.length) notes.push(`${list(shared)} ${shared.length > 1 ? "are" : "is"} also in Scene ${previous.number} — match their look unless time has passed.`);
  } else if (is_first) notes.push("The first scene: it sets each character's first look.");
  if (next && CONTINUOUS.test(next.time_of_day ?? "")) notes.push(`Scene ${next.number} continues straight on — anything that changes here carries into it.`);
  const held = [...all.matchAll(HELD)].map((m) => {
    const ws = m[1].toLowerCase().split(" ").filter((w) => !/^(each|every|some|one|two|both)$/.test(w));
    const end = ws.findIndex((w) => /^(up|to|and|with|in|on|at|of|into|onto|from|for|as|while|then)$/.test(w));
    return (end === -1 ? ws : ws.slice(0, end)).join(" ");
  }).filter((x) => x.length > 2 && !STOP.has(x.split(" ")[0]));
  if (held.length) notes.push(`Props in hand: ${list([...new Set(held)].slice(0, 5))}.`);
  const marks = sents.filter((s) => MARKS.test(s)).slice(0, 3);
  if (marks.length) notes.push(`Marks to carry forward: ${marks.map((s) => `"${quote(s, 110)}"`).join(" ")}`);
  const continuity_notes = clip(notes.join(" ") || "Nothing in the script needs to match across the cut.", 4000);
  ev.continuity_notes = "the headings around the scene and what the action says is held or marked";

  return {
    fields: { purpose, stakes, story_time: clip(story_time, 200), mood, weather: clip(weather, 200), atmosphere, lighting_intent, sound_intent, camera_energy, continuity_notes },
    evidence: Object.fromEntries(Object.entries(ev).map(([k, v]) => [k, v.slice(0, 300)])),
    engine_version: ENGINE_VERSION,
  };
}
