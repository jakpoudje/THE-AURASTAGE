// storyDevelopmentEngine (SRS Scriptwriter: AI story development). The model call happens in a worker through the
// Provider Gateway; this engine supplies the prompt and checks the answer deterministically before it is shown.
import { StoryBriefSchema, type StoryBrief } from "./input.schema";
import { StoryDevelopmentOutputSchema, type StoryDevelopmentOutput } from "./output.schema";
import { buildStoryDevelopmentPrompt, STORY_DEVELOPMENT_SYSTEM } from "./prompt";
import { ENGINE_VERSION } from "./version";

export function storyDevelopmentRequest(brief: StoryBrief) {
  return { system: STORY_DEVELOPMENT_SYSTEM, prompt: buildStoryDevelopmentPrompt(brief), schema: StoryDevelopmentOutputSchema, engine_version: ENGINE_VERSION };
}

const firstName = (n: string) => n.trim().split(/\s+/)[0].toLowerCase();

/** Evidence-based checks on a proposal; failed checks are shown to the writer, never hidden. */
export function checkStoryDevelopment(briefIn: StoryBrief, out: StoryDevelopmentOutput) {
  const brief = StoryBriefSchema.parse(briefIn);
  const names = out.characters.map((c) => c.name.trim().toLowerCase());
  const firsts = out.characters.map((c) => firstName(c.name));
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  const sameInitial = firsts.filter((f, i) => firsts.findIndex((g) => g !== f && g[0] === f[0] && g.slice(0, 3) === f.slice(0, 3)) !== -1 && i === firsts.indexOf(f));
  const beatsOrdered = out.beats.every((b, i) => i === 0 || (b.act >= out.beats[i - 1].act && b.approx_minute >= out.beats[i - 1].approx_minute));
  const lastMinute = out.beats.length ? out.beats[out.beats.length - 1].approx_minute : 0;
  const runtime = brief.target_runtime_minutes;
  const protagonists = out.characters.filter((c) => c.role === "protagonist").length;
  return [
    { id: "unique_names", ok: dupes.length === 0, label: "Every character has a different name", evidence: dupes.length ? `Repeated: ${[...new Set(dupes)].join(", ")}` : `${names.length} names` },
    { id: "distinct_names", ok: sameInitial.length === 0, label: "Names don't sound alike", evidence: sameInitial.length ? `Similar: ${sameInitial.join(", ")}` : "Distinct" },
    { id: "protagonist", ok: protagonists >= 1, label: "There is a protagonist", evidence: `${protagonists} protagonist(s)` },
    { id: "beats_ordered", ok: beatsOrdered, label: "Beats are in story order", evidence: beatsOrdered ? `${out.beats.length} beats` : "Out of order" },
    { id: "fits_runtime", ok: !runtime || (lastMinute <= runtime && lastMinute >= runtime * 0.6), label: "Beats fit the target runtime",
      evidence: runtime ? `Last beat at minute ${lastMinute} of ${runtime}` : "No runtime set" },
    (() => {
      const renaming = /\b(rename|new names?|different names?|change (the )?names?)\b/i.test(brief.request);
      const have = new Set(out.characters.map((c) => c.name.trim().toLowerCase()));
      const lost = brief.characters.filter((c) => !have.has(c.name.trim().toLowerCase())).map((c) => c.name);
      return { id: "keeps_names", ok: renaming || lost.length === 0, label: "Keeps the characters already decided",
        evidence: !brief.characters.length ? "No characters decided yet" : lost.length ? `${renaming ? "Renamed on request" : "Missing or renamed"}: ${lost.join(", ")}` : `Kept: ${brief.characters.map((c) => c.name).join(", ")}` };
    })(),
    { id: "keeps_title", ok: !brief.title || out.title_options.some((t) => t.toLowerCase() === brief.title.toLowerCase()) || /title/i.test(brief.request), label: "Keeps the working title as an option",
      evidence: out.title_options.join(" · ") },
  ];
}

export const storyDevelopmentEngine = { request: storyDevelopmentRequest, check: checkStoryDevelopment, version: ENGINE_VERSION };
