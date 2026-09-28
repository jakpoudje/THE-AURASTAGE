// apps/api/src/modules/audio/audio.service.ts
// Domain workflow for the Audio Studio (SRS §11).
// Spotting builds a session from the APPROVED shot plan version (timing), the
// locked Scene DNA version (sound notes, dialogue line ids) and Dialogue lines.
// People place real recordings (Assets Library) on the cues, mix, measure the
// rendered mix loudness (BS.1770-4, measured in the browser on the real mix) and
// approve. Upstream changes mark sessions stale / review_required; recordings
// are never removed (rule 11).
import type { SupabaseClient } from "@supabase/supabase-js";
import { LOUDNESS_TARGET } from "@aurastage/contracts";
import { audioSpotting, audioSpottingEngine } from "@aurastage/engines";
// Storyboard owns plan review state; ask it to refresh (it refreshes Scene DNA first).
import { refreshShotPlanReview } from "../shots/shots.service";
import { assertClipAccess, assertProjectAccess, assertSceneInProject, assertSessionAccess, assertTrackAccess } from "./audio.permissions";
import * as repo from "./audio.repository";
import { toClipDTO, toMeasurementDTO, toTrackDTO } from "./audio.mapper";
import { audioReadiness } from "./audio.readiness";
import { AudioNotReadyError, validateClipPatch, validateMeasurement, validateTrackPatch } from "./audio.validator";

export const SPOTTING_ENGINE_VERSION = audioSpotting.ENGINE_VERSION;
type Row = Record<string, any>;

/** AI generators the SRS lists; none is connected yet, and we say so. */
const GENERATORS = [
  { id: "voice", label: "AI dialogue / voice (TTS)", note: "Needs a voice provider (e.g. OpenAI or ElevenLabs key)." },
  { id: "music", label: "Music assistant", note: "Needs a music provider key." },
  { id: "sfx", label: "Foley & SFX generation", note: "Needs a sound-effects provider key." },
  { id: "cleanup", label: "Dialogue clean-up / stem separation", note: "Needs an audio-processing provider key." },
].map((g) => ({ ...g, state: "not_connected" as const }));

function reviewFor(session: Row, plan: Row | undefined, versionNumber: number | null) {
  if (!plan || plan.approved_version_id !== session.shot_plan_version_id) {
    return { state: "stale", reason: `The shot plan was approved again${versionNumber ? ` (now version ${versionNumber})` : ""} after this audio was spotted — re-spot to update the cues. Your recordings are kept.` };
  }
  if (plan.review_state !== "current") return { state: "review_required", reason: `The shot plan needs review. ${plan.review_reason ?? ""}`.trim() };
  if (plan.status !== "approved") return { state: "review_required", reason: "The shot plan has edits that aren't approved yet." };
  return { state: "current", reason: null };
}

export async function getAudioWorkspace(db: SupabaseClient, projectId: string) {
  await assertProjectAccess(db, projectId);
  await refreshShotPlanReview(db, projectId);
  const [scenes, plans, versions, sessions, tracks, clips, measurements, sessionVersions, assets] = await Promise.all([
    repo.listScenes(db, projectId), repo.listPlans(db, projectId), repo.listPlanVersions(db, projectId), repo.listSessions(db, projectId),
    repo.listTracks(db, projectId), repo.listClips(db, projectId), repo.listMeasurements(db, projectId), repo.listVersions(db, projectId),
    repo.listAudioAssets(db, projectId),
  ]);
  const out = [];
  for (const scene of scenes) {
    const plan = plans.find((p) => p.scene_id === scene.id);
    const pv = plan?.approved_version_id ? versions.find((v) => v.id === plan.approved_version_id) : undefined;
    let session = sessions.find((s) => s.scene_id === scene.id) ?? null;
    if (!pv && !session) continue;
    if (session) {
      const r = reviewFor(session, plan, pv?.version_number ?? null);
      if (session.review_state !== r.state || (session.review_reason ?? null) !== r.reason) session = await repo.setReview(db, session.id, r.state, r.reason);
    }
    const st = session ? tracks.filter((t) => t.session_id === session!.id) : [];
    const sc = session ? clips.filter((c) => c.session_id === session!.id) : [];
    const m = session ? measurements.find((x) => x.session_id === session!.id) ?? null : null;
    const ready = session ? audioReadiness(session, st, sc, m) : null;
    out.push({
      scene: { id: scene.id, number: scene.number, heading: scene.heading },
      plan: pv ? { version_id: pv.id, version_number: pv.version_number, usable: plan!.status === "approved" && plan!.review_state === "current" } : null,
      session: session
        ? {
            id: session.id, status: session.status, review_state: session.review_state, review_reason: session.review_reason, revision: session.revision,
            scene_seconds: Number(session.scene_seconds),
            approved_version_number: session.approved_version_id ? sessionVersions.find((v) => v.id === session!.approved_version_id)?.version_number ?? null : null,
          }
        : null,
      tracks: st.map(toTrackDTO),
      clips: sc.map(toClipDTO),
      measurement: toMeasurementDTO(m),
      readiness: ready?.readiness ?? [],
      ready_for_approval: ready?.ready ?? false,
    });
  }
  return {
    target: LOUDNESS_TARGET,
    generators: GENERATORS,
    assets: assets.map((a) => ({ id: a.id, name: a.name, duration_seconds: a.metadata?.duration_seconds ?? null, media_type: a.metadata?.media_type ?? null, created_at: a.created_at })),
    scenes: out,
    summary: { scenes: out.length, spotted: out.filter((s) => s.session).length, approved: out.filter((s) => s.session?.status === "approved" && s.session.review_state === "current").length },
  };
}

