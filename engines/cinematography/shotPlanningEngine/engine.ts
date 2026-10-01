// engines/cinematography/shotPlanningEngine
// SRS §9: translates a LOCKED Scene DNA version into a first coverage plan.
// It never rewrites the scene: every shot references canonical character and
// dialogue-line ids and carries a rationale a person can read, edit or delete.
//   1. Establishing shot (EXT -> EWS, otherwise WS) to orient the audience.
//   2. Master (two or more on-screen characters) spanning the whole scene.
//   3. One single per run of consecutive lines by the same speaker, sized by
//      intensity; voice-only speakers are covered on their on-screen listener.
//   4. Reactions after high-intensity lines when a listener is on screen.
//   5. An action shot for story time left after the last line.
// A coverage style (1.1.0) adjusts framing, movement and reactions; the structure
// above — and so full coverage of story time and every line — never changes.
// Story-time intervals are laid out so coverage (coverageMathEngine) can be measured.

import { CLOSER, ENERGY, ESTABLISHING_SECONDS, LENS_BY_SIZE, LINE_PAD_SECONDS, REACTION_SECONDS, sizeForIntensity, STYLE } from "./rules";
import { validateShotPlanningInput } from "./validator";
import { applyCameraGrammar } from "./cameraGrammar";
import { ENGINE_VERSION } from "./version";
import type { ProposedShot, ShotPlanningOutput } from "./output.schema";

const r2 = (x: number) => Math.round(x * 100) / 100;

/**
 * A shot's text fields hold at most 500 characters (ShotEditableSchema, the shots table). Scene DNA text can be longer
 * (a detailed lighting intent), so it is shortened at a sentence — or word — boundary instead of being refused (1.1.1).
 */
export function fitText(text: string, max = 500): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sentence = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (sentence > max * 0.5) return cut.slice(0, sentence + 1);
  const word = cut.lastIndexOf(" ");
  return `${cut.slice(0, word > max * 0.5 ? word : max - 1).replace(/[\s,;:—-]+$/, "")}…`;
}

/** Story time Tₛ the plan lays out: the locked duration, stretched if the dialogue needs longer. */
export function planStoryTime(durationSeconds: number, lineSeconds: number[]): number {
  const dialogue = lineSeconds.reduce((s, x) => s + x + LINE_PAD_SECONDS, 0);
  return Math.max(durationSeconds, r2(ESTABLISHING_SECONDS + dialogue));
}

/**
 * Where things sit in the frame (1.2.0, owner 2026-09-30: "camera physics… the engines make these decisions"): the
 * classic composition for each kind of shot — thirds, look room, headroom, foreground — shaped by the scene's mood.
 */
export function compositionFor(s: Pick<ProposedShot, "purpose" | "size" | "movement">, exterior: boolean, mood: string[]): string {
  const tense = mood.some((m) => /tense|uneasy|menac|threat|dark|claustro|fear|volatile|hostile/i.test(m));
  const warm = mood.some((m) => /warm|intimate|tender|hopeful|joy|romantic/i.test(m));
  const edge = tense ? " Keep the frame a little tight and off-balance; let the dark edges press in." : warm ? " Soft, balanced framing with room around them." : "";
  const byPurpose: Record<string, string> = {
    establishing: `${exterior ? "Horizon on the lower third; the place and its scale read first" : "The whole room reads first, doorway or window as a frame within the frame"}; characters small in the frame.`,
    master: "Every on-screen character in frame and blocking readable; the axis of action set here for every shot that follows.",
    dialogue: s.size === "OTS" ? "Listener's shoulder soft in the foreground at the frame edge; the speaker on the far third, eyes on the upper third, look room toward the listener."
      : "Speaker on a third, eyes on the upper third, look room in the direction they face; clean background.",
    reaction: "The listener on the opposite third to the speaker's single, eyeline matched; tight enough to read the eyes.",
    action: "Wide enough for the movement to read, leading room in the direction of travel.",
    insert: "The object fills the frame, clean background; hands in frame if someone is using it.",
    transition: "Composed to cut: a shape, colour or movement that carries into the next shot.",
  };
  const move = s.movement === "push_in" ? " The push-in ends on the eyes." : s.movement === "handheld" ? " Handheld: keep the subject near centre as the frame breathes." : "";
  return fitText(`${byPurpose[s.purpose] ?? "Subject on a third with room to look into."}${edge}${move}`);
}

