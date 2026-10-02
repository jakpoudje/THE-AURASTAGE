// AuraStage natural voice (native, free): Kokoro-82M (Apache-2.0) through kokoro-js (Apache-2.0), on AuraStage's own
// servers — far more natural than the Piper voice it now comes before (owner 2026-10-02: "the platform audios still
// sound robotic"). Clear adult male and female voices, American and British English, each measured at build time;
// the voice is cast from Casting (gender, age band, accent) and Voice DNA (register), and the line's emotion shapes
// pace and energy. Installed by apps/api/scripts/kokoro-install.sh; where it isn't installed this backend reports
// "not configured" and the Piper voice is used instead. The model runs in its own process (scripts/kokoro-say.mjs),
// loaded once and stopped after a few idle minutes, so the server holds its memory only while lines are being spoken.
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { ProviderError } from "../../types";
import type { AudioAdapter } from "../types";
import { prosody } from "../neural/voices";
import { kokoroSpeed, pickKokoroVoice, type KokoroCatalogue } from "./cast";

type Env = Record<string, string | undefined>;
const dir = (env: Env) => env.KOKORO_DIR || "/opt/kokoro";
function catalogue(env: Env): KokoroCatalogue | null {
  const f = join(dir(env), "voices.json");
  if (!existsSync(f) || !existsSync(join(dir(env), "kokoro-say.mjs"))) return null;
  try {
    const c = JSON.parse(readFileSync(f, "utf8")) as KokoroCatalogue;
    return c.voices?.length ? c : null;
  } catch {
    return null;
  }
}

/** The speaker process: started on the first line, reused for the next ones, stopped after IDLE_MS without work. */
const IDLE_MS = 4 * 60_000, LOAD_MS = 120_000, LINE_MS = 90_000;
type Reply = { id: number; ok: boolean; seconds?: number; rate?: number; error?: string };
let proc: { child: ChildProcessWithoutNullStreams; ready: Promise<void>; pending: Map<number, (r: Reply) => void>; idle?: NodeJS.Timeout } | null = null;
let nextId = 1;
function speaker(env: Env) {
  if (proc) return proc;
  const child = spawn(process.execPath, [join(dir(env), "kokoro-say.mjs"), dir(env)], { cwd: dir(env), stdio: ["pipe", "pipe", "pipe"] });
  const pending = new Map<number, (r: Reply) => void>();
  const err: string[] = [];
  let onReady: () => void = () => {}, onFail: (e: Error) => void = () => {};
  const ready = new Promise<void>((res, rej) => { onReady = res; onFail = rej; });
  const t = setTimeout(() => (onFail(new ProviderError("The natural voice took too long to start.", null, true)), child.kill("SIGKILL")), LOAD_MS);
  createInterface({ input: child.stdout }).on("line", (l) => {
    let m: (Reply & { ready?: boolean }) | null = null;
    try { m = JSON.parse(l); } catch { return; }
    if (m?.ready) { clearTimeout(t); onReady(); return; }
    if (m && typeof m.id === "number") { pending.get(m.id)?.(m); pending.delete(m.id); }
  });
  child.stderr.on("data", (d) => { err.push(String(d)); if (err.length > 20) err.shift(); });
  const p = { child, ready, pending, idle: undefined as NodeJS.Timeout | undefined };
  child.on("close", () => {
    clearTimeout(t);
    const why = err.join("").trim().split("\n").pop()?.slice(0, 200) || "it stopped";
    onFail(new ProviderError(`The natural voice couldn't start: ${why}`));
    for (const [, r] of pending) r({ id: 0, ok: false, error: `the voice process stopped (${why})` });
    pending.clear();
    if (proc === p) proc = null;
  });
  child.on("error", (e) => onFail(new ProviderError(`The natural voice couldn't start: ${e.message}`)));
  proc = p;
  return p;
}
async function speak(env: Env, text: string, voice: string, speed: number, out: string): Promise<Reply> {
  const p = speaker(env);
  if (p.idle) clearTimeout(p.idle);
  await p.ready;
  const id = nextId++;
  try {
    return await new Promise<Reply>((resolve, reject) => {
      const t = setTimeout(() => (p.pending.delete(id), reject(new ProviderError("The natural voice took too long.", null, true))), LINE_MS);
      p.pending.set(id, (r) => (clearTimeout(t), resolve(r)));
      // JSON on stdin (no shell): the line can't be interpreted as a command.
      p.child.stdin.write(JSON.stringify({ id, text, voice, speed, out }) + "\n");
    });
  } finally {
    if (proc === p && !p.pending.size) p.idle = setTimeout(() => p.child.stdin.end(), IDLE_MS);
  }
}

