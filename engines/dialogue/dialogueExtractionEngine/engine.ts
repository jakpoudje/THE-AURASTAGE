// engines/dialogue/dialogueExtractionEngine
// Turns an approved screenplay version into DialogueLines (SRS §7): one line per
// character cue block (cue + its dialogue, with parentheticals kept separately),
// with scene, position, a timing estimate and a stable hash of the words spoken.
// Deterministic; no AI calls.

import { normalizeCharacterName } from "@aurastage/contracts";
import { hash53, normaliseSpeech, PARENTHETICAL_BEAT_SECONDS, wordCount, WORDS_PER_SECOND } from "./rules";
import { validateDialogueExtractionInput } from "./validator";
import { ENGINE_VERSION } from "./version";
import type { DialogueExtractionOutput, ExtractedLine } from "./output.schema";

export function dialogueExtractionEngine(rawInput: unknown): DialogueExtractionOutput {
  const { elements, scenes } = validateDialogueExtractionInput(rawInput);
  const sceneOf = new Map<number, number>();
  for (const s of scenes) for (let i = s.element_start; i <= s.element_end; i++) sceneOf.set(i, s.number);

  const lines: ExtractedLine[] = [];
  const ordinals = new Map<number, number>();
  let i = 0;
  while (i < elements.length) {
    const el = elements[i];
    const scene = sceneOf.get(el.index);
    if (el.type !== "character" || !el.speaker || scene === undefined) {
      i++;
      continue;
    }
    const speech: string[] = [];
    const directions: string[] = [];
    let j = i + 1;
    while (j < elements.length && (elements[j].type === "dialogue" || elements[j].type === "parenthetical")) {
      if (elements[j].type === "dialogue") speech.push(elements[j].text);
      else directions.push(elements[j].text);
      j++;
    }
    if (speech.length > 0) {
      const text = normaliseSpeech(speech.join(" "));
      const speaker_key = normalizeCharacterName(el.speaker);
      const words = wordCount(text);
      const ordinal = (ordinals.get(scene) ?? 0) + 1;
      ordinals.set(scene, ordinal);
      lines.push({
        scene_number: scene,
        ordinal,
        speaker_name: el.speaker,
        speaker_key,
        extensions: el.extensions ?? [],
        parenthetical: directions.length ? directions.join(" ") : null,
        text,
        text_hash: hash53(`${speaker_key}|${text.toLowerCase()}`),
        element_index: el.index,
        line: el.line,
        word_count: words,
        estimated_seconds: Math.round((words / WORDS_PER_SECOND + directions.length * PARENTHETICAL_BEAT_SECONDS) * 10) / 10,
      });
    }
    i = j;
  }
  return { lines, engine_version: ENGINE_VERSION };
}
