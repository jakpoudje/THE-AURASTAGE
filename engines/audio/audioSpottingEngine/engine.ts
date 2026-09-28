// engines/audio/audioSpottingEngine
// SRS §11: "Scene DNA can propose Foley, ambience … and score intent … Suggestions
// remain editable. Dialogue Intelligence owns the words; Audio Studio owns sonic
// realisation." This engine spots a first session: one DX track per speaker
// with a cue at each line's time in the approved shot plan, a BG ambience bed,
// FX/Foley cues from Scene DNA's detected sound cues, and a score cue from the
// scene's mood. Every cue cites where it came from. Cues are PLANNED audio —
// no sound exists until a person adds a recording.

import { FOLEY_WORDS, FX_CUE_SECONDS, LINE_PAD_SECONDS } from "./rules";
import { validateAudioSpottingInput } from "./validator";
import { ENGINE_VERSION } from "./version";
import type { AudioSpottingOutput } from "./output.schema";

const r2 = (x: number) => Math.round(x * 100) / 100;

export function audioSpottingEngine(raw: unknown): AudioSpottingOutput {
  const { scene, scene_seconds: T, shots, lines, dna } = validateAudioSpottingInput(raw);
  const tracks: AudioSpottingOutput["tracks"] = [];
  const clips: AudioSpottingOutput["clips"] = [];
  const addTrack = (key: string, name: string, family: AudioSpottingOutput["tracks"][number]["family"]) => {
    if (!tracks.some((t) => t.key === key)) tracks.push({ key, name, family });
    return key;
  };

  // Dialogue: place each line where the approved shot plan puts it.
  const shotOf = new Map<string, (typeof shots)[number]>();
  for (const s of [...shots].sort((a, b) => a.ordinal - b.ordinal)) for (const id of s.dialogue_line_ids) if (!shotOf.has(id)) shotOf.set(id, s);
  const cursor = new Map<number, number>(); // shot ordinal -> next free time inside it
  let last = 0;
  for (const l of lines) {
    const who = l.character_name ?? l.speaker;
    const key = addTrack(`dx:${l.character_id ?? l.speaker}`, `${l.voice_over ? "VO" : "DX"} — ${who}`, l.voice_over ? "VO" : "DX");
    const shot = shotOf.get(l.id);
    let start: number;
    if (shot) {
      start = Math.max(cursor.get(shot.ordinal) ?? shot.story_start, shot.story_start);
    } else start = last;
    const dur = Math.max(0.5, l.estimated_seconds);
    clips.push({
      track_key: key,
      label: `${l.speaker}: “${l.text.length > 50 ? l.text.slice(0, 47) + "…" : l.text}”`,
      start_seconds: r2(Math.min(start, Math.max(0, T - 0.5))),
      duration_seconds: r2(dur),
      source: { dialogue_line_id: l.id, evidence: shot ? `Shot ${shot.ordinal} of the approved shot plan` : "Script order (no shot covers this line)" },
    });
    if (shot) cursor.set(shot.ordinal, start + dur + LINE_PAD_SECONDS);
    last = start + dur + LINE_PAD_SECONDS;
  }

  // Background / ambience bed across the whole scene.
  const place = `${scene.int_ext === "EXT" ? "Exterior" : scene.int_ext === "INT" ? "Interior" : ""} ${scene.location.toLowerCase()}`.trim();
  const bgBits = [dna.weather, dna.atmosphere, scene.time_of_day?.toLowerCase()].filter(Boolean).join(", ");
  addTrack("bg", "BG — Ambience", "BG");
  clips.push({
    track_key: "bg",
    label: `${place} ambience${bgBits ? ` — ${bgBits}` : ""}`,
    start_seconds: 0,
    duration_seconds: r2(T),
    source: { cue: "ambience", evidence: `Scene ${scene.number} heading${bgBits ? " + Scene DNA weather/atmosphere" : ""}` },
  });

  // FX / Foley from Scene DNA's detected sound cues, spread through the scene for a person to position.
  dna.sound_candidates.forEach((c, i) => {
    const foley = FOLEY_WORDS.test(c.cue);
    const key = addTrack(foley ? "foley" : "fx", foley ? "Foley" : "FX", foley ? "FOLEY" : "FX");
    const n = dna.sound_candidates.length;
    const centre = (T * (i + 0.5)) / n;
    clips.push({
      track_key: key,
      label: c.cue,
      start_seconds: r2(Math.max(0, Math.min(T - 0.5, centre - FX_CUE_SECONDS / 2))),
      duration_seconds: r2(Math.min(FX_CUE_SECONDS, T)),
      source: { cue: c.cue, evidence: `Script line ${c.line}: ${c.text}` },
    });
  });

  // Score intent from mood / sound intent.
  const intent = [dna.mood.join(", "), dna.sound_intent].filter(Boolean).join(" — ");
  if (intent) {
    addTrack("score", "Score", "SCORE");
    clips.push({ track_key: "score", label: `Score — ${intent}`, start_seconds: 0, duration_seconds: r2(T), source: { cue: "score", evidence: "Scene DNA mood / sound intent" } });
  }

  const ORDER = ["DX", "VO", "ADR", "FOLEY", "FX", "WALLA", "BG", "MX", "SCORE"];
  tracks.sort((a, b) => ORDER.indexOf(a.family) - ORDER.indexOf(b.family));
  return { tracks, clips, scene_seconds: r2(T), engine_version: ENGINE_VERSION };
}
