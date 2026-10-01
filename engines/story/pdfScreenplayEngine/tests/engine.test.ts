import { describe, expect, it } from "vitest";
import { pdfScreenplayEngine } from "../engine";
import { screenplayFormatEngine } from "../../screenplayFormatEngine";

// A standard US letter screenplay page: margin 108pt (1.5"), dialogue 180pt, parenthetical 223pt, cue 266pt, transition 460pt.
const page = (rows: [number, string][], top = 720) => ({ width: 612, height: 792, items: rows.map(([x, text], i) => ({ x, y: top - i * 12, text })) });

describe("pdfScreenplayEngine", () => {
  it("rebuilds headings, action, cues, parentheticals, dialogue and transitions from their indents; joins wrapped lines; drops page furniture", () => {
    const out = pdfScreenplayEngine({ pages: [
      page([[520, "1."], [108, "INT. NEWSROOM - NIGHT"], [108, "Rain against the glass. AMARA (32) types, fast,"], [108, "furious."], [266, "AMARA"], [223, "(not looking up)"], [180, "They buried it. Every word"], [180, "of it."], [266, "(MORE)"]]),
      page([[520, "2."], [266, "AMARA (CONT'D)"], [180, "But not this time."], [460, "CUT TO:"], [108, "EXT. HARBOUR - DAWN"], [108, "Tunde waits."]]),
    ] });
    expect(out.source_text).toBe([
      "INT. NEWSROOM - NIGHT", "", "Rain against the glass. AMARA (32) types, fast, furious.", "", "AMARA", "(not looking up)", "They buried it. Every word of it. But not this time.",
      "", "> CUT TO:", "", "EXT. HARBOUR - DAWN", "", "Tunde waits.", "",
    ].join("\n"));
    expect(out.counts).toMatchObject({ heading: 2, character: 1, parenthetical: 1, transition: 1, continued: 1 });
    expect(out.warnings).toEqual([]);
    // The speech carried over the page break ((MORE) / CONT'D) is one speech again.
    // It parses as a screenplay: two scenes, one speaker.
    const parsed = screenplayFormatEngine({ source_text: out.source_text });
    expect(parsed.elements.filter((e) => e.type === "scene_heading")).toHaveLength(2);
    expect(parsed.elements.filter((e) => e.type === "character").map((e) => e.speaker)).toEqual(["AMARA"]);
  });

  it("says plainly when the PDF isn't laid out as a screenplay — and keeps everything", () => {
    const out = pdfScreenplayEngine({ pages: [page([[72, "Chapter One"], [72, "It was a dark night."]])] });
    expect(out.warnings.join(" ")).toMatch(/No scene headings/);
    expect(out.source_text).toContain("It was a dark night.");
  });
});
