import { describe, expect, it } from "vitest";
import { dialogueVoiceprintEngine } from "../engine";

const L = (speaker: string, text: string, scene = 1, ordinal = 1) => ({ speaker_key: speaker, speaker_name: speaker, text, scene_number: scene, ordinal });

describe("dialogueVoiceprintEngine", () => {
  const { voiceprints } = dialogueVoiceprintEngine({
    lines: [
      L("TUNDE", "The truth will come out. The truth always does.", 1),
      L("TUNDE", "Do you know what the truth costs?", 2),
      L("TUNDE", "I told you, the truth will come out eventually.", 3),
      L("TUNDE", "Trust me, the truth will come out.", 4),
      L("AMARA", "You came!", 2),
      L("AMARA", "Why now? Why here?", 3),
    ],
  });
  const tunde = voiceprints.find((v) => v.speaker_key === "TUNDE")!;
  const amara = voiceprints.find((v) => v.speaker_key === "AMARA")!;

  it("measures how each character speaks", () => {
    expect(tunde.lines).toBe(4);
    expect(tunde.question_rate).toBe(0.25);
    expect(amara.exclamation_rate).toBe(0.5);
    expect(amara.question_rate).toBe(0.5);
    expect(tunde.avg_words_per_line).toBeGreaterThan(amara.avg_words_per_line);
  });

  it("finds words a character uses more than everyone else", () => {
    expect(tunde.distinctive_words[0]).toBe("truth");
  });

  it("flags phrasing a character repeats (with the scenes it appears in)", () => {
    expect(tunde.repeated_phrases[0]).toEqual({ phrase: "the truth will", count: 3, scenes: [1, 3, 4] });
    expect(amara.repeated_phrases).toEqual([]);
  });

  it("orders speakers by number of lines and is deterministic", () => {
    expect(voiceprints.map((v) => v.speaker_key)).toEqual(["TUNDE", "AMARA"]);
  });
});
