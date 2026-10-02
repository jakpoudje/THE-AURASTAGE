// AuraStage recorded sound (native, free): real field recordings for ambience, effects and Foley (owner request
// 2026-10-02: "real life prop sounds"). The library is built at image build time from Wikimedia Commons — public domain
// and CC0 recordings only, each file's own licence checked (apps/api/scripts/sfx-install.mjs → /opt/sfx). For a cue,
// recordedSoundEngine chooses the recordings its words ask for and lays them out; anything the library has no
// recording for is synthesised and mixed in underneath (ambience) or listed (effects), and a cue with no match at all
// is made by the synthesiser — every layer says which it is and, for a recording, its title, author and licence.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { assetEdit, proceduralAudio, recordedSound } from "@aurastage/engines";
import { ProviderError } from "../../types";
import type { AudioAdapter } from "../types";
import { wavSamples } from "../neural/voices";
import { aurastageSynthAdapter } from "../synth/aurastageSynthAdapter";

type Env = Record<string, string | undefined>;
export interface RecordedClip { id: string; category: string; file: string; seconds: number; title: string; author: string; licence: string; source: string; description?: string }
interface Catalogue { source: string; clips: RecordedClip[]; empty?: string[] }

const dir = (env: Env) => env.SFX_DIR || "/opt/sfx";
let cached: { dir: string; cat: Catalogue | null } | null = null;
function catalogue(env: Env): Catalogue | null {
  if (cached?.dir === dir(env)) return cached.cat;
  const f = join(dir(env), "catalogue.json");
  let cat: Catalogue | null = null;
  try {
    if (existsSync(f)) { const c = JSON.parse(readFileSync(f, "utf8")) as Catalogue; cat = c.clips?.length ? c : null; }
  } catch { cat = null; }
  cached = { dir: dir(env), cat };
  return cat;
}
/** Decoded recordings, kept while the process runs (the library is a few tens of MB). */
const samples = new Map<string, Float32Array>();
function load(env: Env, clip: RecordedClip) {
  const key = `${dir(env)}:${clip.id}`;
  let s = samples.get(key);
  if (!s) { s = wavSamples(new Uint8Array(readFileSync(join(dir(env), clip.file)))).samples; samples.set(key, s); }
  return s;
}

export const recordedSoundAdapter: AudioAdapter = {
  id: "aurastage-recorded-sound",
  name: "AuraStage recorded sound library",
  execution: "native",
  kinds: ["ambience", "fx", "foley"],
  models: [{ id: "recorded-1", kinds: ["ambience", "fx", "foley"], label: `Field recordings (public domain / CC0) laid out by recordedSoundEngine ${recordedSound.ENGINE_VERSION}` }],
  isConfigured: (env) => catalogue(env) !== null,
  note: "Real recordings — rain, wind, sea, traffic, crowds, birds, footsteps, doors, knocks, phones, cars, glass and more — from a built-in public-domain library, chosen from the cue's words and laid out to its length. Anything the library doesn't have is synthesised and labelled. Free, on AuraStage's own servers.",
  async generate(req, env) {
    if (req.kind === "voice" || req.kind === "score") throw new ProviderError("The recorded sound library makes ambience, effects and Foley only.");
    const cat = catalogue(env);
    if (!cat) throw new ProviderError("The recorded sound library isn't installed on this server.");
    const kind = req.kind;
    const plan = recordedSound.planRecordedSound({ kind, description: req.description, duration_seconds: req.duration_seconds, seed: req.seed, library: cat.clips.map((c) => ({ id: c.id, category: c.category, seconds: c.seconds })) });
    if (!plan) {
      // Nothing in the cue matches a recording: the synthesiser makes it, and says so.
      const r = await aurastageSynthAdapter.generate(req, env);
      return { ...r, detail: { ...r.detail, recorded: false, note: "No recording in the built-in library matches this cue — synthesised. Edit the cue's words or upload a recording." } };
    }
    const byId = new Map(cat.clips.map((c) => [c.id, c]));
    const src: Record<string, Float32Array> = {};
    for (const l of plan.layers) src[l.clip_id] = load(env, byId.get(l.clip_id)!);
    const out = recordedSound.renderRecordedSound(plan, src, req.duration_seconds, 48000);
    const [L, R] = out.channels;
    const layers = plan.layers.map((l) => {
      const c = byId.get(l.clip_id)!;
      return { name: `${l.label} (recording)`, because: `${l.because} — “${c.title}” by ${c.author}, ${c.licence}, Wikimedia Commons` };
    });
    // Under a background: a quiet synthesised room tone indoors, and synthesised layers for anything the library lacks.
    const under: string[] = [];
    if (kind === "ambience" && (plan.room_tone === "interior" || plan.missing.length)) {
      const words = [plan.room_tone === "interior" ? "interior" : "", ...plan.missing].filter(Boolean).join(", ");
      const syn = proceduralAudio.proceduralAudioEngine({ kind: "ambience", description: words || "room tone", duration_seconds: out.duration_seconds, seed: req.seed });
      const g = Math.pow(10, -14 / 20);
      for (let i = 0; i < L.length && i < syn.channels[0].length; i++) { L[i] += syn.channels[0][i] * g; R[i] += syn.channels[1][i] * g; }
      for (const s of syn.layers) if (!(s.name === "room tone" && plan.room_tone !== "interior")) { under.push(s.name); layers.push({ name: `${s.name} (synthesised)`, because: `${s.because} — no recording in the library` }); }
      let peak = 0;
      for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
      if (peak > 0) { const k = Math.pow(10, -3 / 20) / peak; for (let i = 0; i < L.length; i++) { L[i] *= k; R[i] *= k; } }
    } else if (plan.missing.length) {
      layers.push({ name: "not included", because: `no recording in the library for: ${plan.missing.join(", ")} — upload one or describe it differently` });
    }
    return {
      bytes: assetEdit.encodeWav16(out.sample_rate, [L, R]),
      media_type: "audio/wav",
      duration_seconds: out.duration_seconds,
      sample_rate: out.sample_rate,
      channels: 2,
      detail: {
        layers, engine_version: plan.engine_version, recorded: true, synthesised_under: under,
        recordings: plan.layers.map((l) => { const c = byId.get(l.clip_id)!; return { title: c.title, author: c.author, licence: c.licence, source: c.source }; }),
        credits: "Recordings from Wikimedia Commons (public domain / CC0)",
      },
      provider_request_id: null,
      cost_usd: 0,
    };
  },
};
