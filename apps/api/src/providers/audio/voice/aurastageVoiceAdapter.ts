// AuraStage built-in voice (native, free): speaks a dialogue line with espeak-ng using the Voice DNA parameters
// (voiceCastingEngine). Robotic by design — for timing, rhythm and testing the pipeline — and labelled as such; never
// presented as a performance or as AI. Available only where the espeak-ng program is installed (API + worker images).
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { ProviderError } from "../../types";
import type { AudioAdapter } from "../types";

const BIN = ["/usr/bin/espeak-ng", "/usr/local/bin/espeak-ng"];
const bin = () => BIN.find((p) => existsSync(p)) ?? null;

export interface VoiceParams { voice_id: string; pitch: number; speed: number; amplitude: number; description: string; why?: string[] }

/** espeak writes a streaming WAV header (sizes 0x7fffffff); fix RIFF and data sizes so every player reads it. */
export function fixWavHeader(b: Buffer): Buffer {
  if (b.length < 44 || b.toString("ascii", 0, 4) !== "RIFF") throw new ProviderError("The voice engine didn't return a WAV file.");
  const out = Buffer.from(b);
  out.writeUInt32LE(out.length - 8, 4);
  // Find the "data" chunk (usually at 36) and set its size to what actually follows.
  let o = 12;
  while (o + 8 <= out.length) {
    const id = out.toString("ascii", o, o + 4);
    if (id === "data") { out.writeUInt32LE(out.length - o - 8, o + 4); break; }
    o += 8 + out.readUInt32LE(o + 4);
  }
  return out;
}

export const aurastageVoiceAdapter: AudioAdapter = {
  id: "aurastage-voice",
  name: "AuraStage built-in voice",
  execution: "native",
  kinds: ["voice"],
  models: [{ id: "espeak-ng", kinds: ["voice"], label: "Built-in speech (espeak-ng, robotic)" }],
  note: "Speaks each line in the character's Voice DNA (type, pitch, pace, emotion) on AuraStage's own servers — free and robotic. Good for timing and testing; replace with a recording or a voice provider for the film.",
  isConfigured: () => bin() !== null,
  async generate(req) {
    if (req.kind !== "voice") throw new ProviderError("The built-in voice only speaks dialogue.");
    const b = bin();
    if (!b) throw new ProviderError("The built-in voice isn't installed on this server.");
    const v = req.params.voice as VoiceParams | undefined;
    if (!v?.voice_id) throw new ProviderError("No Voice DNA for this line.");
    const text = req.description.replace(/\s+/g, " ").trim().slice(0, 1000);
    if (!text) throw new ProviderError("Nothing to say.");
    // Arguments are passed as an array (no shell), so the line's text can't be interpreted as a command.
    const args = ["-v", String(v.voice_id).replace(/[^a-z0-9+\-_]/gi, ""), "-p", String(Math.round(v.pitch)), "-s", String(Math.round(v.speed)), "-a", String(Math.round(v.amplitude)), "--stdout", "--", text];
    const wav = await new Promise<Buffer>((resolve, reject) => {
      const p = spawn(b, args, { stdio: ["ignore", "pipe", "pipe"] });
      const out: Buffer[] = [], err: Buffer[] = [];
      const t = setTimeout(() => (p.kill("SIGKILL"), reject(new ProviderError("The built-in voice took too long.", null, true))), 20000);
      p.stdout.on("data", (d) => out.push(d));
      p.stderr.on("data", (d) => err.push(d));
      p.on("error", (e) => (clearTimeout(t), reject(new ProviderError(`The built-in voice couldn't start: ${e.message}`))));
      p.on("close", (code) => (clearTimeout(t), code === 0 ? resolve(Buffer.concat(out)) : reject(new ProviderError(`The built-in voice failed: ${Buffer.concat(err).toString().slice(0, 200)}`))));
    });
    const fixed = fixWavHeader(wav);
    const rate = fixed.readUInt32LE(24), channels = fixed.readUInt16LE(22), bytesPerSample = fixed.readUInt16LE(34) / 8;
    const duration = (fixed.length - 44) / (rate * channels * bytesPerSample);
    return {
      bytes: new Uint8Array(fixed), media_type: "audio/wav", duration_seconds: Math.round(duration * 1000) / 1000, sample_rate: rate, channels,
      detail: { layers: [{ name: `Voice: ${v.description}`, because: (v.why ?? []).join("; ") || "Voice DNA" }], voice: { voice_id: v.voice_id, pitch: v.pitch, speed: v.speed, amplitude: v.amplitude } },
      provider_request_id: null, cost_usd: 0,
    };
  },
};
