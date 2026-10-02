// engines/generation/promptCompilerEngine
// SRS §10: compiles a structured, provider-neutral GenerationPackage from the
// APPROVED shot (shot plan version), the LOCKED Scene DNA version, Casting
// characters/wardrobe and project settings. Every block cites its source and
// provenance records the exact version ids (rule 10). The prompt text is
// assembled from the blocks — providers translate the package, not the prose.

import type { GenerationPackageContent } from "@aurastage/contracts";
import { ANGLE_WORDS, BASE_NEGATIVE, FOCUS_WORDS, MOVEMENT_WORDS, SIZE_WORDS } from "./rules";
import { validatePromptCompilerInput } from "./validator";
import { composePrompt, shorten, type PromptBlock } from "./compose";
import { ENGINE_VERSION } from "./version";
import type { PromptCompilerOutput } from "./output.schema";

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const sentence = (s: string) => (s && !/[.!?]$/.test(s) ? `${s}.` : s);

export function promptCompilerEngine(raw: unknown): PromptCompilerOutput {
  const { project, scene, shot, characters, dialogue, aspect_ratio, provenance, location, props, references, script_action, continuity } = validatePromptCompilerInput(raw);
  const inFrame = shot.character_ids.map((id) => characters.find((c) => c.id === id)).filter((c): c is (typeof characters)[number] => !!c);
  const lighting = clean(shot.lighting) || clean(scene.lighting_intent) || null;
  const sizeLabel = SIZE_WORDS[shot.size] ?? shot.size;
  const secs = Math.round(shot.duration_seconds * 10) / 10;

  const camera = [
    sizeLabel,
    ANGLE_WORDS[shot.angle] ?? shot.angle,
    MOVEMENT_WORDS[shot.movement] ?? shot.movement,
    shot.lens_mm ? `${shot.lens_mm}mm lens` : null,
    FOCUS_WORDS[shot.focus] ?? shot.focus,
  ].filter(Boolean).join(", ");

  const people = inFrame.map((c) => {
    const when = c.age_state ? `${clean(c.age_state.label)}${clean(c.age_state.description) ? `: ${clean(c.age_state.description)}` : ""}` : "";
    const who = [clean(c.gender).toLowerCase(), c.age && !when ? c.age : null].filter(Boolean).join(", ");
    const age = c.age && when ? `(${clean(c.gender) ? `${clean(c.gender).toLowerCase()}, ` : ""}aged ${c.age}, ${when})` : who ? `(${who})` : when ? `(${when})` : null;
    // Nationality only as written in Casting (never inferred from a name) — it guides appearance and wardrobe realism.
    const bits = [c.name, age, clean(c.nationality) ? `[${clean(c.nationality)}]` : null, clean(c.description) ? `— ${clean(c.description)}` : null, clean(c.wardrobe) ? `wearing ${clean(c.wardrobe)}` : null];
    return bits.filter(Boolean).join(" ");
  });
  // The canonical location (described once in Locations & Props) is named and described in every shot of the scene.
  const placeName = location ? location.name : scene.location;
  const place = `${scene.int_ext === "EXT" ? "Exterior" : scene.int_ext === "INT" ? "Interior" : "Location"}: ${placeName}${clean(scene.area) ? ` (${clean(scene.area)})` : ""}${scene.time_of_day ? `, ${scene.time_of_day.toLowerCase()}` : ""}${location && clean(location.description) ? ` — ${clean(location.description)}` : ""}`;
  const propLine = props.map((p) => {
    const d = [clean(p.description), ...(p.descriptors ?? []).map(clean).filter((x) => x && !clean(p.description).toLowerCase().includes(x.toLowerCase()))].filter(Boolean).join(", ");
    return `${d ? `${p.name} (${d})` : p.name}${p.state ? ` — ${p.state}` : ""}`;
  }).join("; ");
  const inFrameIds = new Set(inFrame.map((c) => c.id));
  // Only references that belong to this shot: characters in frame, this scene's location and props.
  const refs = references.filter((r) => (r.kind === "character" ? inFrameIds.has(r.object_id) : r.kind === "location" ? r.object_id === location?.id : props.some((p) => p.id === r.object_id)));
  const style = [project.genre, project.subgenre, project.tone].map(clean).filter(Boolean).join(", ");
  const world = [project.setting, project.time_period].map(clean).filter(Boolean).join(", ");

  const lines = dialogue.filter((d) => shot.dialogue_line_ids.includes(d.id));
  // Stills never quote the words (image models paint text into the frame); they show the face mid-line.
  const performanceImage = lines.length
    ? `Performance: ${lines.map((l) => `${l.speaker}${l.emotion ? ` (${l.emotion}${l.intensity !== null ? `, ${l.intensity}/10` : ""})` : ""} mid-line, speaking`).join("; ")}`
    : "";
  // Video: who says what, how, and lips in sync — in the character's own accent (lip shapes differ by accent).
  const accentOf = (cid: string | null) => { const c = cid ? characters.find((x) => x.id === cid) : undefined; return c ? clean(c.accent) || null : null; };
  const performanceVideo = lines.length
    ? `Dialogue (lip sync): ${lines.map((l) => {
        const how = [l.emotion, l.intensity !== null ? `intensity ${l.intensity}/10` : null, clean(l.intention) || null].filter(Boolean).join(", ");
        const acc = accentOf(l.character_id);
        return `${l.speaker}${clean(l.parenthetical) ? ` ${clean(l.parenthetical)}` : ""} says "${l.text}"${how ? ` (${how})` : ""}${clean(l.subtext) ? `, meaning underneath: ${clean(l.subtext)}` : ""}${acc ? `, ${acc} accent` : ""}${l.estimated_seconds ? `, about ${Math.round(l.estimated_seconds * 10) / 10} s` : ""}`;
      }).join("; ")}; lips, jaw and face move naturally in sync with every word`
    : scene.silent ? "No one speaks in this shot." : "";
  const moves = inFrame.filter((c) => clean(c.physicality) || clean(c.personality));
  const physImage = inFrame.filter((c) => clean(c.physicality)).map((c) => `${c.name}: ${clean(c.physicality)}`).join("; ");
  const physVideo = moves.map((c) => `${c.name}: ${[clean(c.physicality), clean(c.personality) ? `manner ${shorten(clean(c.personality), 140)}` : ""].filter(Boolean).join("; ")}`).join(" | ");
  const sideWord = { left: "frame left", right: "frame right", center: "centre frame" } as const;
  const placed = inFrame.filter((c) => continuity.screen[c.id]);
  const screen = placed.length
    ? `Screen direction: ${placed.map((c) => `${c.name} ${sideWord[continuity.screen[c.id]]}`).join(", ")}${placed.length === 1 && inFrame.length === 1 && lines.length ? ` (eyeline toward ${continuity.screen[placed[0].id] === "left" ? "frame right" : "frame left"})` : ""}`
    : "";
  const transition = shot.transition_in && shot.transition_in !== "cut" ? ` Opens with a ${shot.transition_in.replace(/_/g, " ")}.` : "";
  const supportWord = shot.support && !["tripod"].includes(shot.support) ? `, on a ${shot.support}` : "";
  const action = clean(shot.description);
  const scriptLines = script_action.map(clean).filter(Boolean).join(" ");
  const continuityLine = [clean(scene.continuity_notes) ? `Continuity: ${clean(scene.continuity_notes)}` : "", clean(scene.story_time) ? `Story time: ${clean(scene.story_time)}` : ""].filter(Boolean).join(". ");
  const flow = [continuity.previous ? `After: ${clean(continuity.previous)}` : "", continuity.next ? `Before: ${clean(continuity.next)}` : ""].filter(Boolean).join(". ");
  const why = [clean(scene.purpose) ? `Scene purpose: ${clean(scene.purpose)}` : "", clean(scene.stakes) ? `Stakes: ${clean(scene.stakes)}` : ""].filter(Boolean).join(". ");

  const B = (id: string, rank: PromptBlock["rank"], image: string, video = image): PromptBlock => ({ id, rank, image: sentence(clean(image)), video: sentence(clean(video)) });
  const blocks: PromptBlock[] = [
    B("header", 1, `Cinematic film still, ${camera}`, `${secs}-second cinematic video shot, ${camera}${supportWord}${transition ? `.${transition.replace(/\.$/, "")}` : ""}`),
    B("action", 1, action, action ? `Action over ${secs} s: ${action}` : ""),
    B("people", 1, people.length ? `In frame: ${people.join("; ")}` : ""),
    B("performance", 1, performanceImage, performanceVideo),
    B("place", 2, place),
    B("screen", 2, screen),
    B("lighting", 2, lighting ? `Lighting: ${lighting}` : ""),
    // Physicality matters more in motion than in a still: rank 2 for video, rank 3 for stills.
    B("movement", 2, "", physVideo ? `How they move: ${physVideo}` : ""),
    B("physicality", 3, physImage ? `Physicality: ${physImage}` : "", ""),
    B("script", 3, scriptLines ? `From the script: ${scriptLines}` : ""),
    B("props", 3, propLine ? `Props in the scene: ${propLine}` : ""),
    B("weather", 3, clean(scene.weather) ? `Weather: ${clean(scene.weather)}` : ""),
    B("atmosphere", 3, clean(scene.atmosphere) ? `Atmosphere: ${clean(scene.atmosphere)}` : ""),
    B("mood", 3, scene.mood.length ? `Mood: ${scene.mood.join(", ")}` : ""),
    B("composition", 4, clean(shot.composition) ? `Composition: ${clean(shot.composition)}` : ""),
    B("style", 4, style || world ? `Style: ${[style, world].filter(Boolean).join("; ")}` : ""),
    B("look", 4, clean(project.look) ? `Look: ${clean(project.look)}` : ""),
    B("realism", 4, "", "Photorealistic, natural motion and real-world physics; the same faces, bodies and clothes from first frame to last"),
    B("continuity", 5, continuityLine),
    B("flow", 5, "", flow),
    B("purpose", 5, "", why),
    B("technical", 1, `Aspect ratio ${aspect_ratio}`),
  ];
  const prompt = composePrompt(blocks, "image").text;
  const video_prompt = composePrompt(blocks, "video").text;

  const negative = [...BASE_NEGATIVE, ...(inFrame.length ? [`no people other than ${inFrame.map((c) => c.name).join(", ")}`] : ["no people"])];
  const missingLooks = inFrame.filter((c) => !clean(c.wardrobe)).map((c) => c.name);
  const undescribed = inFrame.filter((c) => !clean(c.description)).map((c) => c.name);
  const aged = inFrame.filter((c) => c.age_state);
  const agedWithoutRefs = aged.filter((c) => !refs.some((r) => r.kind === "character" && r.object_id === c.id)).map((c) => `${c.name} (${c.age_state!.label})`);

  const pkg: GenerationPackageContent = {
    project,
    scene: {
      number: scene.number, heading: scene.heading, location: scene.location, int_ext: scene.int_ext, time_of_day: scene.time_of_day,
      purpose: scene.purpose, mood: scene.mood, weather: scene.weather, atmosphere: scene.atmosphere,
    },
    camera: {
      size: shot.size, size_label: sizeLabel, angle: shot.angle, movement: shot.movement, lens_mm: shot.lens_mm, focus: shot.focus,
      composition: shot.composition, duration_seconds: shot.duration_seconds,
    },
    characters: inFrame.map((c) => ({ id: c.id, name: c.name, description: c.description, age: c.age, wardrobe: c.wardrobe, ...(c.gender ? { gender: c.gender } : {}), ...(c.age_state ? { age_state: c.age_state } : {}),
      ...(c.nationality ? { nationality: c.nationality } : {}), ...(c.accent ? { accent: c.accent } : {}), ...(c.physicality ? { physicality: c.physicality } : {}) })),
    performance: { action: clean(shot.description), dialogue: lines.map((l) => ({ speaker: l.speaker, text: l.text, emotion: l.emotion, ...(l.intensity !== null ? { intensity: l.intensity } : {}), ...(l.intention ? { intention: l.intention } : {}), ...(l.parenthetical ? { parenthetical: l.parenthetical } : {}) })) },
    lighting,
    technical: { aspect_ratio },
    world: { location: location ?? null, props },
    references: refs,
    negative,
    prompt,
    // 2.0.0: the moving-picture prompt and the ranked blocks each provider composes to its own limit.
    video_prompt,
    blocks,
    continuity: { screen: continuity.screen, previous: continuity.previous, next: continuity.next },
    provenance: {
      shot_id: shot.id,
      shot_plan_version_id: provenance.shot_plan_version_id,
      scene_dna_version_id: provenance.scene_dna_version_id,
      script_version_id: provenance.script_version_id,
      character_ids: inFrame.map((c) => c.id),
      dialogue_line_ids: lines.map((l) => l.id),
      settings_version: provenance.settings_version,
      world_revisions: Object.fromEntries([...(location ? [[location.id, location.revision]] : []), ...props.map((p) => [p.id, p.revision])]),
    },
    checks: [
      { id: "location", label: "Location applied", ok: !!clean(scene.location), evidence: place },
      {
        id: "location_described",
        label: "Location described in Locations & Props",
        ok: !!location && !!clean(location.description),
        evidence: location ? (clean(location.description) ? `${location.name} (revision ${location.revision})` : `${location.name} has no description yet — add one in Locations & Props`) : "Not found in Locations & Props yet — find places from the approved script there",
      },
      { id: "props", label: "Props in the scene", ok: props.every((p) => !!clean(p.description)), evidence: props.length ? props.map((p) => p.name + (clean(p.description) ? "" : " (no description)")).join(", ") : "None found for this scene" },
      {
        id: "references",
        label: "Reference images for consistency",
        ok: refs.length > 0,
        evidence: refs.length ? refs.map((r) => `${r.name} · ${r.view}`).join(", ") : "None yet — make reference views in Casting (characters) and Locations & Props",
      },
      { id: "camera", label: "Camera intent applied", ok: true, evidence: camera },
      {
        id: "characters",
        label: "Characters described",
        ok: undescribed.length === 0,
        evidence: inFrame.length ? (undescribed.length ? `No description in Casting: ${undescribed.join(", ")}` : inFrame.map((c) => c.name).join(", ")) : "Nobody in frame",
      },
      ...(aged.length
        ? [{
            id: "age",
            label: "Age for this scene",
            ok: agedWithoutRefs.length === 0,
            evidence: agedWithoutRefs.length
              ? `No reference views at this age yet: ${agedWithoutRefs.join(", ")} — make them in Casting → Look & references`
              : aged.map((c) => `${c.name}: ${c.age_state!.label}${c.age ? ` (${c.age})` : ""}`).join(", "),
          }]
        : []),
      {
        id: "wardrobe",
        label: "Wardrobe applied",
        ok: missingLooks.length === 0,
        evidence: inFrame.length ? (missingLooks.length ? `No look chosen in Scene DNA: ${missingLooks.join(", ")}` : "All chosen") : "Nobody in frame",
      },
      { id: "lighting", label: "Lighting set", ok: !!lighting, evidence: lighting ?? "No lighting in the shot or Scene DNA" },
      {
        id: "physicality",
        label: "How each character moves",
        ok: inFrame.every((c) => !!clean(c.physicality)),
        evidence: inFrame.length ? (inFrame.filter((c) => !clean(c.physicality)).length ? `No physicality & mannerisms in Casting: ${inFrame.filter((c) => !clean(c.physicality)).map((c) => c.name).join(", ")}` : inFrame.map((c) => c.name).join(", ")) : "Nobody in frame",
      },
      ...(lines.length
        ? [{
            id: "accent",
            label: "Accent for lip sync",
            ok: lines.every((l) => !l.character_id || !!accentOf(l.character_id)),
            evidence: lines.map((l) => `${l.speaker}: ${accentOf(l.character_id) ?? "no accent in Casting"}`).join("; "),
          }]
        : []),
      { id: "script", label: "The script's action for this shot", ok: script_action.length > 0, evidence: script_action.length ? shorten(script_action.join(" "), 160) : "No action lines next to this shot in the script" },
      { id: "screen", label: "Screen direction kept", ok: inFrame.length < 2 || placed.length === inFrame.length, evidence: screen || "One person or nobody in frame" },
      { id: "locked_sources", label: "Built from approved versions", ok: true, evidence: "Approved shot plan + locked Scene DNA" },
      {
        id: "style",
        label: "Style matched",
        ok: !!clean(project.look),
        evidence: clean(project.look) ? `Project look (settings v${provenance.settings_version ?? "?"}): ${clean(project.look)}` : "No project look set — add one in Project Settings",
      },
    ],
  };
  return { package: pkg, engine_version: ENGINE_VERSION };
}
