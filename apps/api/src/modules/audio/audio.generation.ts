// Audio Studio — generate sound for planned cues (migration 0026). The backend comes from the Provider Gateway's audio
// side: only backends that can make that kind of sound AND are configured on this server are offered (never a guess).
// Generated files land in the Assets Library linked to the scene; using one on a cue is the person's choice (rule 11).
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { proceduralAudio, voiceCasting } from "@aurastage/engines";
import { audioBackendsFor, audioStatuses, getAudioAdapter, type AudioKind } from "../../providers";
import { assertProjectAccess, assertSceneInProject } from "./audio.permissions";
import * as repo from "./audio.repository";
import { AudioNotReadyError, AudioValidationError } from "./audio.validator";

type Env = Record<string, string | undefined>;
type Row = Record<string, any>;

/** Which kind of sound a planned cue on a track of this family is. */
export const FAMILY_KIND: Partial<Record<string, AudioKind>> = { BG: "ambience", WALLA: "ambience", FX: "fx", FOLEY: "foley", SCORE: "score", MX: "score", DX: "voice", VO: "voice", ADR: "voice" };

const GenerateInput = z.object({
  clip_id: z.string().uuid().nullable().default(null),
  /** For voice: the dialogue line to speak (defaults to the cue's line). */
  line_id: z.string().uuid().optional(),
  kind: z.enum(["ambience", "fx", "foley", "score", "voice"]),
  description: z.string().trim().max(500).default(""),
  duration_seconds: z.number().min(0.2).max(300),
  mood: z.array(z.string().trim().min(1).max(40)).max(8).default([]),
  provider: z.string().max(60).optional(),
  seed: z.number().int().min(0).max(2 ** 31 - 1).optional(),
}).strict();

/** Every generator, from evidence: built-in ones are always there; paid ones only when their key is on the server. */
type Generator = { id: string; label: string; note: string; state: "configured" | "not_configured" | "not_connected"; execution: string; kinds: string[] };
export function generatorsFor(env: Env = process.env): Generator[] {
  const built: Generator[] = audioStatuses(env).map((a) => ({ id: a.id, label: a.name, note: a.note, state: a.state as Generator["state"], execution: a.execution, kinds: [...a.kinds] }));
  const kindsCovered = new Set(built.filter((b) => b.state === "configured").flatMap((b) => b.kinds));
  const missing: (Generator | false)[] = [
    !kindsCovered.has("voice") && { id: "voice", label: "Dialogue / voice (text-to-speech)", note: "The built-in voice isn't installed on this server.", state: "not_connected", execution: "native", kinds: ["voice"] },
    { id: "cleanup", label: "Dialogue clean-up / stem separation", note: "Not built yet.", state: "not_connected", execution: "external", kinds: [] },
  ];
  return [...built, ...missing.filter((g): g is Generator => !!g)];
}

const dto = (g: Row) => ({
  id: g.id, scene_id: g.scene_id, clip_id: g.clip_id, kind: g.kind, description: g.description, duration_seconds: Number(g.duration_seconds),
  provider: g.provider, model: g.model, execution: g.execution, seed: g.seed, status: g.status, asset_id: g.asset_id, error: g.error,
  layers: (g.result?.layers ?? []) as { name: string; because: string }[], created_at: g.created_at, completed_at: g.completed_at,
});
export const toGenerationDTO = dto;

function pickBackend(kind: AudioKind, provider: string | undefined, env: Env) {
  if (provider) {
    const a = getAudioAdapter(provider);
    if (!a || !a.kinds.includes(kind)) throw new AudioValidationError([], `${provider} can't make ${kind} sounds.`);
    if (!a.isConfigured(env)) throw new AudioNotReadyError(`${a.name} isn't connected on the server (its key isn't set).`);
    return a;
  }
  const a = audioBackendsFor(kind, env)[0];
  if (!a) throw new AudioNotReadyError(kind === "voice" ? "No voice generator is connected yet." : `No generator can make ${kind} sounds yet.`);
  return a;
}

