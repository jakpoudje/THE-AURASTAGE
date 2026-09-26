import { describe, expect, it } from "vitest";
import { deriveScenes, parseScreenplay, PARSER_VERSION, SCENE_ENGINE_VERSION } from "../screenplay.derive";

const SCRIPT = `INT. TUNDE'S APARTMENT - NIGHT

Rain lashes the window. TUNDE OKAFOR (35) types furiously.

TUNDE
(to himself)
They buried it. But not deep enough.

EXT. LAGOS HARBOUR - DAWN

AMARA BELLO waits by the water.

AMARA
You came.

TUNDE
I always do.
`;

describe("screenplay derivation", () => {
  it("parses and splits into scenes with speakers taken from the text", () => {
    const { scenes, analysis } = deriveScenes(parseScreenplay(SCRIPT));
    expect(scenes).toHaveLength(2);
    expect(scenes[0]).toMatchObject({ number: 1, int_ext: "INT", location: "TUNDE'S APARTMENT", time_of_day: "NIGHT" });
    expect(scenes[0].speaking_characters).toEqual(["TUNDE"]);
    expect(scenes[1].speaking_characters.sort()).toEqual(["AMARA", "TUNDE"]);
    expect(analysis.scene_count).toBe(2);
  });

  it("gives each scene a stable content hash", () => {
    const a = deriveScenes(parseScreenplay(SCRIPT)).scenes;
    const b = deriveScenes(parseScreenplay(SCRIPT)).scenes;
    expect(a.map((s) => s.content_hash)).toEqual(b.map((s) => s.content_hash));
    expect(a[0].content_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a[0].content_hash).not.toBe(a[1].content_hash);
  });

  it("changes only the edited scene's hash (drives REVIEW_REQUIRED, CLAUDE.md rule 11)", () => {
    const before = deriveScenes(parseScreenplay(SCRIPT)).scenes;
    const after = deriveScenes(parseScreenplay(SCRIPT.replace("I always do.", "I never left."))).scenes;
    expect(after[0].content_hash).toBe(before[0].content_hash);
    expect(after[1].content_hash).not.toBe(before[1].content_hash);
  });

  it("returns no scenes for text without headings (approval must refuse it)", () => {
    expect(deriveScenes(parseScreenplay("Just some notes about the story.")).scenes).toHaveLength(0);
  });

  it("records exact engine versions for version-aware writes (CLAUDE.md rule 10)", () => {
    expect(PARSER_VERSION).toMatch(/^story\.screenplayFormatEngine@\d+\.\d+\.\d+$/);
    expect(SCENE_ENGINE_VERSION).toMatch(/^story\.sceneBoundaryEngine@\d+\.\d+\.\d+$/);
  });
});
