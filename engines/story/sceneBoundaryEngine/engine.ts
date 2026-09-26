// engines/story/sceneBoundaryEngine
// Splits typed screenplay elements into scene candidates and derives a script
// analysis (page/runtime estimate, speaking characters, locations). Every
// figure is computed from the elements themselves, so the UI never shows an
// invented number (CLAUDE.md rule 12).

import { estimateLines, LINES_PER_PAGE, parseHeading, SECONDS_PER_PAGE } from "./rules";
import { validateSceneBoundaryInput } from "./validator";
import { ENGINE_VERSION } from "./version";
import type { SceneBoundaryOutput, SceneCandidate } from "./output.schema";

export function sceneBoundaryEngine(rawInput: unknown): SceneBoundaryOutput {
  const { elements } = validateSceneBoundaryInput(rawInput);

  const scenes: SceneCandidate[] = [];
  let totalLines = 0;
  let current: (SceneCandidate & { lines: number; speakers: Set<string> }) | null = null;

  const speakerLines = new Map<string, number>();
  const speakerScenes = new Map<string, Set<number>>();
  const locationScenes = new Map<string, Set<number>>();

  const close = () => {
    if (!current) return;
    const { lines, speakers, ...rest } = current;
    scenes.push({
      ...rest,
      speaking_characters: [...speakers],
      estimated_seconds: Math.round((lines / LINES_PER_PAGE) * SECONDS_PER_PAGE),
    });
    current = null;
  };

  let lastSpeaker: string | null = null;
  for (const el of elements) {
    const lines = estimateLines(el.type, el.text);
    totalLines += lines;

    if (el.type === "scene_heading") {
      close();
      const number = scenes.length + 1;
      const parsed = parseHeading(el.text);
      current = {
        number,
        heading: el.text,
        ...parsed,
        speaking_characters: [],
        estimated_seconds: 0,
        element_start: el.index,
        element_end: el.index,
        heading_line: el.line,
        lines,
        speakers: new Set(),
      };
      const locKey = parsed.location || "UNKNOWN";
      if (!locationScenes.has(locKey)) locationScenes.set(locKey, new Set());
      locationScenes.get(locKey)!.add(number);
      continue;
    }

    if (el.type === "character" && el.speaker) lastSpeaker = el.speaker;
    if (el.type === "dialogue" && lastSpeaker) {
      speakerLines.set(lastSpeaker, (speakerLines.get(lastSpeaker) ?? 0) + 1);
    }

    if (current) {
      const scene = current as SceneCandidate & { lines: number; speakers: Set<string> };
      scene.lines += lines;
      scene.element_end = el.index;
      if (el.type === "character" && el.speaker) {
        scene.speakers.add(el.speaker);
        if (!speakerScenes.has(el.speaker)) speakerScenes.set(el.speaker, new Set());
        speakerScenes.get(el.speaker)!.add(scene.number);
      }
    }
  }
  close();

  const estimatedPages = Math.round((totalLines / LINES_PER_PAGE) * 10) / 10;
  return {
    scenes,
    analysis: {
      estimated_pages: estimatedPages,
      estimated_minutes: Math.round((totalLines / LINES_PER_PAGE) * (SECONDS_PER_PAGE / 60) * 10) / 10,
      scene_count: scenes.length,
      speaking_characters: [...speakerLines.entries()]
        .map(([name, lines]) => ({ name, lines, scenes: speakerScenes.get(name)?.size ?? 0 }))
        .sort((a, b) => b.lines - a.lines || a.name.localeCompare(b.name)),
      locations: [...locationScenes.entries()]
        .map(([name, s]) => ({ name, scenes: s.size }))
        .sort((a, b) => b.scenes - a.scenes || a.name.localeCompare(b.name)),
    },
    engine_version: ENGINE_VERSION,
  };
}
