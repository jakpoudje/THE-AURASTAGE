// Who is already decided before the model writes (story, Casting, the writer, and people named in the logline).
import { StoryBriefSchema, type StoryBrief } from "./input.schema";
import { namedPeople, samePerson } from "./names";

/**
 * Everyone already decided: the characters passed in (story, Casting, the writer), then people the writer named in the
 * logline, then people named at least twice in the existing synopsis. One entry per person (titles don't split them).
 */
export function decidedPeople(briefIn: StoryBrief) {
  const b = StoryBriefSchema.parse(briefIn);
  const out = [...b.characters];
  const add = (name: string) => { if (!out.some((c) => samePerson(c.name, name))) out.push({ name: name.slice(0, 80), role: null, description: null, source: "logline" }); };
  for (const n of namedPeople(b.logline)) add(n);
  const syn = b.synopsis ?? "";
  for (const n of namedPeople(syn)) if (syn.split(n).length - 1 >= 2) add(n);
  return out.slice(0, 40);
}
