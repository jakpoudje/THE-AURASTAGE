import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { voiceCasting } from "@aurastage/engines";
import { aurastageVoiceAdapter, audioBackendsFor } from "..";
import { fixWavHeader } from "../voice/aurastageVoiceAdapter";

const installed = existsSync("/usr/bin/espeak-ng") || existsSync("/usr/local/bin/espeak-ng");
const voice = voiceCasting.voiceCastingEngine({ character: { name: "Amara Bello", age: "32", gender: "Woman" }, line: { emotion: "anger", intensity: 8 } });

describe("AuraStage built-in voice", () => {
  it("fixes espeak's streaming WAV header so every player reads the real length", () => {
    const b = Buffer.alloc(44 + 100);
    b.write("RIFF", 0); b.writeUInt32LE(0x7fffffff, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16); b.write("data", 36); b.writeUInt32LE(0x7fffffff, 40);
    const f = fixWavHeader(b);
    expect([f.readUInt32LE(4), f.readUInt32LE(40)]).toEqual([136, 100]);
    expect(() => fixWavHeader(Buffer.from("not a wav file at all, definitely not"))).toThrow(/didn't return a WAV/);
  });
  it.skipIf(!installed)("speaks a line in the character's Voice DNA as a real WAV (text passed safely, no shell)", async () => {
    const r = await aurastageVoiceAdapter.generate({ kind: "voice", model: "espeak-ng", description: "You came. $(rm -rf /) `whoami`", duration_seconds: 2, mood: [], seed: 1, params: { voice } }, {});
    expect(Buffer.from(r.bytes.slice(0, 4)).toString()).toBe("RIFF");
    expect(r.duration_seconds).toBeGreaterThan(0.5);
    expect(Buffer.from(r.bytes).readUInt32LE(40)).toBe(r.bytes.length - 44);
    expect((r.detail.layers as { name: string }[])[0].name).toMatch(/^Voice: Adult female voice/);
    expect(audioBackendsFor("voice", {}).map((a) => a.id)).toEqual(["aurastage-voice"]);
  });
  it("refuses without Voice DNA or for non-dialogue", async () => {
    await expect(aurastageVoiceAdapter.generate({ kind: "fx", model: "espeak-ng", description: "x", duration_seconds: 1, mood: [], seed: 1, params: {} }, {})).rejects.toThrow(/only speaks dialogue/);
    if (installed) await expect(aurastageVoiceAdapter.generate({ kind: "voice", model: "espeak-ng", description: "x", duration_seconds: 1, mood: [], seed: 1, params: {} }, {})).rejects.toThrow(/No Voice DNA/);
  });
});
