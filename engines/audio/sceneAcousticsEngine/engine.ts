// engines/audio/sceneAcousticsEngine
// Sound realism, part 1 (BUILD_PLAN R4): how a scene should SOUND as a place, and the Foley its picture needs.
//   • SPACE — small room, medium room, large hall, cathedral or outdoors — read from the scene heading (INT/EXT, the place's
//     name: "bedroom", "danfo", "church", "market"), the Locations & Props description ("cramped", "vast, echoing") and
//     Scene DNA's atmosphere. Every choice cites the words it came from.
//   • DIALOGUE processed for that space: a clean-up strip plus a reverb send sized to the room (close and short in a car,
//     long in a hall, almost dry outdoors), and a background strip (interior room tone or an open exterior bed).
//   • FOLEY timed to the action of each shot: footsteps across a shot where someone walks, runs or enters; a door on the cut
//     where someone comes in (and as they leave, near the shot's end) — interiors, or wherever a door or gate is named.
// Deterministic and free. These are suggestions written into the same mixer a person edits.
import { z } from "zod";
import { TrackFxSchema, type SessionMix, type TrackFx } from "@aurastage/contracts";
import { CHANNEL_PRESETS, SPACE_PRESETS } from "../mixPresetEngine";
import { ENGINE_VERSION } from "./version";

export const SceneAcousticsInputSchema = z.object({
  scene: z.object({ int_ext: z.string(), location: z.string().max(400), time_of_day: z.string().nullable() }),
  /** The place's description in Locations & Props, when there is one. */
  location_description: z.string().max(4000).nullable().default(null),
  /** Scene DNA's atmosphere and weather. */
  atmosphere: z.string().max(2000).nullable().default(null),
  weather: z.string().max(2000).nullable().default(null),
  /** Shots of the approved shot plan: what happens in each and when. */
  shots: z.array(z.object({
    ordinal: z.number().int(), story_start: z.number().nonnegative(), story_end: z.number().nonnegative(),
    description: z.string().max(2000).default(""),
  })).max(500).default([]),
});
export type SceneAcousticsInput = z.input<typeof SceneAcousticsInputSchema>;
export type SpaceId = "small_room" | "medium_room" | "large_hall" | "cathedral" | "outdoor";
export interface FoleyCue { kind: "footsteps" | "door"; label: string; start_seconds: number; duration_seconds: number; shot_ordinal: number; evidence: string }
export interface SceneAcousticsOutput {
  space: { id: SpaceId; name: string; reverb: SessionMix["reverb"] };
  /** The words the space was read from. */
  why: string[];
  /** Label for the background bed ("small-room tone", "open exterior"). */
  bed: string;
  dx_fx: TrackFx;
  bg_fx: TrackFx;
  foley: FoleyCue[];
  engine_version: string;
}

// Size words ("a cramped office", "a vast hall") and kinds of place. A description often covers a whole building (owner's
// film: "a large federal government office block… a narrow backstage corridor"), so size is read only from its short
// "Look:" summary or a short description, and only overrides the heading's kind of room when it describes a room.
const SIZE_WORDS = "cramped|tiny|poky|narrow|small|tight|claustrophobic|confined|vast|huge|enormous|cavernous|echoing|echoey|high-ceilinged|soaring|immense";
const SIZE: [RegExp, SpaceId][] = [
  [/\b(cramped|tiny|poky|narrow|small|tight|claustrophobic|confined)\b/i, "small_room"],
  [/\b(vast|huge|enormous|cavernous|echo(?:es|ing|y)?|high[- ]ceiling(?:ed)?|soaring|immense)\b/i, "large_hall"],
];
const ROOM_NOUN = "room|hall|office|space|floor|flat|studio|set|study|kitchen|bedroom|corridor|church|chamber|warehouse|cell|shop|bar|apartment|house|interior";
const SIZED_ROOM = new RegExp(`\\b(${SIZE_WORDS})\\b(?:[\\s,]+(?:and\\s+)?[a-z-]+){0,2}?[\\s,]+(?:${ROOM_NOUN})s?\\b`, "i");
const PLACES: [RegExp, SpaceId][] = [
  [/\b(cathedral|basilica)\b/i, "cathedral"],
  // Rooms people pass through or gather in: a corridor or parlour is neither a cupboard nor a hall.
  [/\b(corridor|hallway|passage(?:way)?|landing|parlou?r|living room|sitting room|lounge|classroom|courtroom|press room|newsroom|waiting room|reception|ward|secretariat|restaurant|canteen)\b/i, "medium_room"],
  [/\b(hall|collation cent(?:re|er)|conference cent(?:re|er)|church|chapel|mosque|warehouse|stadium|arena|auditorium|gym(?:nasium)?|theat(?:re|er)|hangar|atrium|ballroom|factory|terminal|parliament|chamber|cave|tunnel|concourse)\b/i, "large_hall"],
  [/\b(bedroom|bathroom|toilet|restroom|study|anteroom|car|taxi|cab|danfo|bus|van|truck|lorry|keke|tricycle|minibus|matatu|booth|closet|cupboard|cell|lift|elevator|cockpit|cabin|hut|tent|shack|pantry|kitchen|stairwell|interrogation room|back seat)\b/i, "small_room"],
  [/\b(street|road|market|field|beach|roof(?:top)?|garden|compound|yard|forest|bush|park|square|junction|bridge|motor park|car park|parking lot|village|farm|riverbank|river|lagoon|desert|hill|highway|courtyard|balcony|veranda|porch|campus|playground|cemetery|graveyard)\b/i, "outdoor"],
];
const NAME: Record<SpaceId, string> = { small_room: "Small room", medium_room: "Medium room", large_hall: "Large hall", cathedral: "Cathedral", outdoor: "Outdoors (almost dry)" };
/** How much of the voice goes to the room's reverb (dB): close in a car, long in a hall, nearly none outdoors. */
const DX_SEND: Record<SpaceId, number> = { small_room: -16, medium_room: -12, large_hall: -7, cathedral: -5, outdoor: -30 };

