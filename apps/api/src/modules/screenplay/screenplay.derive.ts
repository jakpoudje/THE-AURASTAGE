// apps/api/src/modules/screenplay/screenplay.derive.ts
// Pure derivation: screenplay text -> typed elements -> scene candidates.
// Domain: Scriptwriter
//
// Runs the deterministic story engines (engines/story/**) and adds a content
// hash per scene so re-approval can tell which scenes actually changed and
// flag them REVIEW_REQUIRED instead of silently overwriting (CLAUDE.md rule 11).
// No I/O here, so it is unit-tested directly (./tests).

import { createHash } from "node:crypto";
import type { ScreenplayElement } from "@aurastage/contracts";
import { sceneBoundary, sceneBoundaryEngine, screenplayFormat, screenplayFormatEngine } from "@aurastage/engines";

export const PARSER_VERSION = `${screenplayFormat.ENGINE_ID}@${screenplayFormat.ENGINE_VERSION}`;
export const SCENE_ENGINE_VERSION = `${sceneBoundary.ENGINE_ID}@${sceneBoundary.ENGINE_VERSION}`;

export function parseScreenplay(sourceText: string) {
  return screenplayFormatEngine({ source_text: sourceText }).elements;
}

/** Hash only what the scene says (types + text), not where it sits, so moving a scene elsewhere doesn't count as a change. */
export function sceneContentHash(elements: ScreenplayElement[], start: number, end: number): string {
  const h = createHash("sha256");
  for (const el of elements.slice(start, end + 1)) {
    h.update(el.type);
    h.update("\u0000");
    h.update(el.text);
    h.update("\u0001");
  }
  return h.digest("hex");
}

export function deriveScenes(elements: ScreenplayElement[]) {
  const { scenes, analysis } = sceneBoundaryEngine({ elements });
  return {
    analysis,
    scenes: scenes.map((s) => ({
      number: s.number,
      heading: s.heading,
      int_ext: s.int_ext,
      location: s.location,
      time_of_day: s.time_of_day,
      speaking_characters: s.speaking_characters,
      estimated_seconds: s.estimated_seconds,
      element_start: s.element_start,
      element_end: s.element_end,
      content_hash: sceneContentHash(elements, s.element_start, s.element_end),
    })),
  };
}
