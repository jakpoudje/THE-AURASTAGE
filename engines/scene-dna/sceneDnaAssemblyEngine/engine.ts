// engines/scene-dna/sceneDnaAssemblyEngine
// SRS §8.1 steps 1–6 and 8: materialises one scene's production blueprint from
// canonical upstream data (script scene, Casting participants and looks,
// Dialogue lines, adjacent scenes) plus keyword evidence from the action text,
// then runs deterministic readiness predicates. The "proposal" is what a
// person edits and approves; this engine never invents values — every
// detection carries the source line it came from.

import type { ReadinessPredicate } from "@aurastage/contracts";
import { ATMOSPHERE, CONTINUOUS_TIME, SOUND, WEATHER } from "./rules";
import { validateSceneDnaAssemblyInput } from "./validator";
import { ENGINE_VERSION } from "./version";
import type { SceneDnaAssemblyOutput, SceneDnaProposal } from "./output.schema";

function detect<T extends { re: RegExp }>(lex: T[], action: { line: number; text: string }[], name: (t: T) => string) {
  const out: { value: string; line: number; text: string }[] = [];
  const seen = new Set<string>();
  for (const a of action) {
    for (const t of lex) {
      const v = name(t);
      if (seen.has(v)) continue;
      const m = a.text.match(t.re);
      if (m) {
        seen.add(v);
        out.push({ value: v, line: a.line, text: a.text.length > 140 ? a.text.slice(0, 137) + "…" : a.text });
      }
    }
  }
  return out;
}

