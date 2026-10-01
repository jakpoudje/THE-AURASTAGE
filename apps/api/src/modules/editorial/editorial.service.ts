// apps/api/src/modules/editorial/editorial.service.ts
// Domain workflow for Editorial & Timeline (SRS §12).
// The timeline cuts APPROVED takes (Visual Generation) over the approved shot
// plans' story time, with each scene's APPROVED mix (Audio Studio) on A1. Every
// edit is one NLE operation applied by editDecisionEngine and saved atomically
// against the timeline revision. Upstream changes never touch the cut (rule 11):
// affected clips are listed and the timeline is flagged until someone chooses
// "Conform". Picture Lock is an immutable version; breaking it needs an explicit
// confirmation and records the impact.
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TIMELINE_FPS, TimelineAutomationSchema, type EditOperation, type TimelineClip } from "@aurastage/contracts";
import {
  assemblyTimeline, assemblyTimelineEngine, editDecision, editDecisionEngine, EditRejectedError, editorialQC, editorialQCEngine,
  edlExportEngine, pictureLockEngine, type EngineClip,
} from "@aurastage/engines";
import { mediaConfigured, signedMediaUrl } from "../../storage/media";
// Audio Studio owns mix review state; asking it to refresh also refreshes Storyboard and Scene DNA.
import { refreshAudioReview } from "../audio/audio.service";
import { assertProjectAccess } from "./editorial.permissions";
import * as repo from "./editorial.repository";
import { toClipDTO } from "./editorial.mapper";
import {
  EditorialConflictError, EditorialLockedError, EditorialNotFoundError, EditorialNotReadyError,
  validateAssemble, validateAutomation, validateEditRequest, validateLock, validateRestore, validateSaveVersion,
} from "./editorial.validator";

type Row = Record<string, any>;
type Env = Record<string, string | undefined>;
const fps = TIMELINE_FPS;
const F = (s: number) => Math.round(s * fps);

async function load(db: SupabaseClient, projectId: string) {
  const project = await assertProjectAccess(db, projectId);
  await refreshAudioReview(db, projectId);
  const [scenes, plans, planVersions, takes, sessions, mixVersions, timeline] = await Promise.all([
    repo.listScenes(db, projectId), repo.listPlans(db, projectId), repo.listPlanVersions(db, projectId), repo.listTakes(db, projectId),
    repo.listSessions(db, projectId), repo.listMixVersions(db, projectId), repo.getTimeline(db, projectId),
  ]);
  const clips = timeline ? (await repo.listClips(db, timeline.id)).map(toClipDTO) : [];
  return { project, scenes, plans, planVersions, takes, sessions, mixVersions, timeline, clips };
}
type Ctx = Awaited<ReturnType<typeof load>>;

const takeFrames = (t: Row) => (t.capability === "video" && Number(t.params?.duration_seconds) > 0 ? F(Number(t.params.duration_seconds)) : null);
const mixSeconds = (v: Row, session: Row | undefined) => Number(v.measurement?.duration_seconds) || Number(session?.scene_seconds) || 1;

/** What upstream currently approves, per scene and per shot. */
function upstream(ctx: Ctx) {
  const shotInfo = new Map<string, { scene_id: string; scene_number: number; ordinal: number; size: string | null; description: string; story_start: number; story_end: number }>();
  const scenes = ctx.scenes.map((scene) => {
    const plan = ctx.plans.find((p) => p.scene_id === scene.id);
    const pv = plan?.approved_version_id ? ctx.planVersions.find((v) => v.id === plan.approved_version_id) : undefined;
    const usable = !!plan && !!pv && plan.status === "approved" && plan.review_state === "current";
    const shots = ((pv?.shots as Row[]) ?? []).slice().sort((a, b) => a.ordinal - b.ordinal);
    for (const s of shots)
      shotInfo.set(s.id, { scene_id: scene.id, scene_number: scene.number, ordinal: s.ordinal, size: s.size ?? null, description: s.description ?? "", story_start: Number(s.story_start), story_end: Number(s.story_end) });
    const session = ctx.sessions.find((s) => s.scene_id === scene.id);
    const mixCurrent =
      session?.approved_version_id && session.status === "approved" && session.review_state === "current" ? ctx.mixVersions.find((v) => v.id === session.approved_version_id) : undefined;
    return { scene, plan, pv, usable, shots, session, mixCurrent };
  });
  const approvedTake = (shotId: string | null) => (shotId ? ctx.takes.find((t) => t.shot_id === shotId && t.approval === "approved" && t.status === "succeeded") ?? null : null);
  const shotLabel = (shotId: string) => {
    const i = shotInfo.get(shotId);
    return i ? `Scene ${i.scene_number} · Shot ${i.ordinal}${i.size ? ` (${i.size})` : ""}` : "Shot";
  };
  return { scenes, shotInfo, approvedTake, shotLabel };
}
type Up = ReturnType<typeof upstream>;

