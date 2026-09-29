// engines/audio/mixPresetEngine — built-in presets for the Audio Studio mixer (owner, 2026-09-29: "built-in presets:
// dialogue clean-up, phone call, radio, large hall, outdoor night, genre mix templates"). A preset is only a starting
// point written into the same channel strip / routing a person can edit: applying one never touches the fader, pan,
// mute/solo or volume automation, and the result is saved like any other change (measure again before approving).
import { FAMILY_BUS, SessionMixSchema, TrackFxSchema, type AudioFamily, type SessionMix, type TrackFx } from "@aurastage/contracts";
import { ENGINE_VERSION } from "./version";

type Bus = "DX" | "FX" | "BG" | "MX";
type StripSettings = Pick<TrackFx, "hpf_hz" | "lpf_hz" | "eq" | "comp"> & { reverb_send_db?: number; delay_send_db?: number };

export interface ChannelPreset {
  id: string;
  name: string;
  /** Buses it's meant for (shown first there; any channel may use any preset). */
  for: Bus[];
  description: string;
  /** Suggested shared space for this sound; applied only with the routing, never silently. */
  space?: SpacePreset["id"];
  settings: StripSettings;
}
export interface SpacePreset { id: string; name: string; description: string; reverb: SessionMix["reverb"] }
export interface MixTemplate {
  id: string;
  name: string;
  description: string;
  buses: Record<Bus, number>;
  space: SpacePreset["id"];
  delay?: Partial<SessionMix["delay"]>;
}

const FLAT_EQ: TrackFx["eq"] = { low: { freq: 120, gain_db: 0 }, mid: { freq: 1500, gain_db: 0, q: 1 }, high: { freq: 8000, gain_db: 0 } };
const COMP_OFF: TrackFx["comp"] = { on: false, threshold_db: -18, ratio: 3, attack_ms: 10, release_ms: 150, makeup_db: 0 };
const eq = (low: [number, number], mid: [number, number, number], high: [number, number]): TrackFx["eq"] =>
  ({ low: { freq: low[0], gain_db: low[1] }, mid: { freq: mid[0], gain_db: mid[1], q: mid[2] }, high: { freq: high[0], gain_db: high[1] } });
const comp = (threshold_db: number, ratio: number, attack_ms: number, release_ms: number, makeup_db: number): TrackFx["comp"] =>
  ({ on: true, threshold_db, ratio, attack_ms, release_ms, makeup_db });

