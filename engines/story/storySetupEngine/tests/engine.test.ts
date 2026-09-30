import { describe, expect, it } from "vitest";
import { ProjectSettingsSchema } from "@aurastage/contracts";
import { storySetupEngine } from "../engine";

describe("storySetupEngine", () => {
  it("reads genre, tone, setting, period and a logline from the script; settings follow the story", () => {
    const out = storySetupEngine({
      headings: ["EXT. LAGOS POLLING UNIT - NIGHT", "INT. INEC COLLATION CENTRE, ABUJA - DAY", "EXT. SURULERE STREET - NIGHT"],
      action: ["The ballot is held up to the light. Party agents watch the vote count.", "The result sheet is signed in 2023. Every vote is counted.", "Lagos traffic crawls."],
      emotions: ["determination", "tension", "tension", "joy", "neutral"],
      leads: [{ name: "Tomiwa Oyelaran", occupation: "Corps member", motivation: "Wants to protect the result sheet." }],
      year_now: 2026,
    });
    expect(out.story).toMatchObject({ genre: "Political thriller", tone: "Tense and Defiant", setting: "Lagos, Nigeria", time_period: "2023" });
    expect(out.story.logline).toBe("Tomiwa Oyelaran, corps member, fights to protect the result sheet in Lagos, Nigeria.");
    expect(out.settings).toMatchObject({ country: "Nigeria", year: 2026 });
    expect(ProjectSettingsSchema.shape.style.safeParse({ look: out.settings.look, palette: out.settings.palette }).success).toBe(true);
    for (const k of ["genre", "tone", "setting", "time_period", "logline", "look"]) expect(out.evidence[k]).toBeTruthy();
  });
  it("with no signal it says Drama / Present day and never invents a place or logline", () => {
    const out = storySetupEngine({ action: ["A room. Someone waits."], year_now: 2026 });
    expect(out.story).toEqual({ genre: "Drama", time_period: "Present day" });
    expect(out.settings.country).toBeUndefined();
  });
});
