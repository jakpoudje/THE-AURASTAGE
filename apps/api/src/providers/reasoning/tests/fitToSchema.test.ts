import { describe, expect, it } from "vitest";
import { storyDevelopment } from "@aurastage/engines";
import { scriptWriting } from "@aurastage/engines";
import { fitToSchema } from "../fitToSchema";

const good = () => ({
  title_options: ["The Last Ferry"], logline: "An old ferryman must choose between his boat and his son.", synopsis: "S".repeat(60) + ". More.",
  themes: ["duty"], genre: "Drama", tone: "Quiet", setting: "Lagos lagoon", time_period: "Present day",
  characters: [{ name: "Baba Tunde", role: "protagonist", age: 68, name_reasoning: "Yoruba elder.", description: "A ferryman.", want: "Keep the boat.", need: "Let go.", arc: "Lets go." }],
  beats: [1, 2, 3].map((n) => ({ act: n, title: `Beat ${n}`, summary: "Happens.", approx_minute: n })),
  assumptions: [],
});

describe("fitToSchema (regression: live story development refused for a slightly long answer, 2026-09-29)", () => {
  it("fits a story answer that misses the described limits, and reports every change", () => {
    const a: any = good();
    a.characters[0].name_reasoning = "Tunde means 'returns' in Yoruba. ".repeat(20); // ~680 characters, limit 400
    a.characters[0].role = "Protagonist";
    a.themes = ["a", "b", "c", "d", "e", "f", "g"]; // limit 6
    a.beats[1].approx_minute = 2.6;
    a.characters[0].extra = "unexpected";
    const S = storyDevelopment.StoryDevelopmentOutputSchema;
    expect(S.safeParse(a).success).toBe(false);
    const changes: string[] = [];
    const fitted: any = fitToSchema(S as never, a, "", changes);
    expect(S.safeParse(fitted).success).toBe(true);
    expect(fitted.characters[0].name_reasoning.length).toBeLessThanOrEqual(400);
    expect(fitted.characters[0].name_reasoning).toMatch(/Yoruba\.$/); // cut at a sentence, not mid-word
    expect(fitted.characters[0].role).toBe("protagonist");
    expect(fitted.themes).toHaveLength(6);
    expect(fitted.beats[1].approx_minute).toBe(3);
    expect(changes).toEqual(expect.arrayContaining([
      expect.stringMatching(/^characters\[0\]\.name_reasoning: shortened from \d+ to 400 characters$/),
      'characters[0].role: "Protagonist" → "protagonist"', "themes: kept the first 6 of 7 items", "beats[1].approx_minute: 2.6 → 3",
      "characters[0].extra: unexpected field dropped",
    ]));
  });
  it("never cuts long-form text and never invents missing parts", () => {
    const S = scriptWriting.WriteScenesOutputSchema;
    const long = { scenes: [{ number: 1, fountain: "INT. ROOM - DAY\n\n" + "Words. ".repeat(7000) }] };
    expect(S.safeParse(fitToSchema(S as never, long)).success).toBe(false);
    const a: any = good();
    delete a.logline;
    expect(storyDevelopment.StoryDevelopmentOutputSchema.safeParse(fitToSchema(storyDevelopment.StoryDevelopmentOutputSchema as never, a)).success).toBe(false);
  });
  it("cuts at a word with an ellipsis when there's no sentence end, within the limit", () => {
    const S = storyDevelopment.StoryDevelopmentOutputSchema;
    const a: any = good();
    a.tone = "tense ".repeat(40);
    const f: any = fitToSchema(S as never, a);
    expect(f.tone.length).toBeLessThanOrEqual(100);
    expect(f.tone).toMatch(/tense…$/);
  });
});