export const CHANNEL_PRESETS: ChannelPreset[] = [
  { id: "dialogue_clean", name: "Dialogue clean-up", for: ["DX"], description: "Removes rumble below 80 Hz, a little presence at 3 kHz and gentle levelling so every word sits clearly.",
    settings: { hpf_hz: 80, lpf_hz: 0, eq: eq([120, 0], [3000, 2, 1], [8000, 1]), comp: comp(-20, 3, 8, 120, 3) } },
  { id: "phone_call", name: "Phone call", for: ["DX"], description: "The other end of a phone line: only 300 Hz–3.4 kHz, a forward midrange and squashed dynamics.",
    settings: { hpf_hz: 300, lpf_hz: 3400, eq: eq([120, -6], [1500, 4, 1.2], [8000, 0]), comp: comp(-26, 4, 3, 100, 6) } },
  { id: "radio", name: "Radio / walkie-talkie", for: ["DX", "FX"], description: "A small speaker or two-way radio: narrow band, honky mids, heavily compressed.",
    settings: { hpf_hz: 500, lpf_hz: 2800, eq: eq([120, -8], [1800, 6, 2], [8000, 0]), comp: comp(-30, 6, 2, 80, 8) } },
  { id: "next_room", name: "Next room / through a wall", for: ["DX", "FX", "MX"], description: "Heard from another room: highs gone, a little boom and some of the room's reflections.",
    space: "small_room", settings: { hpf_hz: 60, lpf_hz: 1800, eq: eq([200, 3], [1500, 0, 1], [3000, -6]), comp: COMP_OFF, reverb_send_db: -10 } },
  { id: "muffled", name: "Muffled / underwater", for: ["DX", "FX", "BG", "MX"], description: "Everything above 700 Hz rolled away, with extra low body.",
    settings: { hpf_hz: 0, lpf_hz: 700, eq: eq([150, 4], [1500, 0, 1], [8000, 0]), comp: COMP_OFF } },
  { id: "large_hall", name: "Large hall voice", for: ["DX"], description: "A voice in a big reverberant space: clean voice plus a strong send to a hall reverb.",
    space: "large_hall", settings: { hpf_hz: 80, lpf_hz: 0, eq: eq([120, 0], [3000, 1, 1], [8000, 0]), comp: comp(-20, 3, 8, 120, 2), reverb_send_db: -6 } },
  { id: "outdoor_night", name: "Outdoor night ambience", for: ["BG"], description: "A dry, open night bed: no rumble, softened top, no room reverb.",
    settings: { hpf_hz: 40, lpf_hz: 12000, eq: eq([120, -2], [2500, -1, 0.8], [8000, -2]), comp: COMP_OFF, reverb_send_db: -60 } },
  { id: "interior_room_tone", name: "Interior room tone", for: ["BG"], description: "A quiet interior bed that stays under dialogue: low end tidied, a small room around it.",
    space: "small_room", settings: { hpf_hz: 50, lpf_hz: 9000, eq: eq([120, -3], [2500, -2, 0.8], [8000, -2]), comp: COMP_OFF, reverb_send_db: -18 } },
  { id: "punchy_fx", name: "Punchy effects", for: ["FX"], description: "Hits, doors and impacts with more weight and snap.",
    settings: { hpf_hz: 30, lpf_hz: 0, eq: eq([100, 3], [2500, 2, 1], [8000, 1]), comp: comp(-20, 4, 10, 150, 4) } },
  { id: "music_under_dialogue", name: "Music under dialogue", for: ["MX"], description: "Leaves room for voices: a gentle dip where speech lives (2.5 kHz) and no sub rumble.",
    settings: { hpf_hz: 40, lpf_hz: 0, eq: eq([120, 0], [2500, -3, 1], [8000, 0]), comp: COMP_OFF } },
  { id: "flat", name: "Flat (no processing)", for: ["DX", "FX", "BG", "MX"], description: "Removes the filters, EQ and compressor; keeps the fader, pan, sends and automation.",
    settings: { hpf_hz: 0, lpf_hz: 0, eq: FLAT_EQ, comp: COMP_OFF } },
];

export const SPACE_PRESETS: SpacePreset[] = [
  { id: "small_room", name: "Small room", description: "An office, bedroom or car: short and close.", reverb: { type: "room", decay_s: 0.6, pre_delay_ms: 5, return_db: -2 } },
  { id: "medium_room", name: "Medium room", description: "A living room or classroom.", reverb: { type: "room", decay_s: 1.2, pre_delay_ms: 15, return_db: 0 } },
  { id: "large_hall", name: "Large hall", description: "A theatre, church hall or warehouse.", reverb: { type: "hall", decay_s: 3.2, pre_delay_ms: 40, return_db: 0 } },
  { id: "cathedral", name: "Cathedral", description: "A huge stone space with a long tail.", reverb: { type: "hall", decay_s: 6, pre_delay_ms: 60, return_db: -1 } },
  { id: "outdoor", name: "Outdoors (almost dry)", description: "Open air: barely any reflections.", reverb: { type: "room", decay_s: 0.3, pre_delay_ms: 0, return_db: -12 } },
  { id: "plate", name: "Plate (music)", description: "A smooth studio plate for music and stylised moments.", reverb: { type: "plate", decay_s: 2, pre_delay_ms: 20, return_db: 0 } },
];

