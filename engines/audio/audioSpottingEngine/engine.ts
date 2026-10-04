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
import { sceneAcousticsEngine } from "../sceneAcousticsEngine";
import type { AudioSpottingOutput } from "./output.schema";

const r2 = (x: number) => Math.round(x * 100) / 100;

export function audioSpottingEngine(raw: unknown): AudioSpottingOutput {
  const { scene, scene_seconds: T, shots, lines, dna, script_lines, music, location_description } = validateAudioSpottingInput(raw);
  // How the scene sounds as a place, and the Foley its shots need (R4).
  const room = sceneAcousticsEngine({
    scene: { int_ext: scene.int_ext, location: scene.location, time_of_day: scene.time_of_day },
    location_description: location_description ?? null, atmosphere: dna.atmosphere, weather: dna.weather,
    shots: shots.map((s) => ({ ordinal: s.ordinal, story_start: Math.max(0, s.story_start), story_end: Math.max(0, s.story_end), description: s.description ?? "" })),
  });
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
  // Where each spoken line sits in the script and in time — the anchors sound cues are placed between.
  const anchors: { line: number; start: number; end: number; text: string }[] = [];
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
    if (l.script_line) anchors.push({ line: l.script_line, start: Math.min(start, Math.max(0, T - 0.5)), end: Math.min(T, start + dur), text: l.text });
    if (shot) cursor.set(shot.ordinal, start + dur + LINE_PAD_SECONDS);
    last = start + dur + LINE_PAD_SECONDS;
  }

  // Background / ambience bed across the whole scene.
  const place = `${scene.int_ext === "EXT" ? "Exterior" : scene.int_ext === "INT" ? "Interior" : ""} ${scene.location.toLowerCase()}`.trim();
  const bgBits = [dna.weather, dna.atmosphere, scene.time_of_day?.toLowerCase()].filter(Boolean).join(", ");
  addTrack("bg", "BG — Ambience", "BG");
  clips.push({
    track_key: "bg",
    label: `${place} ambience, ${room.bed}${bgBits ? ` — ${bgBits}` : ""}`,
    start_seconds: 0,
    duration_seconds: r2(T),
    source: { cue: "ambience", evidence: `Scene ${scene.number} heading${bgBits ? " + Scene DNA weather/atmosphere" : ""}; space: ${room.space.name} (${room.why.join("; ")})` },
  });

  // FX / Foley from Scene DNA's detected sound cues. When the script positions are known, each cue is placed where its
  // action line falls between the spoken lines around it (in proportion to the script lines between them); otherwise
  // cues are spread through the scene for a person to position.
  const placeByScript = anchors.length > 0 && dna.sound_candidates.length > 0;
  if (placeByScript) {
    anchors.sort((a, b) => a.line - b.line);
    const lo = Math.min(script_lines?.start ?? Infinity, ...dna.sound_candidates.map((c) => c.line), anchors[0].line) - 1;
    const hi = Math.max(script_lines?.end ?? -Infinity, ...dna.sound_candidates.map((c) => c.line), anchors[anchors.length - 1].line) + 1;
    anchors.unshift({ line: lo, start: 0, end: 0, text: "" });
    anchors.push({ line: hi, start: T, end: T, text: "" });
  }
  const used = new Map<string, number>(); // track -> end of the last cue placed on it (cues on one track don't pile up)
  dna.sound_candidates.forEach((c, i) => {
    const foley = FOLEY_WORDS.test(c.cue);
    const key = addTrack(foley ? "foley" : "fx", foley ? "Foley" : "FX", foley ? "FOLEY" : "FX");
    const n = dna.sound_candidates.length;
    const dur = Math.min(FX_CUE_SECONDS, T);
    let at: number, where = "";
    if (placeByScript) {
      const prev = [...anchors].reverse().find((a) => a.line <= c.line)!;
      const next = anchors.find((a) => a.line > c.line) ?? anchors[anchors.length - 1];
      const frac = next.line === prev.line ? 0 : (c.line - prev.line) / (next.line - prev.line);
      at = prev.end + Math.max(0, next.start - prev.end) * frac;
      where = prev.text ? ` — after “${prev.text.length > 30 ? prev.text.slice(0, 27) + "…" : prev.text}”` : next.text ? ` — before “${next.text.length > 30 ? next.text.slice(0, 27) + "…" : next.text}”` : "";
    } else at = (T * (i + 0.5)) / n - FX_CUE_SECONDS / 2;
    at = Math.max(at, used.get(key) ?? 0);
    const start = r2(Math.max(0, Math.min(T - 0.5, at)));
    used.set(key, start + dur * 0.5);
    clips.push({
      track_key: key,
      label: c.cue,
      start_seconds: start,
      duration_seconds: r2(dur),
      source: { cue: c.cue, evidence: `Script line ${c.line}: ${c.text}${placeByScript ? ` (placed by its script position${where})` : ""}` },
    });
  });

  // Foley timed to each shot's action (footsteps where someone walks, a door on the cut) — unless the script already
  // spotted the same sound within that shot.
  // Whole words: "outdoors" is not a door.
  const KIND = { footsteps: /\b(footsteps?|steps|walk\w*|run\w*)\b/i, door: /\b(doors?|gates?)\b/i } as const;
  for (const f of room.foley) {
    const shot = shots.find((s) => s.ordinal === f.shot_ordinal)!;
    const spotted = clips.some((c) => (c.track_key === "foley" || c.track_key === "fx") && KIND[f.kind].test(c.label)
      && c.start_seconds < shot.story_end + 1 && c.start_seconds + c.duration_seconds > shot.story_start - 1);
    if (spotted || f.start_seconds >= T) continue;
    const key = addTrack("foley", "Foley", "FOLEY");
    clips.push({
      track_key: key, label: f.label, start_seconds: r2(Math.min(f.start_seconds, Math.max(0, T - 0.5))),
      duration_seconds: r2(Math.max(0.5, Math.min(f.duration_seconds, T - Math.min(f.start_seconds, Math.max(0, T - 0.5))))),
      source: { cue: f.label, evidence: `${f.evidence} — timed to the shot` },
    });
  }

  // Score intent from mood / sound intent.
  const intent = [dna.mood.join(", "), dna.sound_intent].filter(Boolean).join(" — ");
  if (music) {
    if (music.needed) {
      addTrack("score", "Score", "SCORE");
      clips.push({ track_key: "score", label: `Score — ${music.description}`, start_seconds: 0, duration_seconds: r2(T), source: { cue: "score", evidence: `Music suggestion: ${music.why.join("; ") || "built-in library"}` } });
    }
  } else if (intent) {
    addTrack("score", "Score", "SCORE");
    clips.push({ track_key: "score", label: `Score — ${intent}`, start_seconds: 0, duration_seconds: r2(T), source: { cue: "score", evidence: "Scene DNA mood / sound intent" } });
  }

  const ORDER = ["DX", "VO", "ADR", "FOLEY", "FX", "WALLA", "BG", "MX", "SCORE"];
  tracks.sort((a, b) => ORDER.indexOf(a.family) - ORDER.indexOf(b.family));
  return { tracks, clips, scene_seconds: r2(T), acoustics: { space: room.space, why: room.why, dx_fx: room.dx_fx, bg_fx: room.bg_fx }, engine_version: ENGINE_VERSION };
}
