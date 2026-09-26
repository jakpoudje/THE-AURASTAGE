// engines/story/screenplayFormatEngine
// Parses Fountain-style screenplay text into typed ScreenplayElements (SRS §5).
// Deterministic and dependency-free so it can run in the API, in workers, and
// in the browser for live editor feedback. Every element records the source
// line it came from, which is the evidence link SRS §5.2 asks for.

import type { ScreenplayElement } from "@aurastage/contracts";
import {
  CUE_EXTENSION_RE,
  FIXED_TRANSITIONS,
  NOT_A_SPEAKER_PREFIXES,
  SCENE_HEADING_RE,
  TRANSITION_RE,
  isUpperCaseLine,
} from "./rules";
import { validateScreenplayFormatInput } from "./validator";
import { ENGINE_VERSION } from "./version";
import type { ScreenplayFormatOutput } from "./output.schema";

function isBlank(line: string | undefined): boolean {
  return line === undefined || line.trim() === "";
}

function parseCue(raw: string): { speaker: string; extensions: string[] } {
  const extensions: string[] = [];
  for (const m of raw.matchAll(CUE_EXTENSION_RE)) {
    const ext = m[1].trim();
    if (ext) extensions.push(ext.toUpperCase());
  }
  const speaker = raw
    .replace(CUE_EXTENSION_RE, "")
    .replace(/\^$/, "") // dual-dialogue marker
    .replace(/^@/, "")
    .trim()
    .toUpperCase();
  return { speaker, extensions };
}

function looksLikeCue(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.startsWith("@")) return true;
  if (trimmed.startsWith("!")) return false; // forced action
  const name = trimmed.replace(CUE_EXTENSION_RE, "").replace(/\^$/, "").trim();
  if (!name || name.length > 40) return false;
  if (!isUpperCaseLine(name)) return false;
  if (name.endsWith(":") || name.endsWith(".")) return false;
  if (NOT_A_SPEAKER_PREFIXES.some((p) => name.startsWith(p))) return false;
  return true;
}

function sceneHeadingText(line: string): string | null {
  const trimmed = line.trim();
  if (trimmed.startsWith(".") && !trimmed.startsWith("..")) return trimmed.slice(1).trim();
  if (SCENE_HEADING_RE.test(trimmed)) return trimmed;
  return null;
}

function transitionText(line: string): string | null {
  const trimmed = line.trim();
  if (trimmed.startsWith(">") && !trimmed.endsWith("<")) return trimmed.slice(1).trim();
  if (FIXED_TRANSITIONS.has(trimmed.toUpperCase()) && isUpperCaseLine(trimmed)) return trimmed;
  if (TRANSITION_RE.test(trimmed)) return trimmed;
  return null;
}

export function screenplayFormatEngine(rawInput: unknown): ScreenplayFormatOutput {
  const { source_text } = validateScreenplayFormatInput(rawInput);
  const lines = source_text.replace(/\r\n?/g, "\n").split("\n");
  const elements: ScreenplayElement[] = [];
  const push = (el: Omit<ScreenplayElement, "index">) => elements.push({ ...el, index: elements.length });

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const lineNo = i + 1;
    const prevBlank = i === 0 || isBlank(lines[i - 1]);

    if (isBlank(line)) {
      i++;
      continue;
    }
    const trimmed = line.trim();

    // Notes [[ ... ]] and sections # ...
    if (trimmed.startsWith("[[") && trimmed.endsWith("]]")) {
      push({ type: "note", text: trimmed.slice(2, -2).trim(), line: lineNo });
      i++;
      continue;
    }
    if (trimmed.startsWith("#")) {
      push({ type: "section", text: trimmed.replace(/^#+/, "").trim(), line: lineNo });
      i++;
      continue;
    }

    // Centered text > ... <
    if (trimmed.startsWith(">") && trimmed.endsWith("<")) {
      push({ type: "centered", text: trimmed.slice(1, -1).trim(), line: lineNo });
      i++;
      continue;
    }

    if (prevBlank) {
      const heading = sceneHeadingText(line);
      if (heading !== null) {
        push({ type: "scene_heading", text: heading.replace(/\s*#[^#]+#\s*$/, "").toUpperCase(), line: lineNo });
        i++;
        continue;
      }
      const transition = transitionText(line);
      if (transition !== null && isBlank(lines[i + 1])) {
        push({ type: "transition", text: transition.toUpperCase(), line: lineNo });
        i++;
        continue;
      }
      // Character cue: upper-case line followed directly by dialogue.
      if (!isBlank(lines[i + 1]) && looksLikeCue(line)) {
        const { speaker, extensions } = parseCue(trimmed);
        push({ type: "character", text: trimmed.replace(/^@/, ""), line: lineNo, speaker, extensions });
        i++;
        let dialogueBuf: string[] = [];
        let dialogueLine = 0;
        const flushDialogue = () => {
          if (dialogueBuf.length) {
            push({ type: "dialogue", text: dialogueBuf.join("\n"), line: dialogueLine });
            dialogueBuf = [];
          }
        };
        while (i < lines.length && !isBlank(lines[i])) {
          const dl = lines[i].trim();
          if (dl.startsWith("(") && dl.endsWith(")")) {
            flushDialogue();
            push({ type: "parenthetical", text: dl, line: i + 1 });
          } else {
            if (!dialogueBuf.length) dialogueLine = i + 1;
            dialogueBuf.push(dl);
          }
          i++;
        }
        flushDialogue();
        continue;
      }
    }

    // Action: consecutive non-blank lines form one action block.
    const actionLines: string[] = [];
    const start = lineNo;
    while (i < lines.length && !isBlank(lines[i])) {
      actionLines.push(lines[i].replace(/^!/, "").trimEnd());
      i++;
    }
    push({ type: "action", text: actionLines.join("\n").trim(), line: start });
  }

  return { elements, engine_version: ENGINE_VERSION };
}