/** The part of a Locations & Props description that is about how this place looks, not the whole building. */
function lookOf(description: string | null): string | null {
  if (!description) return null;
  const look = description.match(/\bLook:\s*([^.]*)/i);
  if (look) return look[1];
  return description.length <= 240 ? description : null;
}

function readSpace(i: z.infer<typeof SceneAcousticsInputSchema>): { id: SpaceId; why: string[] } {
  const ie = i.scene.int_ext.toUpperCase();
  const exterior = ie === "EXT" || ie === "EXT.";
  // The heading's own words, most specific part first ("ADAMU RESIDENCE - CORRIDOR" is a corridor).
  const parts = i.scene.location.split(/\s+[-–—]\s+/).reverse();
  const look = lookOf(i.location_description);
  const find = (table: [RegExp, SpaceId][], sources: [string, string | null][]) => {
    for (const [from, text] of sources) for (const [re, id] of table) { const m = text?.match(re); if (m) return { id, why: `“${m[0]}” (${from})` }; }
    return null;
  };
  if (exterior) {
    // An exterior is open air, unless it's somewhere enclosed you can stand "outside" in (a tunnel, a stadium).
    const big = find([[/\b(tunnel|stadium|arena|cave|underpass)\b/i, "large_hall"]], parts.map((p) => ["scene heading", p]));
    return big ? { id: big.id, why: [big.why, "EXT (scene heading)"] } : { id: "outdoor", why: ["EXT (scene heading)"] };
  }
  const kind = find(PLACES, [...parts.map((p): [string, string] => ["scene heading", p]), ["Locations & Props", look]]);
  const size = find(SIZE, [["Locations & Props", look], ["Scene DNA", i.atmosphere]]);
  const sizedRoom = look?.match(SIZED_ROOM) ?? null;
  const fromHeading = kind?.why.endsWith("(scene heading)");
  if (kind && kind.id !== "outdoor") {
    // "A cramped hall" makes a hall small; a size word about some other part of the place doesn't change the room.
    if (sizedRoom && size && size.id !== kind.id) return { id: size.id, why: [`“${sizedRoom[0]}” (Locations & Props)`, kind.why] };
    if (size && !fromHeading && size.id !== kind.id) return { id: size.id, why: [size.why, kind.why] };
    return { id: kind.id, why: [kind.why] };
  }
  if (size) return { id: size.id, why: [size.why] };
  if (kind && kind.id === "outdoor" && ie !== "INT") return { id: "outdoor", why: [kind.why] };
  return { id: "medium_room", why: [ie === "INT" ? "INT (scene heading), no size or kind of room named" : "no size or kind of place named"] };
}

const WALK = /\b(walk(?:s|ing|ed)?|stride(?:s)?|strode|pac(?:e|es|ed|ing)|march(?:es|ed)?|tiptoe(?:s|d)?|limp(?:s|ed)?|approach(?:es|ed)?|climb(?:s|ed)?|cross(?:es|ed)? (?:the|to|over)|step(?:s|ped)? (?:in|out|inside|outside|forward|back|away|into|onto|off)|enter(?:s|ed|ing)?|exit(?:s|ed|ing)?|leav(?:e|es|ing)|heads? (?:out|off|for|to|into))\b/i;
const RUN = /\b(run(?:s|ning)?|ran|sprint(?:s|ed)?|dash(?:es|ed)?|hurr(?:y|ies|ied)|rush(?:es|ed)?|race(?:s|d)? (?:to|out|in|off|down|up|across)|chase(?:s|d)?|flee(?:s)?|fled)\b/i;
const COME_IN = /\b(enter(?:s|ed|ing)?|comes? in|walks? in|steps? in(?:side)?|bursts? in|barges? in|let(?:s)? (?:her|him|them|himself|herself|themselves) in)\b/i;
const GO_OUT = /\b(exit(?:s|ed|ing)?|leav(?:e|es|ing) the (?:room|office|house|flat|apartment|car)|walks? out|storms? out|goes out|steps? out(?:side)?)\b/i;
// "Close on Tunde" is a shot size, not a door closing: only "closes"/"closed".
const DOOR_VERB = /\b(slam(?:s|med)?|shut(?:s)?|bang(?:s|ed)?|creak(?:s|ed)?|open(?:s|ed)?|closes|closed)\b/i;
const DOOR = /\b((?:car |front |back |office |cell )?door|gate)\b/i;
const r2 = (x: number) => Math.round(x * 100) / 100;
const quote = (s: string) => (s.length > 70 ? `${s.slice(0, 67)}…` : s);