export const MIX_TEMPLATES: MixTemplate[] = [
  { id: "drama", name: "Drama — dialogue first", description: "Voices clearly on top; effects and ambience support; music low under scenes.", buses: { DX: 0, FX: -3, BG: -6, MX: -8 }, space: "medium_room" },
  { id: "thriller", name: "Thriller", description: "Tension in the effects and ambience; music close behind the dialogue.", buses: { DX: 0, FX: -1, BG: -4, MX: -5 }, space: "medium_room" },
  { id: "horror", name: "Horror", description: "Big, reverberant spaces and loud ambience; stings cut through.", buses: { DX: -1, FX: 0, BG: -2, MX: -3 }, space: "large_hall" },
  { id: "action", name: "Action", description: "Effects and music loud and forward; dialogue kept intelligible on top.", buses: { DX: 0, FX: 0, BG: -5, MX: -2 }, space: "medium_room", delay: { time_ms: 180, feedback: 0.2 } },
  { id: "comedy", name: "Comedy", description: "Bright, dry dialogue well above everything; music light.", buses: { DX: 1, FX: -2, BG: -8, MX: -9 }, space: "small_room" },
  { id: "documentary", name: "Documentary / interview", description: "Speech above all; ambience and music as a quiet bed.", buses: { DX: 1, FX: -6, BG: -9, MX: -11 }, space: "small_room" },
  { id: "music_video", name: "Music-led", description: "Music on top; dialogue and effects placed inside it.", buses: { DX: -2, FX: -4, BG: -8, MX: 0 }, space: "plate" },
];

/** Presets for a track, the ones meant for its bus first. */
export function channelPresetsFor(family: AudioFamily): ChannelPreset[] {
  const bus = FAMILY_BUS[family];
  return [...CHANNEL_PRESETS].sort((a, b) => Number(!a.for.includes(bus)) - Number(!b.for.includes(bus)));
}

/** Writes a channel preset into a strip; the fader, pan and volume automation are the person's and stay. */
export function applyChannelPreset(fx: TrackFx, presetId: string): { fx: TrackFx; preset: ChannelPreset; space: SpacePreset | null; engine_version: string } {
  const preset = CHANNEL_PRESETS.find((p) => p.id === presetId);
  if (!preset) throw new Error(`Unknown channel preset ${presetId}`);
  const s = preset.settings;
  const next = TrackFxSchema.parse({
    ...fx,
    hpf_hz: s.hpf_hz, lpf_hz: s.lpf_hz, eq: s.eq, comp: s.comp,
    reverb_send_db: s.reverb_send_db ?? fx.reverb_send_db,
    delay_send_db: s.delay_send_db ?? fx.delay_send_db,
    automation: fx.automation,
  });
  return { fx: next, preset, space: preset.space ? SPACE_PRESETS.find((x) => x.id === preset.space) ?? null : null, engine_version: ENGINE_VERSION };
}

/** Writes a space into the shared reverb; everything else in the routing stays. */
export function applySpacePreset(mix: SessionMix, spaceId: string): SessionMix {
  const space = SPACE_PRESETS.find((x) => x.id === spaceId);
  if (!space) throw new Error(`Unknown space ${spaceId}`);
  return SessionMixSchema.parse({ ...mix, reverb: space.reverb });
}

/** Writes a genre template into the buses and shared effects; bus mutes and the master (gain, limiter, ceiling) stay. */
export function applyMixTemplate(mix: SessionMix, templateId: string): { mix: SessionMix; template: MixTemplate; engine_version: string } {
  const template = MIX_TEMPLATES.find((x) => x.id === templateId);
  if (!template) throw new Error(`Unknown mix template ${templateId}`);
  const buses = Object.fromEntries((["DX", "FX", "BG", "MX"] as const).map((b) => [b, { gain_db: template.buses[b], mute: mix.buses[b].mute }]));
  const space = SPACE_PRESETS.find((x) => x.id === template.space)!;
  const next = SessionMixSchema.parse({ ...mix, buses, reverb: space.reverb, delay: { ...mix.delay, ...(template.delay ?? {}) } });
  return { mix: next, template, engine_version: ENGINE_VERSION };
}