export async function spotScene(db: SupabaseClient, projectId: string, sceneId: string) {
  await assertProjectAccess(db, projectId);
  await assertSceneInProject(db, projectId, sceneId);
  await refreshShotPlanReview(db, projectId);
  const [scenes, plans, versions, dnaVersions, lines, chars] = await Promise.all([
    repo.listScenes(db, projectId), repo.listPlans(db, projectId), repo.listPlanVersions(db, projectId), repo.listDnaVersions(db, projectId),
    repo.listLines(db, projectId), repo.listCharacters(db, projectId),
  ]);
  const scene = scenes.find((s) => s.id === sceneId)!;
  const plan = plans.find((p) => p.scene_id === sceneId);
  const pv = plan?.approved_version_id ? versions.find((v) => v.id === plan.approved_version_id) : undefined;
  if (!plan || !pv || plan.status !== "approved" || plan.review_state !== "current") {
    throw new AudioNotReadyError("Approve this scene's shot plan in Storyboard first — audio is spotted from the approved version.");
  }
  const dna = dnaVersions.find((d) => d.id === pv.scene_dna_version_id);
  const content = (dna?.content ?? {}) as Row;
  const editable = (content.editable ?? {}) as Row;
  const proposal = (content.proposal ?? {}) as Row;
  const lineIds: string[] = proposal.dialogue?.line_ids ?? [];
  const name = new Map(chars.map((c) => [c.id as string, c.name as string]));
  const shots = ((pv.shots as Row[]) ?? []).map((s) => ({ ordinal: s.ordinal, story_start: Number(s.story_start), story_end: Number(s.story_end), dialogue_line_ids: s.dialogue_line_ids ?? [] }));
  const seconds = Math.max(1, ...shots.map((s) => s.story_end));
  const { tracks, clips, engine_version } = audioSpottingEngine({
    scene: { number: scene.number, heading: scene.heading, int_ext: scene.int_ext, location: scene.location, time_of_day: scene.time_of_day },
    scene_seconds: seconds,
    shots,
    lines: lineIds
      .map((id) => lines.find((l) => l.id === id))
      .filter((l): l is Row => !!l)
      .map((l) => ({
        id: l.id, speaker: l.speaker_name, character_id: l.character_id, character_name: l.character_id ? name.get(l.character_id) ?? null : null,
        text: l.text, estimated_seconds: Number(l.estimated_seconds), voice_over: (l.extensions ?? []).some((e: string) => /V\.?O/i.test(e)),
      })),
    dna: {
      sound_intent: editable.sound_intent ?? null, weather: editable.weather ?? null, atmosphere: editable.atmosphere ?? null,
      mood: editable.mood ?? [], sound_candidates: proposal.sound_candidates ?? [],
    },
  });
  const s = await repo.spot(db, { projectId, sceneId, planVersionId: pv.id, seconds, tracks, clips, engineVersion: engine_version });
  return { session_id: s.id, tracks: tracks.length, cues: clips.length, shot_plan_version_number: pv.version_number };
}

export async function updateTrack(db: SupabaseClient, trackId: string, payload: unknown) {
  const patch = validateTrackPatch(payload);
  await assertTrackAccess(db, trackId);
  return toTrackDTO(await repo.updateTrack(db, trackId, patch));
}

export async function createClip(db: SupabaseClient, sessionId: string, payload: unknown) {
  const patch = validateClipPatch(payload);
  await assertSessionAccess(db, sessionId);
  if (!patch.track_id) throw new AudioNotReadyError("Choose a track for the new clip.");
  return toClipDTO(await repo.saveClip(db, sessionId, null, patch));
}

export async function updateClip(db: SupabaseClient, clipId: string, payload: unknown) {
  const patch = validateClipPatch(payload);
  const c = await assertClipAccess(db, clipId);
  return toClipDTO(await repo.saveClip(db, c.session_id, clipId, patch));
}

export async function deleteClip(db: SupabaseClient, clipId: string) {
  await assertClipAccess(db, clipId);
  await repo.deleteClip(db, clipId);
  return { deleted: true };
}

export async function recordMeasurement(db: SupabaseClient, sessionId: string, payload: unknown) {
  const m = validateMeasurement(payload);
  await assertSessionAccess(db, sessionId);
  return toMeasurementDTO(await repo.recordMeasurement(db, sessionId, m));
}

export async function approveSession(db: SupabaseClient, projectId: string, sceneId: string) {
  await assertProjectAccess(db, projectId);
  await assertSceneInProject(db, projectId, sceneId);
  const ws = await getAudioWorkspace(db, projectId);
  const s = ws.scenes.find((x) => x.scene.id === sceneId);
  if (!s?.session) throw new AudioNotReadyError("Spot this scene's audio first.");
  if (s.session.review_state !== "current") throw new AudioNotReadyError(s.session.review_reason ?? "This audio needs review first.");
  if (!s.ready_for_approval) {
    const failing = s.readiness.filter((r) => r.blocking && !r.ok);
    throw new AudioNotReadyError(`Not ready to approve yet: ${failing.map((f) => f.label.toLowerCase()).join("; ")}.`, failing);
  }
  const v = await repo.approve(db, projectId, sceneId);
  return { version_id: v.id, version_number: v.version_number };
}
