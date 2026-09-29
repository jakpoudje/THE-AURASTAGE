import { describe, expect, it } from "vitest";
import { renameCharacter } from "../engine";

const script = `INT. FLAT - NIGHT

AMARA BELLO (30) waits. Amara checks the door. Adaeze's coat hangs there.

AMARA
(quietly)
Where is Tunde? Ask Amara Bello's brother.

AMARA (V.O.)
Too late.

TUNDE
Amara?`;

describe("characterRenameEngine", () => {
  it("renames cues, capitals and title case, whole words only, and the first name alone", () => {
    const r = renameCharacter(script, "Amara Bello", "Ngozi Eze");
    expect(r.text).toContain("NGOZI EZE (30) waits. Ngozi checks the door. Adaeze's coat hangs there.");
    expect(r.text).toContain("\nNGOZI\n(quietly)\nWhere is Tunde? Ask Ngozi Eze's brother.");
    expect(r.text).toContain("\nNGOZI (V.O.)\nToo late.");
    expect(r.text).toContain("TUNDE\nNgozi?");
    expect(r.cues).toBe(2);
    expect(r.mentions).toBe(4); // "AMARA BELLO", "Amara" checks, "Amara Bello's", "Amara?"
  });
  it("never touches a longer name that starts the same; no-op for the same name", () => {
    expect(renameCharacter("ADA and ADAEZE. Ada, Adaeze.", "Ada", "Kemi").text).toBe("KEMI and ADAEZE. Kemi, Adaeze.");
    expect(renameCharacter(script, "Amara", "amara")).toEqual({ text: script, cues: 0, mentions: 0 });
  });
});