/** Clips whose source changed upstream (never changed automatically). */
function clipIssues(ctx: Ctx, up: Up) {
  const issues: { clip_id: string; code: string; message: string }[] = [];
  for (const c of ctx.clips) {
    if (c.kind === "take") {
      const info = c.shot_id ? up.shotInfo.get(c.shot_id) : undefined;
      const row = up.scenes.find((s) => s.scene.id === c.scene_id);
      const at = up.approvedTake(c.shot_id);
      if (!info) issues.push({ clip_id: c.id, code: "shot_removed", message: `${c.label}: the shot is no longer in the approved shot plan` });
      else if (row && !row.usable) issues.push({ clip_id: c.id, code: "plan_changed", message: `${c.label}: Scene ${info.scene_number}'s shot plan has changes that aren't approved` });
      else if (!at) issues.push({ clip_id: c.id, code: "take_unapproved", message: `${c.label}: its take is no longer approved` });
      else if (at.id !== c.take_id) issues.push({ clip_id: c.id, code: "newer_take", message: `${c.label}: take V${at.take_number} is now the approved take` });
    } else if (c.kind === "audio_mix") {
      const row = up.scenes.find((s) => s.scene.id === c.scene_id);
      if (!row?.mixCurrent) issues.push({ clip_id: c.id, code: "mix_review", message: `${c.label}: the scene's sound needs review in Audio Studio` });
      else if (row.mixCurrent.id !== c.audio_session_version_id) issues.push({ clip_id: c.id, code: "newer_mix", message: `${c.label}: mix v${row.mixCurrent.version_number} is now approved` });
    }
  }
  return issues;
}

/** The currently approved source for every clip that can be updated without changing the cut. */
function conformReplacements(ctx: Ctx, up: Up) {
  const out: NonNullable<editDecision.EditDecisionInput["replacements"]> = [];
  for (const c of ctx.clips) {
    if ((c.track === "V1" || c.track === "V2") && c.shot_id && up.shotInfo.has(c.shot_id)) {
      const at = up.approvedTake(c.shot_id);
      const base = up.shotLabel(c.shot_id);
      if (at && at.id !== c.take_id) out.push({ clip_id: c.id, kind: "take", take_id: at.id, audio_session_version_id: null, source_frames: takeFrames(at), label: base });
      // An insert (V2) without an approved take stays flagged for review; only V1 falls back to an offline slug.
      else if (!at && c.kind === "take" && c.track === "V1") out.push({ clip_id: c.id, kind: "slug", take_id: null, audio_session_version_id: null, source_frames: null, label: `${base} — no approved take` });
    } else if (c.kind === "audio_mix") {
      const row = up.scenes.find((s) => s.scene.id === c.scene_id);
      if (row?.mixCurrent && row.mixCurrent.id !== c.audio_session_version_id)
        out.push({ clip_id: c.id, kind: "audio_mix", take_id: null, audio_session_version_id: row.mixCurrent.id, source_frames: F(mixSeconds(row.mixCurrent, row.session)), label: `Scene ${row.scene.number} mix v${row.mixCurrent.version_number}` });
    }
  }
  return out;
}

function runQC(ctx: Ctx, clips: TimelineClip[], issues: ReturnType<typeof clipIssues>) {
  return editorialQCEngine({
    fps, clips, issues, target_runtime_minutes: ctx.project.target_runtime_minutes ?? null,
    scenes: ctx.scenes.map((s) => ({ scene_id: s.id, number: s.number, heading: s.heading })),
  });
}

