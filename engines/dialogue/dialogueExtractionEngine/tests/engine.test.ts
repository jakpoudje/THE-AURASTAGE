import { describe, expect, it } from "vitest";
import { screenplayFormatEngine } from "../../../story/screenplayFormatEngine/engine";
import { sceneBoundaryEngine } from "../../../story/sceneBoundaryEngine/engine";
import { dialogueExtractionEngine } from "../engine";

function run(text: string) {
  const { elements } = screenplayFormatEngine({ source_text: text });
  const { scenes } = sceneBoundaryEngine({ elements });
  return dialogueExtractionEngine({ elements, scenes }).lines;
}

const SCRIPT = `INT. NEWSROOM - MORNING

TUNDE OKAFOR (35) reviews documents.

TUNDE
(quietly)
Someone has to tell the truth.
Even if it costs us.

COLLEAGUE
Are you sure?

EXT. HARBOUR - DAWN

AMARA (V.O.)
You came.
`;

describe("dialogueExtractionEngine", () => {
  const lines = run(SCRIPT);

  it("makes one line per cue block, joining the speech and keeping directions separate", () => {
    expect(lines.map((l) => [l.scene_number, l.ordinal, l.speaker_name])).toEqual([
      [1, 1, "TUNDE"],
      [1, 2, "COLLEAGUE"],
      [2, 1, "AMARA"],
    ]);
    expect(lines[0].text).toBe("Someone has to tell the truth. Even if it costs us.");
    expect(lines[0].parenthetical).toBe("(quietly)");
    expect(lines[2].extensions).toEqual(["V.O."]);
  });

  it("estimates timing from word count (~2.5 words/sec) plus a beat per direction", () => {
    expect(lines[0].word_count).toBe(11);
    expect(lines[0].estimated_seconds).toBe(4.9);
    expect(lines[2].estimated_seconds).toBe(0.8);
  });

  it("hashes the words spoken, not their position", () => {
    const moved = run(SCRIPT.replace("COLLEAGUE\nAre you sure?\n\n", ""));
    expect(moved.find((l) => l.speaker_name === "AMARA")!.text_hash).toBe(lines[2].text_hash);
    const edited = run(SCRIPT.replace("You came.", "You finally came."));
    expect(edited[2].text_hash).not.toBe(lines[2].text_hash);
    expect(lines[0].text_hash).toMatch(/^[0-9a-f]{14}$/);
  });

  it("ignores cues with no dialogue and anything outside a scene", () => {
    expect(run("TUNDE\nHello before any scene.\n\nINT. A - DAY\n\nBOB\n\nAction.\n")).toEqual([]);
  });
});
