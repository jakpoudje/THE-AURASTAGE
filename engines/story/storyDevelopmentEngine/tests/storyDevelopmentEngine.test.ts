import { describe, expect, it } from "vitest";
import { checkStoryDevelopment, storyDevelopmentRequest, StoryDevelopmentOutputSchema } from "../index";

const brief = { title: "Shadows of Lagos", logline: "A journalist uncovers election fraud.", genre: "Thriller", setting: "Lagos, Nigeria", time_period: "2023", target_runtime_minutes: 100 };
const out = {
  title_options: ["Shadows of Lagos", "Ballot"], logline: "A Lagos journalist risks everything to expose a rigged election.",
  synopsis: "Adaeze Okafor, an investigative journalist, finds a ledger that proves the vote was bought. ".repeat(2),
  themes: ["truth", "power"], genre: "Thriller", tone: "Tense", setting: "Lagos, Nigeria", time_period: "2023",
  characters: [
    { name: "Adaeze Okafor", role: "protagonist", age: 34, name_reasoning: "Igbo name meaning 'king's daughter'", description: "d", want: "w", need: "n", arc: "a" },
    { name: "Tunde Bakare", role: "antagonist", age: 55, name_reasoning: "Yoruba, Lagos political class", description: "d", want: "w", need: "n", arc: "a" },
  ],
  beats: [{ act: 1, title: "Ledger", summary: "s", approx_minute: 0 }, { act: 2, title: "Chase", summary: "s", approx_minute: 45 }, { act: 3, title: "Broadcast", summary: "s", approx_minute: 92 }],
  assumptions: ["Set during the 2023 election"],
} as const;

describe("storyDevelopmentEngine", () => {
  it("builds a stable system prompt and a brief-based prompt that marks undecided fields", () => {
    const r = storyDevelopmentRequest({ title: "Untitled", request: "Make the villain sympathetic" });
    expect(r.system).toMatch(/names? that genuinely belongs to the story's world/);
    expect(r.prompt).toMatch(/Logline: \(not decided\)/);
    expect(r.prompt).toMatch(/The writer's request: Make the villain sympathetic/);
    expect(r.engine_version).toBe("1.0.0");
  });
  it("accepts a well-formed proposal and passes its checks", () => {
    const parsed = StoryDevelopmentOutputSchema.parse(out);
    expect(checkStoryDevelopment(brief, parsed).every((c) => c.ok)).toBe(true);
  });
  it("flags duplicate or look-alike names, disordered beats and runtime overrun", () => {
    const bad = StoryDevelopmentOutputSchema.parse({
      ...out,
      characters: [out.characters[0], { ...out.characters[1], name: "Adaeze Okafor" }, { ...out.characters[1], name: "Adanna Eze" }],
      beats: [{ act: 2, title: "x", summary: "s", approx_minute: 50 }, { act: 1, title: "y", summary: "s", approx_minute: 0 }, { act: 3, title: "z", summary: "s", approx_minute: 140 }],
    });
    const c = Object.fromEntries(checkStoryDevelopment(brief, bad).map((x) => [x.id, x]));
    expect(c.unique_names.ok).toBe(false);
    expect(c.distinct_names.ok).toBe(false);
    expect(c.beats_ordered.ok).toBe(false);
    expect(c.fits_runtime).toMatchObject({ ok: false, evidence: "Last beat at minute 140 of 100" });
  });
});
