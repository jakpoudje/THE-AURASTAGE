// engines/generation/promptCompilerEngine
// SRS §10: compiles a structured, provider-neutral GenerationPackage from the
// APPROVED shot (shot plan version), the LOCKED Scene DNA version, Casting
// characters/wardrobe and project settings. Every block cites its source and
// provenance records the exact version ids (rule 10). The prompt text is
// assembled from the blocks — providers translate the package, not the prose.

import type { GenerationPackageContent } from "@aurastage/contracts";
import { ANGLE_WORDS, BASE_NEGATIVE, FOCUS_WORDS, MOVEMENT_WORDS, SIZE_WORDS } from "./rules";
import { validatePromptCompilerInput } from "./validator";
import { ENGINE_VERSION } from "./version";
import type { PromptCompilerOutput } from "./output.schema";

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const sentence = (s: string) => (s && !/[.!?]$/.test(s) ? `${s}.` : s);

export function promptCompilerEngine(raw: unknown): PromptCompilerOutput {
  const { project, scene, shot, characters, dialogue, aspect_ratio, provenance, location, props, references } = validatePromptCompilerInput(raw);
  const inFrame = shot.character_ids.map((id) => characters.find((c) => c.id === id)).filter((c): c is (typeof characters)[number] => !!c);
  const lighting = clean(shot.lighting) || clean(scene.lighting_intent) || null;
  const sizeLabel = SIZE_WORDS[shot.size] ?? shot.size;

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
    const bits = [c.name, age, clean(c.description) ? `— ${clean(c.description)}` : null, clean(c.wardrobe) ? `wearing ${clean(c.wardrobe)}` : null];
    return bits.filter(Boolean).join(" ");
  });
  // The canonical location (described once in Locations & Props) is named and described in every shot of the scene.
  const placeName = location ? location.name : scene.location;
  const place = `${scene.int_ext === "EXT" ? "Exterior" : scene.int_ext === "INT" ? "Interior" : "Location"}: ${placeName}${scene.time_of_day ? `, ${scene.time_of_day.toLowerCase()}` : ""}${location && clean(location.description) ? ` — ${clean(location.description)}` : ""}`;
  const propLine = props.map((p) => (clean(p.description) ? `${p.name} (${clean(p.description)})` : p.name)).join("; ");
  const inFrameIds = new Set(inFrame.map((c) => c.id));
  // Only references that belong to this shot: characters in frame, this scene's location and props.
  const refs = references.filter((r) => (r.kind === "character" ? inFrameIds.has(r.object_id) : r.kind === "location" ? r.object_id === location?.id : props.some((p) => p.id === r.object_id)));
  const style = [project.genre, project.tone].map(clean).filter(Boolean).join(", ");
  const world = [project.setting, project.time_period].map(clean).filter(Boolean).join(", ");

  const lines = dialogue.filter((d) => shot.dialogue_line_ids.includes(d.id));
  const performance = lines.length
    ? `Performance: ${lines.map((l) => `${l.speaker}${l.emotion ? ` (${l.emotion})` : ""} says "${l.text}"`).join("; ")}`
    : "";

  const prompt = [
    sentence(`Cinematic film still, ${camera}`),
    sentence(clean(shot.description)),
    people.length ? sentence(`In frame: ${people.join("; ")}`) : "",
    sentence(place),
    propLine ? sentence(`Props in the scene: ${propLine}`) : "",
    clean(scene.weather) ? sentence(`Weather: ${clean(scene.weather)}`) : "",
    clean(scene.atmosphere) ? sentence(`Atmosphere: ${clean(scene.atmosphere)}`) : "",
    lighting ? sentence(`Lighting: ${lighting}`) : "",
    scene.mood.length ? sentence(`Mood: ${scene.mood.join(", ")}`) : "",
    clean(shot.composition) ? sentence(`Composition: ${clean(shot.composition)}`) : "",
    sentence(performance),
    style || world ? sentence(`Style: ${[style, world].filter(Boolean).join("; ")}`) : "",
    clean(project.look) ? sentence(`Look: ${clean(project.look)}`) : "",
    sentence(`Aspect ratio ${aspect_ratio}`),
  ].filter(Boolean).join(" ");

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
    characters: inFrame.map((c) => ({ id: c.id, name: c.name, description: c.description, age: c.age, wardrobe: c.wardrobe, ...(c.gender ? { gender: c.gender } : {}), ...(c.age_state ? { age_state: c.age_state } : {}) })),
    performance: { action: clean(shot.description), dialogue: lines.map((l) => ({ speaker: l.speaker, text: l.text, emotion: l.emotion })) },
    lighting,
    technical: { aspect_ratio },
    world: { location: location ?? null, props },
    references: refs,
    negative,
    prompt,
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