export function sceneAcousticsEngine(raw: SceneAcousticsInput): SceneAcousticsOutput {
  const i = SceneAcousticsInputSchema.parse(raw);
  const { id, why } = readSpace(i);
  const preset = (pid: string) => CHANNEL_PRESETS.find((p) => p.id === pid)!.settings;
  const clean = preset("dialogue_clean");
  const outdoor = id === "outdoor";
  // Dialogue: the clean-up strip, a touch more low cut outdoors (wind and traffic rumble), and a send sized to the space.
  const dx_fx = TrackFxSchema.parse({ ...clean, hpf_hz: outdoor ? 100 : clean.hpf_hz, reverb_send_db: DX_SEND[id] });
  const night = /\bnight|evening|dusk|midnight\b/i.test(i.scene.time_of_day ?? "");
  const bg_fx = TrackFxSchema.parse(outdoor
    ? (night ? preset("outdoor_night") : { hpf_hz: 40, lpf_hz: 0, reverb_send_db: -60 })
    : { ...preset("interior_room_tone"), reverb_send_db: id === "small_room" ? -18 : id === "medium_room" ? -16 : -12 });
  const bed = outdoor ? `open exterior${night ? " at night" : ""}` : `${NAME[id].toLowerCase()} tone`;

  const foley: FoleyCue[] = [];
  const interior = !outdoor || i.scene.int_ext.toUpperCase().startsWith("INT");
  for (const s of [...i.shots].sort((a, b) => a.ordinal - b.ordinal)) {
    const d = s.description, len = Math.max(0, s.story_end - s.story_start);
    if (!d || len <= 0) continue;
    const run = d.match(RUN), walk = d.match(WALK);
    if (run || walk) {
      const m = (run ?? walk)!;
      const surface = outdoor ? (/\b(market|street|road|junction|highway|car park|motor park)\b/i.test(i.scene.location) ? "on the street" : "outdoors") : "on the floor";
      foley.push({ kind: "footsteps", label: `${run ? "Running footsteps" : "Footsteps"} ${surface}`, start_seconds: r2(s.story_start + Math.min(0.2, len / 4)),
        duration_seconds: r2(Math.max(0.5, Math.min(len - Math.min(0.2, len / 4), run ? 3 : 4))), shot_ordinal: s.ordinal,
        evidence: `Shot ${s.ordinal}: “${quote(d)}” (“${m[0]}”)` });
    }
    const named = d.match(DOOR);
    const comes = d.match(COME_IN), goes = d.match(GO_OUT);
    if ((comes || goes) && (named || interior)) {
      const what = named ? named[0].replace(/^./, (c) => c.toUpperCase()) : "Door";
      // Coming in: the door on the cut. Leaving: as they go, near the end of the shot.
      const at = comes ? s.story_start : Math.max(s.story_start, s.story_end - 1);
      foley.push({ kind: "door", label: `${what} ${comes ? "opens" : "closes"}`, start_seconds: r2(at), duration_seconds: r2(Math.max(0.5, Math.min(1.5, len))), shot_ordinal: s.ordinal,
        evidence: `Shot ${s.ordinal}: “${quote(d)}” (“${(comes ?? goes)![0]}”${named ? "" : "; an interior, so through a door"})` });
    } else if (named && DOOR_VERB.test(d)) {
      const verb = d.match(DOOR_VERB)![0].toLowerCase();
      foley.push({ kind: "door", label: `${named[0].replace(/^./, (c) => c.toUpperCase())} ${verb}`, start_seconds: r2(s.story_start + Math.min(0.3, len / 3)), duration_seconds: r2(Math.max(0.5, Math.min(1.5, len))),
        shot_ordinal: s.ordinal, evidence: `Shot ${s.ordinal}: “${quote(d)}”` });
    }
  }
  const sp = SPACE_PRESETS.find((x) => x.id === id)!;
  return { space: { id, name: NAME[id], reverb: sp.reverb }, why, bed, dx_fx, bg_fx, foley, engine_version: ENGINE_VERSION };
}
