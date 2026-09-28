import { describe, expect, it } from "vitest";
import { aurastageSynthAdapter, audioBackendsFor, audioStatuses } from "..";

describe("AuraStage built-in sound", () => {
  it("makes a real stereo WAV for a cue and reports its layers", async () => {
    const r = await aurastageSynthAdapter.generate({ kind: "ambience", model: "synth-1", description: "Exterior harbour ambience — rain", duration_seconds: 1, mood: [], seed: 3, params: {} }, {});
    expect(Buffer.from(r.bytes.slice(0, 4)).toString()).toBe("RIFF");
    expect(r.bytes.length).toBe(44 + 48000 * 2 * 2);
    expect(r).toMatchObject({ media_type: "audio/wav", sample_rate: 48000, channels: 2, cost_usd: 0 });
    expect((r.detail.layers as { name: string }[]).map((l) => l.name)).toContain("rain");
  });
  it("never claims to make voices; routing only offers backends that can", async () => {
    await expect(aurastageSynthAdapter.generate({ kind: "voice", model: "synth-1", description: "hello", duration_seconds: 1, mood: [], seed: 1, params: {} }, {})).rejects.toThrow(/doesn't make voices/);
    expect(audioBackendsFor("score", {}).map((a) => a.id)).toEqual(["aurastage-synth"]);
    expect(audioBackendsFor("voice", {})).toEqual([]);
    expect(audioStatuses({})[0]).toMatchObject({ id: "aurastage-synth", execution: "native", state: "configured" });
  });
});