export function shotPlanningEngine(raw: unknown): ShotPlanningOutput {
  const { scene, dna, participants, lines, style, genre } = validateShotPlanningInput(raw);
  const st = STYLE[style];
  // "energetic" never calms a frenetic scene; "simple" always keeps the camera still.
  const energyKey = st.energy === "dynamic" && dna.camera_energy === "frenetic" ? "frenetic" : (st.energy ?? dna.camera_energy ?? "measured");
  const energy = ENERGY[energyKey];
  const moving = energyKey !== "calm";
  const styled = (why: string) => (style === "standard" ? why : `${st.label}: ${why.charAt(0).toLowerCase()}${why.slice(1)}`);
  const onScreen = participants.filter((p) => p.presence === "on_screen");
  const name = new Map(participants.map((p) => [p.character_id, p.name]));
  const onScreenIds = new Set(onScreen.map((p) => p.character_id));
  const lighting = dna.lighting_intent ? fitText(dna.lighting_intent) : dna.lighting_intent;
  const shots: ProposedShot[] = [];
  const base = {
    angle: "eye" as const,
    focus: "deep" as const,
    composition: null,
    lighting,
    transition_in: "cut" as const,
    notes: null,
  };

  const T = planStoryTime(scene.duration_seconds, lines.map((l) => l.estimated_seconds));
  const est = Math.min(ESTABLISHING_SECONDS, T / 4);
  const exterior = scene.int_ext === "EXT";

  shots.push({
    ...base,
    purpose: "establishing",
    size: exterior ? "EWS" : "WS",
    movement: energy.wide[0],
    support: energy.wide[1],
    lens_mm: LENS_BY_SIZE[exterior ? "EWS" : "WS"] ?? null,
    duration_seconds: r2(est),
    description: `${exterior ? "Wide exterior" : "Wide"} of ${scene.location}${scene.time_of_day ? ` — ${scene.time_of_day.toLowerCase()}` : ""}${onScreen.length ? `, ${onScreen.map((p) => p.name).join(" and ")} in frame` : ""}.`,
    character_ids: onScreen.map((p) => p.character_id),
    dialogue_line_ids: [],
    story_start: 0,
    story_end: r2(est),
    rationale: styled("Orients the audience in the location before the scene plays."),
  });

  if (onScreen.length >= 2) {
    shots.push({
      ...base,
      purpose: "master",
      size: onScreen.length === 2 ? "TWO_SHOT" : onScreen.length === 3 ? "THREE_SHOT" : "GROUP",
      movement: energy.wide[0],
      support: energy.wide[1],
      lens_mm: 32,
      duration_seconds: r2(T - est),
      description: `Master: ${onScreen.map((p) => p.name).join(", ")} — whole scene for blocking and safety coverage.`,
      character_ids: onScreen.map((p) => p.character_id),
      dialogue_line_ids: [],
      story_start: r2(est),
      story_end: r2(T),
      rationale: styled("Keeps geography clear and gives the editor a fallback for every moment."),
    });
  }

  // Runs of consecutive lines by the same speaker.
  const runs: (typeof lines)[] = [];
  for (const l of lines) {
    const last = runs[runs.length - 1];
    if (last && last[0].speaker === l.speaker) last.push(l);
    else runs.push([l]);
  }
  let t = est;
  for (const run of runs) {
    const first = run[0];
    const peak = run.reduce<number | null>((m, l) => (l.intensity !== null && (m === null || l.intensity > m) ? l.intensity : m), null);
    const dur = r2(run.reduce((s, l) => s + l.estimated_seconds + LINE_PAD_SECONDS, 0));
    const speakerOnScreen = !!first.character_id && onScreenIds.has(first.character_id);
    const listeners = first.listener_ids.filter((id) => onScreenIds.has(id));
    const quote = `“${first.text.length > 60 ? first.text.slice(0, 57) + "…" : first.text}”`;
    if (speakerOnScreen) {
      const natural = style === "simple" ? "MS" : onScreen.length === 2 && peak !== null && peak < 5 && listeners.length ? "OTS" : sizeForIntensity(peak);
      const size = st.closer ? (CLOSER[natural] ?? natural) : natural;
      const push = peak !== null && peak >= st.pushAt && moving;
      shots.push({
        ...base,
        purpose: "dialogue",
        size,
        focus: size === "CU" || size === "MCU" || st.closer ? "shallow" : "deep",
        movement: push ? "push_in" : energy.close[0],
        support: push ? "dolly" : energy.close[1],
        lens_mm: LENS_BY_SIZE[size] ?? null,
        duration_seconds: dur,
        description: `${size === "OTS" && listeners[0] ? `Over ${name.get(listeners[0])}'s shoulder on ` : ""}${name.get(first.character_id!) ?? first.speaker}: ${quote}${run.length > 1 ? ` (+${run.length - 1} more)` : ""}`,
        character_ids: [first.character_id!, ...(size === "OTS" && listeners[0] ? [listeners[0]] : [])],
        dialogue_line_ids: run.map((l) => l.id),
        story_start: r2(t),
        story_end: r2(t + dur),
        rationale: styled(peak !== null ? `Intensity ${peak}/10 sets the framing.` : "Default single; no intensity annotated yet in Dialogue."),
      });
    } else {
      // Voice-only / off-screen speaker: hold on who hears it.
      const target = listeners[0] ?? onScreen[0]?.character_id ?? null;
      shots.push({
        ...base,
        purpose: "dialogue",
        size: target ? "MS" : "WS",
        movement: energy.close[0],
        support: energy.close[1],
        lens_mm: target ? (LENS_BY_SIZE.MS ?? null) : (LENS_BY_SIZE.WS ?? null),
        duration_seconds: dur,
        description: `${target ? `${name.get(target)} listens` : `Hold on ${scene.location}`} — ${first.speaker} heard off screen: ${quote}`,
        character_ids: target ? [target] : [],
        dialogue_line_ids: run.map((l) => l.id),
        story_start: r2(t),
        story_end: r2(t + dur),
        rationale: styled("The speaker isn't on screen, so the line plays over the listener."),
      });
    }
    t += dur;
    if (st.reactionAt !== null && peak !== null && peak >= st.reactionAt && listeners.length) {
      const who = listeners[0];
      shots.push({
        ...base,
        purpose: "reaction",
        size: "CU",
        focus: "shallow",
        movement: "static",
        support: "tripod",
        lens_mm: LENS_BY_SIZE.CU ?? null,
        duration_seconds: REACTION_SECONDS,
        description: `${name.get(who)} reacts.`,
        character_ids: [who],
        dialogue_line_ids: [],
        story_start: r2(Math.max(est, t - REACTION_SECONDS)),
        story_end: r2(t),
        rationale: styled(`A line at intensity ${peak}/10 deserves the listener's response.`),
      });
    }
  }

  if (T - t > 1) {
    shots.push({
      ...base,
      purpose: "action",
      size: onScreen.length ? "MWS" : "WS",
      movement: energy.wide[0],
      support: energy.wide[1],
      lens_mm: onScreen.length ? (LENS_BY_SIZE.MWS ?? null) : (LENS_BY_SIZE.WS ?? null),
      duration_seconds: r2(T - t),
      description: lines.length ? "The scene plays out after the last line." : `${onScreen.map((p) => p.name).join(" and ") || "The location"} — the action of the scene.`,
      character_ids: onScreen.map((p) => p.character_id),
      dialogue_line_ids: [],
      story_start: r2(t),
      story_end: r2(T),
      rationale: styled("Covers story time with no dialogue so nothing is left unplanned."),
    });
  }

  // Camera intelligence (1.3.0): genre and scene grammar choose how each shot is filmed; coverage is unchanged.
  const intensity = new Map(lines.map((l) => [l.id, l.intensity]));
  const peaks = new Map<ProposedShot, number | null>();
  let lastPeak: number | null = null;
  for (const x of shots) {
    const p = x.dialogue_line_ids.reduce<number | null>((m, id) => { const v = intensity.get(id) ?? null; return v !== null && (m === null || v > m) ? v : m; }, null);
    if (x.purpose === "dialogue") lastPeak = p;
    peaks.set(x, x.purpose === "reaction" ? lastPeak : p);
  }
  const graded = applyCameraGrammar(shots, {
    genre: genre ?? null, mood: dna.mood ?? [], exterior, peaks,
    keepMovement: style !== "standard" || dna.camera_energy === "calm" || dna.camera_energy === "frenetic",
    text: [dna.purpose ?? "", dna.atmosphere ?? "", scene.heading, ...lines.map((l) => l.text)],
  });
  const fitted = graded.shots.map((x) => ({ ...x, rationale: fitText(x.rationale), composition: x.composition ?? compositionFor(x, exterior, dna.mood ?? []), description: fitText(x.description), character_ids: x.character_ids.slice(0, 20), dialogue_line_ids: x.dialogue_line_ids.slice(0, 50) }));
  return { shots: fitted, scene_seconds: T, engine_version: ENGINE_VERSION, camera: graded.camera };
}
