import { describe, expect, it } from "vitest";
import { dialoguePerformanceEngine } from "../engine";
import { LineReadSchema } from "../schema";

const L = (id: string, speaker: string, text: string, parenthetical: string | null = null) => ({ id, speaker, text, parenthetical, character_id: null });

describe("dialoguePerformanceEngine", () => {
  it("reads every line: emotion, intensity, intention, subtext and delivery, each with its evidence", () => {
    const { lines } = dialoguePerformanceEngine({
      scene: { mood: ["tense"] },
      lines: [
        L("1", "AMARA", "Where were you last night?"),
        L("2", "TUNDE", "Nowhere."),
        L("3", "AMARA", "Don't lie to me!", "angrily"),
        L("4", "TUNDE", "I'm fine. Forget it."),
        L("5", "AMARA", "We will count every vote. I promise."),
        L("6", "TUNDE", "The generator is running."),
      ],
    });
    expect(lines).toHaveLength(6);
    for (const l of lines) expect(LineReadSchema.safeParse(l).success).toBe(true);
    expect(lines[0]).toMatchObject({ intention: "Find out if they're safe" });
    expect(lines[1].subtext).toMatch(/answers "Where were you last night\?" as briefly as possible/);
    expect(lines[2]).toMatchObject({ emotion: "anger" });
    expect(lines[2].intensity).toBeGreaterThanOrEqual(8);
    expect(lines[2].evidence).toMatch(/angrily/);
    expect(lines[3]).toMatchObject({ intention: "Deflect and conceal" });
    expect(lines[4]).toMatchObject({ emotion: "determination", intention: "Reassure and commit" });
    // A plain line with no signal takes the scene's mood.
    expect(lines[5]).toMatchObject({ emotion: "tension" });
    expect(lines[5].evidence).toMatch(/mood/);
  });

  it("is deterministic and respects the contract limits", () => {
    const input = { lines: [L("a", "X", "Hello there. ".repeat(300))] };
    expect(dialoguePerformanceEngine(input)).toEqual(dialoguePerformanceEngine(input));
    expect(LineReadSchema.safeParse(dialoguePerformanceEngine(input).lines[0]).success).toBe(true);
  });
});
