// Deterministic intent pre-classifier. It never decides what to change — it narrows which workspaces and objects a
// request is about, so the context engine sends only what matters and the planner is offered only relevant tools.
import type { AssistantModule, AssistantRequest, Intent, Operation } from "../contracts";

const SIGNALS: { module: AssistantModule; op: Operation; words: RegExp }[] = [
  { module: "script", op: "UPDATE_STORY", words: /\b(logline|synopsis|title|story|plot|act (one|two|three|1|2|3)|premise|theme|runtime|genre|tone)\b/i },
  { module: "casting", op: "CHANGE_WARDROBE", words: /\b(wardrobe|costume|dress|jacket|coat|shirt|suit|outfit|clothes|wearing|uniform|hat)\b/i },
  { module: "casting", op: "MODIFY_CHARACTER", words: /\b(age|aged|years old|backstory|personality|motivation|fears?|arc|occupation|nationality|character)\b/i },
  { module: "dialogue", op: "MODIFY_DIALOGUE", words: /\b(dialogue|line|lines|says?|said|speak|speech|subtext|admit|tell|whisper|shout)\b/i },
  { module: "scene_dna", op: "MODIFY_SCENE", words: /\b(night|evening|morning|dawn|dusk|afternoon|midday|rain|storm|thunder|snow|fog|wind|weather|mood|atmosphere|light(ing)?|dark(er)?|colder|warmer|threatening|tense|claustrophobic|scene)\b/i },
  { module: "scene_dna", op: "MODIFY_WORLD", words: /\b(locations?|places?|props?|vehicles?|set dressing|the set)\b/i },
  { module: "settings", op: "UPDATE_SETTINGS", words: /\b(aspect ratio|loudness|visual style|the look of the film|colour palette|color palette|deliverables?|credits|director|producer|production company|copyright|opening title|title card|end credits|theme music|composer)\b/i },
  { module: "shots", op: "MODIFY_SHOT", words: /\b(camera|coverage|close[- ]?up|wide|lens|dolly|push in|pan|tilt|handheld|angle|framing|shot)\b/i },
  { module: "generation", op: "GENERATE_MEDIA", words: /\b(generate|render an image|image|picture|take|video)\b/i },
  { module: "audio", op: "MODIFY_SCENE", words: /\b(sound|music|score|sfx|foley|ambience|footsteps|mix|volume|louder|quieter)\b/i },
  { module: "editorial", op: "EDIT_TIMELINE", words: /\b(cut|trim|timeline|edit|hold on|extend this shot|shorten|transitions?|fades?|dissolves?|cross-?fade|fade to black|fade from black)\b/i },
  { module: "assets", op: "ORGANISE_ASSETS", words: /\b(assets?|library|tags?|tagged|files?)\b/i },
  { module: "delivery", op: "EXPORT", words: /\b(export|master|deliverable|render the|4k|1080p|subtitles)\b/i },
];

/** Capitalised words that look like names ("Amara", "Daniel"), minus sentence starts and common words. */
function mentions(text: string): string[] {
  const stop = new Set(["Make", "Give", "Change", "Keep", "Add", "Remove", "Have", "The", "This", "That", "Scene", "Act", "Generate", "Reduce", "Hold", "Prepare", "I", "A", "An", "And", "But"]);
  const found = text.match(/\b[A-Z][a-z]{2,}(?:\s[A-Z][a-z]{2,})?\b/g) ?? [];
  const scenes = text.match(/\bscene\s+\d+\b/gi) ?? [];
  return [...new Set([...found.filter((w) => !stop.has(w.split(" ")[0])), ...scenes])].slice(0, 20);
}

export function classifyIntent(req: Pick<AssistantRequest, "module" | "text">): Intent {
  const hits = SIGNALS.filter((s) => s.words.test(req.text));
  const modules = [...new Set([req.module, ...hits.map((h) => h.module)])] as AssistantModule[];
  const question = /^\s*(what|why|how|who|when|where|which|is|are|does|do|can)\b[^.!]*\?\s*$/i.test(req.text);
  const inModule = hits.find((h) => h.module === req.module);
  const op: Operation = question ? "QUESTION" : (inModule ?? hits[0])?.op ?? "UNSUPPORTED";
  return { operation: op, modules, mentions: mentions(req.text), confidence: hits.length ? Math.min(0.9, 0.4 + 0.15 * hits.length) : 0.2 };
}
