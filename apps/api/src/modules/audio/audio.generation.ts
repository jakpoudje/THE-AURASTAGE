// Audio Studio — generate sound for planned cues (migration 0026). The backend comes from the Provider Gateway's audio
// side: only backends that can make that kind of sound AND are configured on this server are offered (never a guess).
// Generated files land in the Assets Library linked to the scene; using one on a cue is the person's choice (rule 11).
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { proceduralAudio } from "@aurastage/engines";
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
  kind: z.enum(["ambience", "fx", "foley", "score", "voice"]),
  description: z.string().trim().min(1, "Describe the sound").max(500),
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
    !kindsCovered.has("voice") && { id: "voice", label: "Dialogue / voice (text-to-speech)", note: "Not built yet: a voice provider (e.g. ElevenLabs) is the next step.", state: "not_connected", execution: "external", kinds: ["voice"] },
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
  const g = await repo.requestGeneration(db, {
    project: projectId, scene: sceneId, clip: p.data.clip_id, kind: p.data.kind, description: p.data.description, duration: p.data.duration_seconds, mood: p.data.mood,
    provider: a.id, model: a.models.find((m) => m.kinds.includes(p.data.kind))?.id ?? a.models[0].id, execution: a.execution,
    seed: p.data.seed ?? Math.floor(Math.random() * 2 ** 31), engineVersion: a.execution === "native" ? proceduralAudio.ENGINE_VERSION : "provider",
  });
  return dto(g);
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
    if (!kind || kind === "voice") continue;
    if (pending.has(c.id)) { skipped.push(c.label); continue; }
    const a = audioBackendsFor(kind, env)[0];
    if (!a) { skipped.push(c.label); continue; }
    out.push(await generateSound(db, projectId, sceneId, { clip_id: c.id, kind, description: String(c.label).slice(0, 500), duration_seconds: Math.min(300, Math.max(0.2, Number(c.duration_seconds))) }, env));
  }
  return { requested: out, skipped };
}