/** Sound families shown as cues on the picture timeline (owner request 2026-10-01): effects, Foley, ambience, crowd. */
const CUE_FAMILIES = new Set(["FX", "FOLEY", "BG", "WALLA"]);

/**
 * Each scene's planned and placed sounds from Audio Studio, at the frame where they happen in the cut (owner request
 * 2026-10-01: "marked the identified area, timelength and type of sound"). A scene's sound starts where its A1 mix sits
 * (minus any trim at its head); a scene with no mix on A1 yet starts at its first picture clip. Sounds trimmed out of
 * the cut are left out. Read-only: choosing or uploading the sound happens in Audio Studio.
 */
async function soundCues(db: SupabaseClient, projectId: string, ctx: Awaited<ReturnType<typeof load>>) {
  const [clips, tracks] = await Promise.all([repo.listAudioClips(db, projectId), repo.listAudioTracks(db, projectId)]);
  const fam = new Map(tracks.map((t) => [t.id as string, t.family as string]));
  const sceneOf = new Map(ctx.sessions.map((s) => [s.id as string, s.scene_id as string]));
  const out: { scene_id: string; clip_id: string; label: string; family: string; planned: boolean; at: number; frames: number }[] = [];
  for (const c of clips) {
    const family = fam.get(c.track_id as string);
    const scene = sceneOf.get(c.session_id as string);
    if (!family || !CUE_FAMILIES.has(family) || !scene) continue;
    const a1 = ctx.clips.find((x) => x.track === "A1" && x.scene_id === scene);
    const v1 = ctx.clips.filter((x) => x.track === "V1" && x.scene_id === scene).sort((a, b) => a.record_in - b.record_in)[0];
    if (!a1 && !v1) continue;
    const start = Math.round(Number(c.start_seconds) * fps), len = Math.max(1, Math.round(Number(c.duration_seconds) * fps));
    const at = a1 ? a1.record_in + (start - a1.source_in) : v1!.record_in + start;
    // Outside the scene's mix as cut: not in the film.
    if (a1 && (start + len <= a1.source_in || start >= a1.source_in + a1.duration)) continue;
    out.push({ scene_id: scene, clip_id: c.id as string, label: String(c.label), family, planned: c.kind === "cue" || !c.asset_id, at: Math.max(0, at), frames: len });
  }
  return out.sort((a, b) => a.at - b.at);
}

