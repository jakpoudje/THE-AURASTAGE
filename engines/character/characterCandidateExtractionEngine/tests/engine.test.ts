import { describe, expect, it } from "vitest";
import { screenplayFormatEngine } from "../../../story/screenplayFormatEngine/engine";
import { sceneBoundaryEngine } from "../../../story/sceneBoundaryEngine/engine";
import { characterCandidateExtractionEngine } from "../engine";

function run(text: string) {
  const { elements } = screenplayFormatEngine({ source_text: text });
  const { scenes } = sceneBoundaryEngine({ elements });
  return characterCandidateExtractionEngine({ elements, scenes }).candidates;
}

const SCRIPT = `INT. NEWSROOM - MORNING

TUNDE OKAFOR (35), an investigative journalist, reviews documents. His editor, MRS. ADEYEMI (50s), watches.

TUNDE
Someone has to tell the truth.

MRS. ADEYEMI
Then tell it carefully.

EXT. LAGOS HARBOUR - DAWN

AMARA BELLO waits by the water. Tunde approaches.

AMARA
You came.

TUNDE (V.O.)
I always do.

CROWD
Justice!

INT. SAFE HOUSE - NIGHT

BOOM. The door flies open. SUPER: THREE DAYS LATER

AMARA (O.S.)
Tunde? Are you here?
`;

describe("characterCandidateExtractionEngine", () => {
  const c = run(SCRIPT);
  const by = (name: string) => c.find((x) => x.display_name === name)!;

  it("links cue names to their full introduction as one person", () => {
    const tunde = by("Tunde Okafor");
    expect(tunde).toBeTruthy();
    expect(tunde.aliases).toEqual(["Tunde"]);
    expect(tunde.age).toBe("35");
    expect(c.find((x) => x.key === "TUNDE")).toBeUndefined();
  });

  it("uses cues as hard evidence and counts lines", () => {
    const tunde = by("Tunde Okafor");
    expect(tunde.confidence).toBeGreaterThanOrEqual(0.99);
    expect(tunde.needs_confirmation).toBe(false);
    expect(tunde.total_lines).toBe(2);
    // Scene 3 only names him inside dialogue, which is not presence evidence.
    expect(tunde.appearances.map((a) => a.scene_number)).toEqual([1, 2]);
  });

  it("marks V.O./O.S.-only scenes as voice-only unless the character is seen", () => {
    const tunde = by("Tunde Okafor");
    // Scene 2: V.O. cue but also mentioned in action ("Tunde approaches") -> on screen.
    expect(tunde.appearances[1]).toMatchObject({ scene_number: 2, speaking: true, voice_only: false });
    // Scene 3: only named inside dialogue, not in action -> not present on screen, no cue.
    const amara = by("Amara Bello");
    expect(amara.appearances.find((a) => a.scene_number === 3)).toMatchObject({ speaking: true, voice_only: true });
  });

  it("keeps a titled name (MRS. ADEYEMI) as one identity", () => {
    const mrs = by("Mrs. Adeyemi");
    expect(mrs.age).toBe("50s");
    expect(mrs.total_lines).toBe(1);
  });

  it("classifies crowds as group entities, suggested as extras", () => {
    const crowd = by("Crowd");
    expect(crowd.kind).toBe("group");
    expect(crowd.suggested_role).toBe("extra");
  });

  it("never turns sound effects or SUPER text into characters", () => {
    expect(c.map((x) => x.key)).not.toEqual(expect.arrayContaining(["BOOM"]));
    expect(c.find((x) => x.key.includes("THREE DAYS"))).toBeUndefined();
  });

  it("surfaces non-speaking CAPS names for confirmation instead of inserting them", () => {
    const out = run(`INT. ROOM - DAY\n\nDETECTIVE RAMOS searches the room.\n\nTUNDE\nFound anything?\n`);
    const ramos = out.find((x) => x.key === "DETECTIVE RAMOS")!;
    expect(ramos.needs_confirmation).toBe(true);
    expect(ramos.confidence).toBeLessThan(0.8);
    expect(ramos.reason).toMatch(/confirm/);
  });

  it("flags an ambiguous short cue instead of guessing which person it is", () => {
    const out = run(`INT. HOUSE - DAY\n\nFEMI OKAFOR (40) and TUNDE OKAFOR (35) argue.\n\nOKAFOR\nEnough!\n`);
    const okafor = out.find((x) => x.key === "OKAFOR")!;
    expect(okafor).toBeTruthy();
    expect(okafor.reason).toMatch(/could also be/);
  });

  it("suggests leads from line counts and scene share", () => {
    expect(by("Tunde Okafor").suggested_role).toBe("lead");
    expect(by("Amara Bello").suggested_role).toBe("lead");
    expect(by("Mrs. Adeyemi").suggested_role).toBe("minor");
  });

  it("is deterministic", () => {
    expect(run(SCRIPT)).toEqual(c);
  });
});

describe("lead suggestion (regression: a one-line side character was labelled lead)", () => {
  it("does not make a minor speaker a lead just because the script is short", () => {
    const out = run(`INT. NEWSROOM - DAY

TUNDE OKAFOR (35) works.

TUNDE
One.

TUNDE
Two.

EXT. HARBOUR - DAWN

AMARA BELLO (32) waits.

AMARA
You came.

DET. RAMOS
They're meeting.

TUNDE
Three.
`);
    const role = (k: string) => out.find((c) => c.key === k)!.suggested_role;
    expect(role("TUNDE OKAFOR")).toBe("lead");
    expect(role("DET RAMOS")).not.toBe("lead");
  });

  it("treats two equally prominent speakers as a two-hander (both leads)", () => {
    const out = run(`INT. A - DAY\n\nAMARA BELLO (32) waits.\n\nAMARA\nHi.\n\nDET. RAMOS\nHi.\n`);
    expect(out.filter((c) => c.suggested_role === "lead").map((c) => c.key).sort()).toEqual(["AMARA BELLO", "DET RAMOS"]);
  });
});
