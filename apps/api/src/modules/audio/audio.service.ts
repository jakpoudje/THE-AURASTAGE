// apps/api/src/modules/audio/audio.service.ts
// Domain workflow for the Audio Studio (SRS §11).
// Spotting builds a session from the APPROVED shot plan version (timing), the
// locked Scene DNA version (sound notes, dialogue line ids) and Dialogue lines.
// People place real recordings (Assets Library) on the cues, mix, measure the
// rendered mix loudness (BS.1770-4, measured in the browser on the real mix) and
// approve. Upstream changes mark sessions stale / review_required; recordings
// are never removed (rule 11).
import type { SupabaseClient } from "@supabase/supabase-js";
import { AddAudioTrackInputSchema, loudnessTarget, MoveAudioTrackInputSchema, SessionMixSchema, UpdateAudioMixInputSchema } from "@aurastage/contracts";
import { audioSpotting, audioSpottingEngine, musicSuggestionEngine } from "@aurastage/engines";
// Storyboard owns plan review state; ask it to refresh (it refreshes Scene DNA first).
import { refreshShotPlanReview } from "../shots/shots.service";
import { assertClipAccess, assertProjectAccess, assertSceneInProject, assertSessionAccess, assertTrackAccess } from "./audio.permissions";
import * as repo from "./audio.repository";
import { toClipDTO, toMeasurementDTO, toTrackDTO } from "./audio.mapper";
import { audioReadiness } from "./audio.readiness";
// Project Settings owns the loudness standard; Audio reads it.
import { readProjectSettings } from "../settings/settings.read";
import { AudioNotReadyError, AudioValidationError, validateClipPatch, validateMeasurement, validateTrackPatch } from "./audio.validator";

export const SPOTTING_ENGINE_VERSION = audioSpotting.ENGINE_VERSION;
type Row = Record<string, any>;

import { generatorsFor, toGenerationDTO } from "./audio.generation";

function reviewFor(session: Row, plan: Row | undefined, versionNumber: number | null, replaced: string | null = null) {
  if (!plan || plan.approved_version_id !== session.shot_plan_version_id) {
    return { state: "stale", reason: `The shot plan was approved again${versionNumber ? ` (now version ${versionNumber})` : ""} after this audio was spotted — re-spot to update the cues. Your recordings are kept.` };
  }
  if (plan.review_state !== "current") return { state: "review_required", reason: `The shot plan needs review. ${plan.review_reason ?? ""}`.trim() };
  if (plan.status !== "approved") return { state: "review_required", reason: "The shot plan has edits that aren't approved yet." };
  if (replaced) return { state: "review_required", reason: replaced };
  return { state: "current", reason: null };
}

/** An approved mix whose recording got a new version in the Assets Library afterwards needs a listen (rule 11). */
function replacedSince(session: Row, clips: Row[], versions: Row[], assets: Row[]): string | null {
  if (session.status !== "approved" || !session.approved_version_id) return null;
  const approvedAt = versions.find((v) => v.id === session.approved_version_id)?.created_at;
  if (!approvedAt) return null;
  const used = new Set(clips.filter((c) => c.session_id === session.id && c.asset_id).map((c) => c.asset_id as string));
  const changed = assets.filter((a) => used.has(a.id) && a.version_updated_at && Date.parse(a.version_updated_at) > Date.parse(approvedAt));
  if (!changed.length) return null;
  return `${changed.map((a) => `"${a.name}"`).join(", ")} ${changed.length === 1 ? "was" : "were"} replaced in the Assets Library (now version ${changed.map((a) => a.current_version).join(", ")}) after this mix was approved — listen, measure and approve again.`;
}

/**
 * Brings every session's review state up to date with Storyboard (which first
 * refreshes Scene DNA). Exported so downstream domains (Editorial) can ask the
 * Audio Studio to refresh its own state before reading it — they never write it.
 */
export async function refreshAudioReview(db: SupabaseClient, projectId: string) {
  await refreshShotPlanReview(db, projectId);
  const [plans, versions, sessions, clips, mixVersions, assets] = await Promise.all([
    repo.listPlans(db, projectId), repo.listPlanVersions(db, projectId), repo.listSessions(db, projectId),
    repo.listClips(db, projectId), repo.listVersions(db, projectId), repo.listAssetVersionTimes(db, projectId),
  ]);
  for (const session of sessions) {
    const plan = plans.find((p) => p.scene_id === session.scene_id);
    const pv = plan?.approved_version_id ? versions.find((v) => v.id === plan.approved_version_id) : undefined;
    const r = reviewFor(session, plan, pv?.version_number ?? null, replacedSince(session, clips, mixVersions, assets));
    if (session.review_state !== r.state || (session.review_reason ?? null) !== r.reason) await repo.setReview(db, session.id, r.state, r.reason);
  }
}