export async function getEditorialWorkspace(db: SupabaseClient, projectId: string, env: Env = process.env) {
  const ctx = await load(db, projectId);
  const up = upstream(ctx);
  const issues = clipIssues(ctx, up);
  const conformable = conformReplacements(ctx, up).length;
  let timeline = ctx.timeline;
  if (timeline) {
    const state = issues.length ? "review_required" : "current";
    const reason = issues.length ? `${issues.length} clip${issues.length === 1 ? " uses" : "s use"} a take or mix that changed upstream. Your cut is unchanged — Conform to update it.` : null;
    if (timeline.review_state !== state || (timeline.review_reason ?? null) !== reason) timeline = await repo.setReview(db, projectId, state, reason);
  }
  const [versions, locks] = timeline ? await Promise.all([repo.listVersions(db, timeline.id), repo.listLocks(db, timeline.id)]) : [[], []];
  const qc = runQC(ctx, ctx.clips, issues);

  // Media: signed links for takes on the timeline and approved takes in the bin.
  const takeIds = new Set<string>([...ctx.clips.map((c) => c.take_id).filter((x): x is string => !!x)]);
  for (const s of up.scenes) for (const sh of s.shots) {
    const at = up.approvedTake(sh.id);
    if (at) takeIds.add(at.id);
  }
  const media: Record<string, { url: string | null; media_type: string | null; capability: string; take_number: number }> = {};
  for (const id of takeIds) {
    const t = ctx.takes.find((x) => x.id === id);
    if (!t) continue;
    media[id] = { url: t.storage_key && mediaConfigured(env) ? await signedMediaUrl(t.storage_key, 3600, env) : null, media_type: t.media_type ?? null, capability: t.capability, take_number: t.take_number };
  }
  // Scene mixes for playback: the versions on A1 plus the currently approved ones.
  const mixIds = new Set<string>([...ctx.clips.map((c) => c.audio_session_version_id).filter((x): x is string => !!x), ...up.scenes.map((s) => s.mixCurrent?.id).filter((x): x is string => !!x)]);
  const mixes: Record<string, unknown> = {};
  for (const id of mixIds) {
    const v = ctx.mixVersions.find((x) => x.id === id);
    if (!v) continue;
    const session = ctx.sessions.find((s) => s.id === v.session_id);
    mixes[id] = { id, scene_id: session?.scene_id ?? null, version_number: v.version_number, seconds: mixSeconds(v, session), tracks: v.tracks, clips: v.clips, mix: v.mix ?? {} };
  }
  const lock = timeline?.current_lock_id ? locks.find((l) => l.id === timeline!.current_lock_id) : undefined;
  // The music track's choices: audio files in the Assets Library (music first), with their length.
  const audio = await repo.listAudioAssets(db, projectId);
  const music_library = audio.map((a) => ({ asset_id: a.id as string, name: a.name as string, category: (a.category ?? null) as string | null, seconds: Number(a.metadata?.duration_seconds ?? 0) || null }))
    .sort((a, b) => Number(b.category === "music") - Number(a.category === "music"));
  const sound_cues = await soundCues(db, projectId, ctx);
  return {
    fps,
    sound_cues,
    project: { title: ctx.project.title, target_runtime_minutes: ctx.project.target_runtime_minutes ?? null },
    timeline: timeline
      ? {
          id: timeline.id, status: timeline.status, revision: timeline.revision, review_state: timeline.review_state, review_reason: timeline.review_reason,
          lock: lock ? { lock_number: lock.lock_number, locked_at: lock.locked_at } : null, updated_at: timeline.updated_at,
          automation: TimelineAutomationSchema.parse(timeline.automation ?? {}), automation_revision: timeline.automation_revision,
        }
      : null,
    clips: ctx.clips,
    issues,
    conformable,
    qc,
    versions: versions.map((v) => ({ id: v.id, version_number: v.version_number, label: v.label, kind: v.kind, duration_frames: v.duration_frames, created_at: v.created_at })),
    locks: locks.map((l) => ({ lock_number: l.lock_number, locked_at: l.locked_at, broken_at: l.broken_at, impact: l.impact ?? null })),
    bin: up.scenes
      .filter((s) => s.pv || s.session)
      .map((s) => ({
        scene_id: s.scene.id, number: s.scene.number, heading: s.scene.heading,
        plan: s.pv ? { version_number: s.pv.version_number, usable: s.usable } : null,
        shots: s.shots.map((sh) => {
          const at = up.approvedTake(sh.id);
          return {
            shot_id: sh.id, ordinal: sh.ordinal, size: sh.size ?? null, description: sh.description ?? "", seconds: Math.max(0, Number(sh.story_end) - Number(sh.story_start)),
            take: at ? { take_id: at.id, take_number: at.take_number, capability: at.capability, source_frames: takeFrames(at) } : null,
          };
        }),
        mix: s.mixCurrent ? { version_id: s.mixCurrent.id, version_number: s.mixCurrent.version_number, seconds: mixSeconds(s.mixCurrent, s.session) } : null,
        mix_note: s.mixCurrent ? null : s.session?.approved_version_id ? "Sound needs review in Audio Studio" : "No approved mix yet",
      })),
    media,
    mixes,
    music_library,
    engines: { assembly: assemblyTimeline.ENGINE_VERSION, edit: editDecision.ENGINE_VERSION, qc: editorialQC.ENGINE_VERSION },
  };
}

