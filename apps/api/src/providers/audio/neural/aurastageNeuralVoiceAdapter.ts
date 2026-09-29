// AuraStage neural voice (native, free): speaks a dialogue line with Piper, an open neural text-to-speech engine
// (MIT), using multi-speaker voice models trained on the VCTK (British Isles accents) and LibriTTS-R (American English)
// corpora — both CC BY 4.0, credited in docs. Natural-sounding, runs on AuraStage's own servers, costs nothing.
// The speaker is matched to the character's Voice DNA by MEASURED pitch (voices.ts); the line's emotion shapes pace
// and energy. Installed in the API and generation-worker images by apps/api/scripts/piper-install.sh; where it isn't
// installed this backend reports "not configured" and the older built-in voice is used instead.
import { spawn } from "node:child_process";
import { existsSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProviderError } from "../../types";
import type { AudioAdapter } from "../types";
import { pickSpeaker, prosody, type VoiceCatalogue } from "./voices";

const dir = (env: Record<string, string | undefined>) => env.PIPER_DIR || "/opt/piper";
function catalogue(env: Record<string, string | undefined>): VoiceCatalogue | null {
  const f = join(dir(env), "voices", "speakers.json");
  if (!existsSync(join(dir(env), "piper")) || !existsSync(f)) return null;
  try {
    const c = JSON.parse(readFileSync(f, "utf8")) as VoiceCatalogue;
    return c.speakers?.length ? c : null;
  } catch {
    return null;
  }
}

/** Scales 16-bit PCM in place (clipped) — the line's energy. */
function applyGain(wav: Buffer, gain: number) {
  if (gain === 1) return wav;
  let o = 12;
  while (o + 8 <= wav.length) {
    const id = wav.toString("ascii", o, o + 4), size = wav.readUInt32LE(o + 4);
    if (id === "data") {
      for (let i = o + 8; i + 1 < Math.min(wav.length, o + 8 + size); i += 2) wav.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(wav.readInt16LE(i) * gain))), i);
      break;
    }
    o += 8 + size;
  }
  return wav;
}

interface Dna { language: string; gender: "female" | "male" | "unspecified"; pitch: number; speed: number; amplitude: number; description: string; why?: string[] }

export const aurastageNeuralVoiceAdapter: AudioAdapter = {
  id: "aurastage-neural-voice",
  name: "AuraStage neural voice",
  execution: "native",
  kinds: ["voice"],
  models: [{ id: "piper-1", kinds: ["voice"], label: "Built-in neural speech (Piper; VCTK + LibriTTS-R voices)" }],
  note: "Speaks each line in a natural neural voice chosen to match the character's Voice DNA (measured register, accent), with the line's emotion shaping pace and energy — on AuraStage's own servers, free. A paid voice provider adds acting range and cloning.",
  isConfigured: (env) => catalogue(env) !== null,
  async generate(req, env) {
    if (req.kind !== "voice") throw new ProviderError("The neural voice only speaks dialogue.");
    const cat = catalogue(env);
    if (!cat) throw new ProviderError("The neural voice isn't installed on this server.");
    const line = req.params.voice as Dna | undefined, base = (req.params.voice_base as Dna | undefined) ?? line;
    if (!line || !base) throw new ProviderError("No Voice DNA for this line.");
    const text = req.description.replace(/\s+/g, " ").trim().slice(0, 1000);
    if (!text) throw new ProviderError("Nothing to say.");
    const pick = pickSpeaker(cat, base, String(req.params.character_name ?? base.description));
    if (!pick) throw new ProviderError("No neural voice matches this character.");
    const p = prosody(line);
    const tmp = mkdtempSync(join(tmpdir(), "aura-voice-"));
    const out = join(tmp, "line.wav");
    try {
      // Arguments as an array and the text on stdin (no shell): the line can't be interpreted as a command.
      const args = ["--model", join(dir(env), "voices", `${pick.model}.onnx`), "--speaker", String(pick.speaker), "--length_scale", String(p.length_scale),
        "--noise_scale", String(p.noise_scale), "--noise_w", "0.8", "--sentence_silence", "0.25", "--output_file", out, "--quiet"];
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(join(dir(env), "piper"), args, { stdio: ["pipe", "ignore", "pipe"] });
        const err: Buffer[] = [];
        const t = setTimeout(() => (proc.kill("SIGKILL"), reject(new ProviderError("The neural voice took too long.", null, true))), 60000);
        proc.stderr.on("data", (d) => err.push(d));
        proc.on("error", (e) => (clearTimeout(t), reject(new ProviderError(`The neural voice couldn't start: ${e.message}`))));
        proc.on("close", (code) => (clearTimeout(t), code === 0 && existsSync(out) ? resolve() : reject(new ProviderError(`The neural voice failed: ${Buffer.concat(err).toString().slice(-300)}`))));
        proc.stdin.end(text + "\n");
      });
      const wav = applyGain(readFileSync(out), p.gain);
      if (wav.toString("ascii", 0, 4) !== "RIFF") throw new ProviderError("The neural voice didn't return a WAV file.");
      const rate = wav.readUInt32LE(24), channels = wav.readUInt16LE(22);
      return {
        bytes: new Uint8Array(wav), media_type: "audio/wav", duration_seconds: Math.round(((wav.length - 44) / (rate * channels * 2)) * 1000) / 1000, sample_rate: rate, channels,
        detail: {
          layers: [{ name: `Voice: ${line.description}`, because: [pick.reason, ...(line.why ?? [])].join("; ") }],
          voice: { model: pick.model, speaker: pick.speaker, measured_f0: pick.f0, length_scale: p.length_scale, noise_scale: p.noise_scale, gain: p.gain },
          credits: pick.model.startsWith("en_US") ? "Voice model trained on LibriTTS-R (CC BY 4.0)" : "Voice model trained on VCTK (CC BY 4.0)",
        },
        provider_request_id: null, cost_usd: 0,
      };
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  },
};