/** Scales 16-bit PCM in place (clipped) — the line's energy. */
function applyGain(wav: Buffer, gain: number) {
  if (gain === 1) return wav;
  for (let i = 44; i + 1 < wav.length; i += 2) wav.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(wav.readInt16LE(i) * gain))), i);
  return wav;
}

interface Dna { language: string; gender: "female" | "male" | "unspecified"; pitch: number; speed: number; amplitude: number; description: string; age_band?: "child" | "young" | "adult" | "elder"; why?: string[] }

export const kokoroVoiceAdapter: AudioAdapter = {
  id: "aurastage-kokoro-voice",
  name: "AuraStage natural voice",
  execution: "native",
  kinds: ["voice"],
  models: [{ id: "kokoro-82m", kinds: ["voice"], label: "Built-in natural speech (Kokoro-82M; American and British English)" }],
  note: "Speaks each line in a natural voice cast from the character (gender, age, accent, register — each voice measured), with the line's emotion shaping pace and energy — on AuraStage's own servers, free. No child voices and no African or Caribbean accents in the free model: a paid voice provider adds those, plus acting range and cloning.",
  isConfigured: (env) => catalogue(env) !== null,
  async generate(req, env) {
    if (req.kind !== "voice") throw new ProviderError("The natural voice only speaks dialogue.");
    const cat = catalogue(env);
    if (!cat) throw new ProviderError("The natural voice isn't installed on this server.");
    const line = req.params.voice as Dna | undefined, base = (req.params.voice_base as Dna | undefined) ?? line;
    if (!line || !base) throw new ProviderError("No Voice DNA for this line.");
    const text = req.description.replace(/\s+/g, " ").trim().slice(0, 1000);
    if (!text) throw new ProviderError("Nothing to say.");
    const pick = pickKokoroVoice(cat, base, String(req.params.character_name ?? base.description), typeof req.params.accent === "string" ? req.params.accent : null);
    if (!pick) throw new ProviderError("No natural voice matches this character.");
    const speed = kokoroSpeed(line, pick), gain = prosody(line).gain;
    const tmp = mkdtempSync(join(tmpdir(), "aura-kokoro-"));
    const out = join(tmp, "line.wav");
    try {
      const r = await speak(env, text, pick.voice, speed, out);
      if (!r.ok || !existsSync(out)) throw new ProviderError(`The natural voice failed: ${r.error ?? "no audio"}`);
      const wav = applyGain(readFileSync(out), gain);
      if (wav.toString("ascii", 0, 4) !== "RIFF") throw new ProviderError("The natural voice didn't return a WAV file.");
      const rate = wav.readUInt32LE(24);
      return {
        bytes: new Uint8Array(wav), media_type: "audio/wav", duration_seconds: Math.round(((wav.length - 44) / (rate * 2)) * 1000) / 1000, sample_rate: rate, channels: 1,
        detail: {
          layers: [{ name: `Voice: ${line.description}`, because: [pick.reason, ...(line.why ?? [])].join("; ") }],
          voice: { model: "kokoro-82m", voice: pick.voice, name: pick.name, measured_f0: pick.f0, accent: pick.accent, why: pick.reason, speed, gain },
          credits: "Voice: Kokoro-82M (Apache-2.0)",
        },
        provider_request_id: null, cost_usd: 0,
      };
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  },
};