/** Saves a new clip list; a locked picture is only changed with an explicit break (impact recorded). */
async function persist(db: SupabaseClient, ctx: Ctx, clips: EngineClip[], a: { action: string; summary: string; engineVersion: string; baseRevision: string | null; breakLock: boolean }) {
  const withIds = clips.map((c) => ({ ...c, id: c.id ?? randomUUID() }));
  let impact: unknown = null;
  if (ctx.timeline?.status === "locked") {
    const locks = await repo.listLocks(db, ctx.timeline.id);
    const lock = locks.find((l) => l.id === ctx.timeline!.current_lock_id);
    const version = lock ? await repo.getVersion(db, ctx.timeline.id, lock.version_id) : null;
    const r = pictureLockEngine({
      fps, locked: ((version?.clips as Row[]) ?? []).map(toClipDTO), proposed: withIds,
      scenes: ctx.scenes.map((s) => ({ scene_id: s.id, number: s.number, heading: s.heading })),
    });
    impact = r.impact;
    if (!a.breakLock) {
      throw new EditorialLockedError(
        r.changed ? `The picture is locked. This change touches ${r.impact.map((i) => i.label).join(", ")} — confirm to break Picture Lock ${lock?.lock_number ?? ""}.`.replace(" .", ".") : "The picture is locked — confirm to break the lock.",
        r.impact
      );
    }
  }
  await repo.saveTimeline(db, { projectId: ctx.project.id, baseRevision: a.baseRevision, clips: withIds, action: a.action, summary: a.summary, engineVersion: a.engineVersion, breakLock: a.breakLock, impact });
}

export async function assembleTimeline(db: SupabaseClient, projectId: string, payload: unknown) {
  const req = validateAssemble(payload);
  const ctx = await load(db, projectId);
  const up = upstream(ctx);
  const input = up.scenes
    .filter((s) => s.pv)
    .map((s) => ({
      scene_id: s.scene.id, number: s.scene.number, heading: s.scene.heading,
      shots: s.shots.map((sh) => {
        const at = up.approvedTake(sh.id);
        return {
          shot_id: sh.id, ordinal: sh.ordinal, size: sh.size ?? null, story_start: Number(sh.story_start), story_end: Number(sh.story_end),
          take: at ? { take_id: at.id, duration_seconds: takeFrames(at) === null ? null : Number(at.params.duration_seconds) } : null,
        };
      }),
      audio: s.mixCurrent ? { audio_session_version_id: s.mixCurrent.id, version_number: s.mixCurrent.version_number, scene_seconds: mixSeconds(s.mixCurrent, s.session) } : null,
    }));
  if (!input.length) throw new EditorialNotReadyError("Approve at least one scene's shot plan in Storyboard first — the assembly is cut from approved shots.");
  if (ctx.timeline && ctx.timeline.revision !== req.base_revision) throw new EditorialConflictError("The timeline changed — reload and try again.");
  const r = assemblyTimelineEngine({ fps, scenes: input });
  if (ctx.timeline && ctx.timeline.status !== "locked" && ctx.clips.length) {
    // Rule 11: keep the current cut as a version before replacing it.
    await repo.saveVersion(db, projectId, "Before re-assembly", "auto", runQC(ctx, ctx.clips, clipIssues(ctx, up)));
  }
  const online = r.clips.filter((c) => c.kind === "take").length, offline = r.clips.filter((c) => c.kind === "slug").length;
  // A fresh assembly rebuilds the cut (V1/A1); inserts over the picture (V2) and music (A2) laid by hand are kept.
  await persist(db, ctx, [...r.clips, ...ctx.clips.filter((c) => c.track === "V2" || c.track === "A2")], {
    action: "assemble", summary: `First assembly: ${input.length} scene${input.length === 1 ? "" : "s"}, ${online} picture clip${online === 1 ? "" : "s"}${offline ? `, ${offline} offline` : ""}.`,
    engineVersion: r.engine_version, baseRevision: ctx.timeline ? req.base_revision : null, breakLock: !!req.break_lock,
  });
  return { summary: `Assembled ${input.length} scene${input.length === 1 ? "" : "s"} from approved shots: ${online} picture clip${online === 1 ? "" : "s"}${offline ? `, ${offline} still offline (no approved take)` : ""}.`, rationale: r.rationale };
}

