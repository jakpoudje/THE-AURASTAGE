import { describe, expect, it } from "vitest";
import { dialogueBalanceEngine } from "../engine";

const L = (scene: number, ordinal: number, speaker: string, words: number) => ({
  scene_number: scene, ordinal, speaker_key: speaker, speaker_name: speaker, word_count: words, estimated_seconds: words / 2.5,
});

describe("dialogueBalanceEngine", () => {
  it("computes each speaker's share of a scene", () => {
    const { scenes } = dialogueBalanceEngine({ lines: [L(1, 1, "A", 30), L(1, 2, "B", 10)] });
    expect(scenes[0]).toMatchObject({ scene_number: 1, lines: 2, words: 40, dialogue_seconds: 16 });
    expect(scenes[0].speakers.map((s) => [s.speaker_key, s.share])).toEqual([["A", 0.75], ["B", 0.25]]);
    expect(scenes[0].flags).toEqual([]);
  });

  it("flags a dominant speaker only when there is enough dialogue to judge", () => {
    const busy = [1, 2, 3, 4, 5].map((o) => L(2, o, "A", 20)).concat([L(2, 6, "B", 5)]);
    expect(dialogueBalanceEngine({ lines: busy }).scenes[0].flags.map((f) => f.kind)).toEqual(["dominant_speaker"]);
    const short = [L(3, 1, "A", 40), L(3, 2, "B", 2)];
    expect(dialogueBalanceEngine({ lines: short }).scenes[0].flags).toEqual([]);
  });

  it("flags long speeches with the line number", () => {
    const f = dialogueBalanceEngine({ lines: [L(1, 1, "A", 80), L(1, 2, "B", 5)] }).scenes[0].flags;
    expect(f).toEqual([{ kind: "long_speech", ordinal: 1, message: "A's line 1 is 80 words long." }]);
  });

  it("notes scenes where only one character speaks", () => {
    const f = dialogueBalanceEngine({ lines: [L(4, 1, "A", 5), L(4, 2, "A", 5)] }).scenes[0].flags;
    expect(f.map((x) => x.kind)).toEqual(["single_speaker"]);
  });
});