export async function generateSound(db: SupabaseClient, projectId: string, sceneId: string, body: unknown, env: Env = process.env) {
  await assertProjectAccess(db, projectId);
  await assertSceneInProject(db, projectId, sceneId);
  const p = GenerateInput.safeParse(body);
  if (!p.success) throw new AudioValidationError(p.error.issues, p.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; "));
  const a = pickBackend(p.data.kind, p.data.provider, env);
  let description = p.data.description, params: Record<string, unknown> = {}, engineVersion = a.execution === "native" ? proceduralAudio.ENGINE_VERSION : "provider";
  if (p.data.kind === "voice") {
    // Voice DNA: the speaker's Casting profile + this line's emotion (Dialogue Intelligence). The words are the script's.
    const lineId = p.data.line_id ?? (p.data.clip_id ? await clipLine(db, projectId, p.data.clip_id) : null);
    if (!lineId) throw new AudioValidationError([], "Choose the dialogue line to speak.");
    const ls = await repo.getLineWithSpeaker(db, lineId);
    if (!ls || ls.line.scene_id !== sceneId) throw new AudioValidationError([], "That line isn't in this scene.");
    const who = (ls.character ?? { name: ls.line.speaker_name }) as { name: string };
    const voice = voiceCasting.voiceCastingEngine({ character: who, line: { emotion: ls.line.emotion, intensity: ls.line.intensity } });
    // The base voice (profile only) picks the speaker, so a character sounds like the same person in every line.
    const voice_base = voiceCasting.voiceCastingEngine({ character: who });
    description = String(ls.line.text).slice(0, 500);
    params = { voice, voice_base, character_name: who.name, line_id: lineId, character_id: ls.line.character_id ?? null };
    engineVersion = voice.engine_version;
  } else if (!description) throw new AudioValidationError([], "Describe the sound");
  const g = await repo.requestGeneration(db, {
    project: projectId, scene: sceneId, clip: p.data.clip_id, kind: p.data.kind, description, duration: p.data.duration_seconds, mood: p.data.mood,
    provider: a.id, model: a.models.find((m) => m.kinds.includes(p.data.kind))?.id ?? a.models[0].id, execution: a.execution,
    seed: p.data.seed ?? Math.floor(Math.random() * 2 ** 31), engineVersion, params,
  });
  return dto(g);
}

async function clipLine(db: SupabaseClient, projectId: string, clipId: string) {
  const c = (await repo.listClips(db, projectId)).find((x) => x.id === clipId);
  return (c?.source?.dialogue_line_id as string | undefined) ?? null;
}

/** Suggest-and-generate: one request per planned cue (ambience, effects, Foley, score) that has no audio and no generation yet. */
export async function generateSceneCues(db: SupabaseClient, projectId: string, sceneId: string, env: Env = process.env) {
  await assertProjectAccess(db, projectId);
  await assertSceneInProject(db, projectId, sceneId);
  const [sessions, tracks, clips, gens] = await Promise.all([repo.listSessions(db, projectId), repo.listTracks(db, projectId), repo.listClips(db, projectId), repo.listGenerations(db, projectId)]);
  const session = sessions.find((s) => s.scene_id === sceneId);
  if (!session) throw new AudioNotReadyError("Spot this scene first — the cues come from its approved shot plan.");
  const pending = new Set(gens.filter((g) => g.status !== "failed" && g.clip_id).map((g) => g.clip_id));
  const out: Row[] = [];
  const skipped: string[] = [];
  for (const c of clips.filter((x) => x.session_id === session.id && x.kind === "cue")) {
    const t = tracks.find((x) => x.id === c.track_id);
    const kind = t && FAMILY_KIND[t.family];
    if (!kind) continue;
    // Dialogue cues are spoken only when a voice backend is available and the cue knows its line.
    if (kind === "voice" && !c.source?.dialogue_line_id) continue;
    if (pending.has(c.id)) { skipped.push(c.label); continue; }
    const a = audioBackendsFor(kind, env)[0];
    if (!a) { skipped.push(c.label); continue; }
    out.push(await generateSound(db, projectId, sceneId, { clip_id: c.id, kind, ...(kind === "voice" ? {} : { description: String(c.label).slice(0, 500) }), duration_seconds: Math.min(300, Math.max(0.2, Number(c.duration_seconds))) }, env));
  }
  return { requested: out, skipped };
}