async function resolveSource(db: SupabaseClient, ctx: Ctx, up: Up, op: Extract<EditOperation, { op: "insert" | "overwrite" }>): Promise<EngineClip> {
  const base = { id: null, source_in: 0, record_in: op.at, grade: { exposure: 0, contrast: 0, saturation: 0, temperature: 0 }, transition: { in: "cut", out: "cut", frames: 12 }, take_id: null, audio_session_version_id: null, shot_id: null, asset_id: null, gain_db: 0 } as const;
  if (op.source.kind === "insert_shot") {
    // An insert over the picture (V2): only an approved take — an offline slug over the picture would hide it.
    const info = up.shotInfo.get(op.source.shot_id);
    if (!info) throw new EditorialNotReadyError("That shot isn't in an approved shot plan.");
    const at = up.approvedTake(op.source.shot_id);
    if (!at) throw new EditorialNotReadyError("Approve a take of that shot in Visual Generation first — an insert needs real picture.");
    const frames = takeFrames(at);
    const want = op.duration ?? Math.max(1, F(info.story_end - info.story_start));
    return { ...base, track: "V2", kind: "take", duration: frames === null ? want : Math.min(want, frames), source_frames: frames, scene_id: info.scene_id, shot_id: op.source.shot_id, take_id: at.id, label: up.shotLabel(op.source.shot_id) };
  }
  if (op.source.kind === "music") {
    // Music across scenes (A2): an audio file from the Assets Library, as long as the file (or what was asked for).
    const a = await repo.getAudioAsset(db, ctx.project.id, op.source.asset_id);
    if (!a || a.archived_at) throw new EditorialNotFoundError("That file isn't in this project's Assets Library.");
    if (a.type !== "audio") throw new EditorialNotReadyError("Only an audio file can go on the music track.");
    const secs = Number(a.metadata?.duration_seconds ?? 0);
    if (!(secs > 0)) throw new EditorialNotReadyError("That file's length isn't known — upload it again in the Assets Library.");
    const frames = Math.max(1, Math.floor(secs * fps));
    return { ...base, track: "A2", kind: "music", duration: Math.min(op.duration ?? frames, frames), source_frames: frames, scene_id: null, asset_id: a.id, gain_db: op.source.gain_db ?? -6, label: String(a.name).slice(0, 200) };
  }
  if (op.source.kind === "shot") {
    const info = up.shotInfo.get(op.source.shot_id);
    if (!info) throw new EditorialNotReadyError("That shot isn't in an approved shot plan.");
    const at = up.approvedTake(op.source.shot_id);
    const frames = at ? takeFrames(at) : null;
    const want = op.duration ?? Math.max(1, F(info.story_end - info.story_start));
    const duration = frames === null ? want : Math.min(want, frames);
    const label = up.shotLabel(op.source.shot_id);
    return at
      ? { ...base, track: "V1", kind: "take", duration, source_frames: frames, scene_id: info.scene_id, shot_id: op.source.shot_id, take_id: at.id, label }
      : { ...base, track: "V1", kind: "slug", duration, source_frames: null, scene_id: info.scene_id, shot_id: op.source.shot_id, label: `${label} — no approved take` };
  }
  const sid = op.source.scene_id;
  const row = up.scenes.find((s) => s.scene.id === sid);
  if (!row?.mixCurrent) throw new EditorialNotReadyError("Approve this scene's mix in Audio Studio first.");
  const frames = F(mixSeconds(row.mixCurrent, row.session));
  return { ...base, track: "A1", kind: "audio_mix", duration: Math.min(op.duration ?? frames, frames), source_frames: frames, scene_id: sid, audio_session_version_id: row.mixCurrent.id, label: `Scene ${row.scene.number} mix v${row.mixCurrent.version_number}` };
}

export async function editTimeline(db: SupabaseClient, projectId: string, payload: unknown) {
  const req = validateEditRequest(payload);
  const ctx = await load(db, projectId);
  if (!ctx.timeline) throw new EditorialNotReadyError("Build the first assembly first.");
  if (ctx.timeline.revision !== req.base_revision) throw new EditorialConflictError("The timeline changed — reload and try again.");
  const up = upstream(ctx);
  const op = req.operation;
  let r;
  try {
    r = editDecisionEngine({
      clips: ctx.clips, operation: op,
      new_clip: op.op === "insert" || op.op === "overwrite" ? await resolveSource(db, ctx, up, op) : undefined,
      replacements: op.op === "conform" ? conformReplacements(ctx, up) : undefined,
    });
  } catch (e) {
    if (e instanceof EditRejectedError) throw new EditorialConflictError(e.message);
    throw e;
  }
  await persist(db, ctx, r.clips, { action: op.op, summary: r.summary, engineVersion: r.engine_version, baseRevision: req.base_revision, breakLock: !!req.break_lock });
  return { summary: r.summary };
}