/** The scene's music suggestion (built-in library, free) from its locked Scene DNA, its dialogue and the film's story. */
function musicFor(scene: Row, index: number, total: number, pv: Row | undefined, dnaVersions: Row[], lines: Row[], story: Row) {
  const content = ((pv && dnaVersions.find((d) => d.id === pv.scene_dna_version_id)?.content) ?? {}) as Row;
  const editable = (content.editable ?? {}) as Row;
  const ids = new Set<string>(content.proposal?.dialogue?.line_ids ?? []);
  const sceneLines = lines.filter((l) => ids.has(l.id));
  const seconds = pv ? Math.max(0, ...((pv.shots as Row[]) ?? []).map((s) => Number(s.story_end))) : 0;
  return musicSuggestionEngine({
    film: { genre: story.genre ?? null, tone: story.tone ?? null, setting: story.setting ?? null },
    scene: {
      number: scene.number, heading: scene.heading ?? "", time_of_day: scene.time_of_day ?? null,
      mood: (editable.mood ?? []).slice(0, 20), sound_intent: editable.sound_intent ? String(editable.sound_intent).slice(0, 2000) : null,
      emotions: sceneLines.map((l) => l.emotion).filter(Boolean).slice(0, 2000),
      dialogue_seconds: sceneLines.reduce((a, l) => a + Number(l.estimated_seconds ?? 0), 0), seconds,
    },
    position: { index, total: Math.max(1, total) },
  });
}

