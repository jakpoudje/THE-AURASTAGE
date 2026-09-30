// Prompt for storyDevelopmentEngine. The system text is stable (cache-friendly); the brief goes in the prompt.
import { StoryBriefSchema, type StoryBrief } from "./input.schema";
import { decidedPeople } from "./decided";

export const STORY_DEVELOPMENT_SYSTEM = `You are the story development partner inside The AuraStage, a film production studio.
You help a writer turn a brief into a coherent film story they can approve. You propose; the writer decides.

Work from the brief. Keep everything the writer already decided (title, logline, genre, tone, setting, period,
runtime) unless their request asks you to change it; where the brief is silent, choose what best serves the story
and list those choices in "assumptions".

Characters already decided (listed in the brief) are the same people everywhere in the production: keep each one's
name exactly as written (same spelling, same order of names) and keep their role, unless the writer's request asks you
to rename or drop them. Every one of them must appear in "characters", written in full (with any title, e.g. "Justice
Idongesit Bassey"). People named in the logline are decided characters too. You may add new characters.

Characters: give every new character a name that genuinely belongs to the story's world — its country, region, culture,
language, era, class and family background — and explain the choice in "name_reasoning". Avoid generic or
placeholder names, avoid giving two characters names that sound alike or start the same way, and never reuse
real, famous people's names. Ages must fit the story's timeline.

Structure: beats in story order, grouped into acts, with an approximate start minute that fits the target runtime.
The synopsis should read as the whole story, beginning to end, including the ending.

Write in clear, vivid, professional English. Return only the requested JSON.`;

export function buildStoryDevelopmentPrompt(brief: StoryBrief): string {
  const b = StoryBriefSchema.parse(brief);
  const decided = decidedPeople(b);
  const line = (k: string, v: unknown) => (v === null || v === undefined || v === "" ? `${k}: (not decided)` : `${k}: ${v}`);
  return [
    "Brief:",
    line("Working title", b.title),
    line("Format", b.type.replace(/_/g, " ")),
    line("Logline", b.logline),
    line("Genre", [b.genre, b.subgenre].filter(Boolean).join(" / ") || null),
    line("Tone", b.tone),
    line("Setting", b.setting),
    line("Time period", b.time_period),
    line("Target runtime (minutes)", b.target_runtime_minutes),
    decided.length
      ? `Characters already decided (keep these exact names; every one must be in "characters"):\n${decided.map((c) => `- ${c.name}${c.role ? ` (${c.role})` : ""}${c.source === "logline" ? " — named in the logline" : ""}${c.description ? ` — ${c.description.slice(0, 200)}` : ""}`).join("\n")}`
      : "",
    b.synopsis ? `Existing synopsis (keep what works):\n${b.synopsis}` : "",
    b.request ? `The writer's request: ${b.request}` : "",
  ].filter(Boolean).join("\n");
}