export async function saveTimelineVersion(db: SupabaseClient, projectId: string, payload: unknown) {
  const { label } = validateSaveVersion(payload);
  const ctx = await load(db, projectId);
  if (!ctx.timeline) throw new EditorialNotReadyError("Build the first assembly first.");
  const v = await repo.saveVersion(db, projectId, label, "manual", runQC(ctx, ctx.clips, clipIssues(ctx, upstream(ctx))));
  return { version_number: v.version_number as number, label };
}

export async function restoreTimelineVersion(db: SupabaseClient, projectId: string, versionId: string, payload: unknown) {
  const req = validateRestore(payload);
  const ctx = await load(db, projectId);
  if (!ctx.timeline) throw new EditorialNotReadyError("Build the first assembly first.");
  if (ctx.timeline.revision !== req.base_revision) throw new EditorialConflictError("The timeline changed — reload and try again.");
  const v = /^[0-9a-f-]{36}$/i.test(versionId) ? await repo.getVersion(db, ctx.timeline.id, versionId) : null;
  if (!v) throw new EditorialNotFoundError("That version doesn't exist.");
  if (ctx.timeline.status !== "locked") await repo.saveVersion(db, projectId, `Before restoring v${v.version_number}`, "auto", runQC(ctx, ctx.clips, clipIssues(ctx, upstream(ctx))));
  await persist(db, ctx, (v.clips as Row[]).map(toClipDTO), {
    action: "restore", summary: `Restored version ${v.version_number} — ${v.label}`, engineVersion: editDecision.ENGINE_VERSION, baseRevision: req.base_revision, breakLock: !!req.break_lock,
  });
  // The version's sound automation comes back with it (versions keep a copy since migration 0032).
  const fresh = await repo.getTimeline(db, projectId);
  if (fresh && v.automation && JSON.stringify(v.automation) !== JSON.stringify(fresh.automation ?? {}))
    await repo.saveAutomation(db, projectId, TimelineAutomationSchema.parse(v.automation), fresh.automation_revision);
  return { summary: `Restored version ${v.version_number} (“${v.label}”). The cut before it was kept as a version.` };
}

/** Volume automation of the cut's sound: sound, not picture, so it can change after Picture Lock (stale → 409). */
export async function saveAutomation(db: SupabaseClient, projectId: string, payload: unknown) {
  const req = validateAutomation(payload);
  await assertProjectAccess(db, projectId);
  const t = await repo.saveAutomation(db, projectId, req.automation, req.base_revision);
  return { automation: TimelineAutomationSchema.parse(t.automation ?? {}), automation_revision: t.automation_revision as string, points: req.automation.A1.length };
}

export async function lockPicture(db: SupabaseClient, projectId: string, payload: unknown) {
  const { base_revision } = validateLock(payload);
  const ctx = await load(db, projectId);
  if (!ctx.timeline) throw new EditorialNotReadyError("Build the first assembly first.");
  const qc = runQC(ctx, ctx.clips, clipIssues(ctx, upstream(ctx)));
  if (!qc.ready_for_lock) {
    const failing = qc.checks.filter((c) => c.blocking && !c.ok);
    throw new EditorialNotReadyError(`Not ready for Picture Lock: ${failing.map((f) => f.label.toLowerCase()).join("; ")}.`, failing);
  }
  const l = await repo.lockPicture(db, projectId, base_revision, qc);
  return { lock_number: l.lock_number as number };
}

export async function exportEdl(db: SupabaseClient, projectId: string) {
  const ctx = await load(db, projectId);
  if (!ctx.timeline || !ctx.clips.length) throw new EditorialNotReadyError("There's nothing on the timeline to export yet.");
  const r = edlExportEngine({ title: ctx.project.title, fps, clips: ctx.clips });
  const slug = ctx.project.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 60) || "timeline";
  return { filename: `${slug}.edl`, text: r.edl };
}
