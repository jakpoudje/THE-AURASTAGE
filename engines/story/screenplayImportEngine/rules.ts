// Final Draft (.fdx) paragraph types -> how each becomes Fountain text.
export const FDX_TYPE_MAP: Record<string, "scene_heading" | "action" | "character" | "parenthetical" | "dialogue" | "transition" | "shot"> = {
  "Scene Heading": "scene_heading",
  Action: "action",
  General: "action",
  Character: "character",
  Parenthetical: "parenthetical",
  Dialogue: "dialogue",
  Transition: "transition",
  Shot: "shot",
};

export const STANDARD_HEADING_RE = /^(INT|EXT|EST|INT\.?\/EXT|I\/E)[.\s]/i;
export const TEXT_EXTENSIONS = [".fountain", ".txt", ".spmd", ".text"];
export const FDX_EXTENSION = ".fdx";