export async function getAudioWorkspace(db: SupabaseClient, projectId: string) {
  await assertProjectAccess(db, projectId);
  await refreshAudioReview(db, projectId);
  const standard = (await readProjectSettings(db, projectId)).settings.technical.loudness_standard;
  const [scenes, plans, versions, sessions, tracks, clips, measurements, sessionVersions, assets, generations] = await Promise.all([
    repo.listScenes(db, projectId), repo.listPlans(db, projectId), repo.listPlanVersions(db, projectId), repo.listSessions(db, projectId),
    repo.listTracks(db, projectId), repo.listClips(db, projectId), repo.listMeasurements(db, projectId), repo.listVersions(db, projectId),
    repo.listAudioAssets(db, projectId), repo.listGenerations(db, projectId),
  ]);
  const [dnaVersions, lines, story] = await Promise.all([repo.listDnaVersions(db, projectId), repo.listLines(db, projectId), repo.getProjectStory(db, projectId)]);
  const assetTimes = await repo.listAssetVersionTimes(db, projectId);
  const out = [];
  for (const scene of scenes) {
    const plan = plans.find((p) => p.scene_id === scene.id);
    const pv = plan?.approved_version_id ? versions.find((v) => v.id === plan.approved_version_id) : undefined;
    const session = sessions.find((s) => s.scene_id === scene.id) ?? null;
    if (!pv && !session) continue;
    const st = session ? tracks.filter((t) => t.session_id === session!.id) : [];
    const sc = session ? clips.filter((c) => c.session_id === session!.id) : [];
    const m = session ? measurements.find((x) => x.session_id === session!.id) ?? null : null;
    const usedIds = new Set(sc.filter((c) => c.asset_id).map((c) => c.asset_id as string));
    const changedAt = assetTimes.filter((a) => usedIds.has(a.id)).map((a) => a.version_updated_at as string).sort().pop() ?? null;
    const ready = session ? audioReadiness(session, st, sc, m, standard, changedAt) : null;
    out.push({
      scene: { id: scene.id, number: scene.number, heading: scene.heading },
      plan: pv ? { version_id: pv.id, version_number: pv.version_number, usable: plan!.status === "approved" && plan!.review_state === "current" } : null,
      session: session
        ? {
            id: session.id, status: session.status, review_state: session.review_state, review_reason: session.review_reason, revision: session.revision,
            recordings_replaced: session.status === "approved" && !!replacedSince(session, clips, sessionVersions, assetTimes),
            scene_seconds: Number(session.scene_seconds),
            // Routing (buses, reverb, delay, master); sessions saved before migration 0029 read as neutral.
            mix: SessionMixSchema.parse(session.mix ?? {}),
            approved_version_number: session.approved_version_id ? sessionVersions.find((v) => v.id === session!.approved_version_id)?.version_number ?? null : null,
          }
        : null,
      tracks: st.map(toTrackDTO),
      clips: sc.map(toClipDTO),
      measurement: toMeasurementDTO(m),
      readiness: ready?.readiness ?? [],
      ready_for_approval: ready?.ready ?? false,
      generations: generations.filter((g) => g.scene_id === scene.id).map(toGenerationDTO),
      music_suggestion: musicFor(scene, scenes.indexOf(scene), scenes.length, pv, dnaVersions, lines, story),
    });
  }
  return {
    target: { ...loudnessTarget(standard), standard },
    generators: generatorsFor(),
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
  const story = await repo.getProjectStory(db, projectId);
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
  const sceneLines = lineIds.map((id) => lines.find((l) => l.id === id)).filter((l): l is Row => !!l);
  // Script positions (source lines) of the spoken lines and the scene, so sound cues land where the action happens.
  const sourceVersion = sceneLines[0]?.source_version_id as string | undefined;
  const at = sourceVersion ? await repo.scriptElementLines(db, sourceVersion) : new Map<number, number>();
  const bounds = [at.get(scene.element_start), at.get(scene.element_end)];
  const { tracks, clips, engine_version } = audioSpottingEngine({
    scene: { number: scene.number, heading: scene.heading, int_ext: scene.int_ext, location: scene.location, time_of_day: scene.time_of_day },
    scene_seconds: seconds,
    shots,
    script_lines: bounds[0] && bounds[1] ? { start: bounds[0], end: bounds[1] } : null,
    lines: sceneLines
      .map((l) => ({
        id: l.id, speaker: l.speaker_name, character_id: l.character_id, character_name: l.character_id ? name.get(l.character_id) ?? null : null,
        text: l.text, estimated_seconds: Number(l.estimated_seconds), voice_over: (l.extensions ?? []).some((e: string) => /V\.?O/i.test(e)),
        script_line: at.get(l.element_index) ?? null,
      })),
    dna: {
      sound_intent: editable.sound_intent ?? null, weather: editable.weather ?? null, atmosphere: editable.atmosphere ?? null,
      mood: editable.mood ?? [], sound_candidates: proposal.sound_candidates ?? [],
    },
    music: (() => { const m = musicFor(scene, scenes.indexOf(scene), scenes.length, pv, dnaVersions, lines, story); return { needed: m.needed, description: m.description, why: m.why }; })(),
  });
  const s = await repo.spot(db, { projectId, sceneId, planVersionId: pv.id, seconds, tracks, clips, engineVersion: engine_version });
  return { session_id: s.id, tracks: tracks.length, cues: clips.length, shot_plan_version_number: pv.version_number };
}

export async function updateTrack(db: SupabaseClient, trackId: string, payload: unknown) {
  const patch = validateTrackPatch(payload);
  await assertTrackAccess(db, trackId);
  return toTrackDTO(await repo.updateTrack(db, trackId, patch));
}

const parsed = <T>(r: { success: true; data: T } | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } }): T => {
  if (!r.success) throw new AudioValidationError(r.error.issues as never, r.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; "));
  return r.data;
};

/** A track a person adds (any department); re-spotting never removes it. */
export async function addTrack(db: SupabaseClient, sessionId: string, payload: unknown) {
  const a = parsed(AddAudioTrackInputSchema.safeParse(payload));
  await assertSessionAccess(db, sessionId);
  return toTrackDTO(await repo.addTrack(db, sessionId, a));
}

export async function moveTrack(db: SupabaseClient, trackId: string, payload: unknown) {
  const { direction } = parsed(MoveAudioTrackInputSchema.safeParse(payload));
  await assertTrackAccess(db, trackId);
  await repo.moveTrack(db, trackId, direction);
  return { moved: true };
}

/** Only tracks added by hand, and only when empty (the database refuses otherwise, with the reason). */
export async function deleteTrack(db: SupabaseClient, trackId: string) {
  await assertTrackAccess(db, trackId);
  await repo.deleteTrack(db, trackId);
  return { deleted: true };
}

/** Buses, shared reverb/delay and master. Validated against the shared contract; stale revision → 409. */
export async function updateMix(db: SupabaseClient, projectId: string, sceneId: string, payload: unknown) {
  const p = UpdateAudioMixInputSchema.safeParse(payload);
  if (!p.success) throw new AudioValidationError(p.error.issues, p.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; "));
  await assertSceneInProject(db, projectId, sceneId);
  const session = (await repo.listSessions(db, projectId)).find((s) => s.scene_id === sceneId);
  if (!session) throw new AudioNotReadyError("Spot this scene's audio first.");
  const s = await repo.updateMix(db, session.id, p.data.mix, p.data.revision);
  return { session_id: s.id, revision: s.revision, mix: SessionMixSchema.parse(s.mix ?? {}) };
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
  // A replaced recording is reviewed by measuring and approving again; any other upstream review blocks.
  if (s.session.review_state !== "current" && !s.session.recordings_replaced) throw new AudioNotReadyError(s.session.review_reason ?? "This audio needs review first.");
  if (!s.ready_for_approval) {
    const failing = s.readiness.filter((r) => r.blocking && !r.ok);
    throw new AudioNotReadyError(`Not ready to approve yet: ${failing.map((f) => f.label.toLowerCase()).join("; ")}.`, failing);
  }
  const v = await repo.approve(db, projectId, sceneId);
  return { version_id: v.id, version_number: v.version_number };
}