export function sceneDnaAssemblyEngine(rawInput: unknown): SceneDnaAssemblyOutput {
  const input = validateSceneDnaAssemblyInput(rawInput);
  const { scene, action, participants, dialogue, adjacent, wardrobe_available, editable } = input;
  const lookById = new Map(wardrobe_available.map((l) => [l.id, l]));

  const people = participants
    .map((p) => {
      const lookId = editable.wardrobe[p.character_id] ?? null;
      const look = lookId ? lookById.get(lookId) : undefined;
      return {
        character_id: p.character_id,
        name: p.name,
        presence: p.voice_only ? ("voice_only" as const) : ("on_screen" as const),
        speaking: p.speaking,
        line_count: p.line_count,
        wardrobe_look_id: look && look.character_id === p.character_id ? look.id : null,
        wardrobe_look_name: look && look.character_id === p.character_id ? look.name : null,
      };
    })
    .sort((a, b) => Number(b.presence === "on_screen") - Number(a.presence === "on_screen") || b.line_count - a.line_count || a.name.localeCompare(b.name));

  const emotionCounts = new Map<string, number>();
  for (const d of dialogue) if (d.emotion) emotionCounts.set(d.emotion, (emotionCounts.get(d.emotion) ?? 0) + 1);
  const intensities = dialogue.map((d) => d.intensity).filter((x): x is number => x !== null);

  const weather = detect(WEATHER, action, (t) => t.value);
  const atmosphere = detect(ATMOSPHERE, action, (t) => t.value);
  const sound = detect(SOUND, action, (t) => t.cue).map((s) => ({ cue: s.value, line: s.line, text: s.text }));

  const notes: string[] = [];
  const prev = adjacent.previous;
  if (prev) {
    if (prev.location === scene.location && prev.int_ext === scene.int_ext) notes.push(`Same location as scene ${prev.number} — keep set dressing and lighting consistent.`);
    if (scene.time_of_day && CONTINUOUS_TIME.test(scene.time_of_day)) {
      notes.push(`Continues directly from scene ${prev.number}${prev.time_of_day ? ` (${prev.time_of_day})` : ""} — wardrobe, props and light must match.`);
    } else if (prev.time_of_day && scene.time_of_day && prev.time_of_day !== scene.time_of_day && !CONTINUOUS_TIME.test(prev.time_of_day)) {
      notes.push(`Time changes from ${prev.time_of_day} (scene ${prev.number}) to ${scene.time_of_day}.`);
    }
  }
  if (adjacent.next && adjacent.next.time_of_day && CONTINUOUS_TIME.test(adjacent.next.time_of_day)) {
    notes.push(`Scene ${adjacent.next.number} continues directly from this one.`);
  }

  const onScreenIndividuals = people.filter((p) => p.presence === "on_screen" && participants.find((x) => x.character_id === p.character_id)?.kind === "individual");
  const unresolved = [...new Set(dialogue.filter((d) => !d.character_id).map((d) => d.speaker))];
  const needsReview = dialogue.filter((d) => d.review_state === "review_required").length;
  const approvedLines = dialogue.filter((d) => d.approval === "approved").length;
  const unapprovedChars = participants.filter((p) => !p.voice_only && p.status !== "approved").map((p) => p.name);
  const missingLooks = onScreenIndividuals.filter((p) => !p.wardrobe_look_id).map((p) => p.name);
  const silent = dialogue.length === 0;

  const readiness: ReadinessPredicate[] = [
    {
      id: "scene_in_approved_script",
      label: "Scene is in the approved script",
      ok: scene.status === "active",
      blocking: true,
      evidence: scene.status === "active" ? `Scene ${scene.number}: ${scene.heading}` : "This scene was cut from the approved script.",
    },
    {
      id: "speakers_resolved",
      label: "Every speaker is a character in Casting",
      ok: unresolved.length === 0,
      blocking: true,
      evidence: unresolved.length ? `Not in Casting: ${unresolved.join(", ")}` : `${participants.length} participant${participants.length === 1 ? "" : "s"} resolved`,
    },
    {
      id: "dialogue_approved",
      label: silent ? "Silent scene (no dialogue expected)" : "Dialogue approved",
      ok: silent || (approvedLines === dialogue.length && needsReview === 0),
      blocking: true,
      evidence: silent
        ? editable.silent_scene
          ? "Marked as a silent scene."
          : "The script has no dialogue in this scene."
        : `${approvedLines} of ${dialogue.length} lines approved${needsReview ? `, ${needsReview} need review` : ""}`,
    },
    {
      id: "purpose_written",
      label: "Scene purpose written",
      ok: !!editable.purpose?.trim(),
      blocking: false,
      evidence: editable.purpose?.trim() ? editable.purpose.trim().slice(0, 120) : "Say what this scene must achieve for the story.",
    },
    {
      id: "characters_approved",
      label: "On-screen characters approved in Casting",
      ok: unapprovedChars.length === 0,
      blocking: false,
      evidence: unapprovedChars.length ? `Still draft: ${unapprovedChars.join(", ")}` : "All approved",
    },
    {
      id: "wardrobe_assigned",
      label: "Wardrobe chosen for on-screen characters",
      ok: missingLooks.length === 0,
      blocking: false,
      evidence: missingLooks.length ? `No look chosen: ${missingLooks.join(", ")}` : onScreenIndividuals.length ? "All chosen" : "No on-screen individuals",
    },
    {
      id: "time_and_place_known",
      label: "Interior/exterior and time of day known",
      ok: scene.int_ext !== "UNKNOWN" && !!scene.time_of_day,
      blocking: false,
      evidence: `${scene.int_ext === "UNKNOWN" ? "INT/EXT not given" : scene.int_ext} · ${scene.time_of_day ?? "no time of day in the heading"}`,
    },
  ];

  const proposal: SceneDnaProposal = {
    narrative: { intended_duration_seconds: scene.estimated_seconds },
    participants: people,
    dialogue: {
      line_ids: dialogue.map((d) => d.id),
      total: dialogue.length,
      approved: approvedLines,
      needs_review: needsReview,
      emotions: [...emotionCounts.entries()].map(([emotion, count]) => ({ emotion, count })).sort((a, b) => b.count - a.count || a.emotion.localeCompare(b.emotion)),
      peak_intensity: intensities.length ? Math.max(...intensities) : null,
      silent,
    },
    location: { name: scene.location, int_ext: scene.int_ext, time_of_day: scene.time_of_day },
    environment: { weather, atmosphere },
    sound_candidates: sound,
    continuity: {
      previous: prev ? { number: prev.number, heading: prev.heading } : null,
      next: adjacent.next ? { number: adjacent.next.number, heading: adjacent.next.heading } : null,
      notes,
    },
    readiness,
    ready_for_approval: readiness.filter((r) => r.blocking).every((r) => r.ok),
  };
  return { proposal, engine_version: ENGINE_VERSION };
}
