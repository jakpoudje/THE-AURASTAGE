// apps/api/src/modules/generation/generation.service.ts
// Domain workflow for Visual Generation (SRS §10).
// 1. Compile a GenerationPackage for a shot of an APPROVED shot plan version,
//    from the locked Scene DNA version + Casting + Dialogue (promptCompilerEngine).
// 2. Queue Takes (MOS jobs); the generation worker calls the Provider Gateway
//    (rule 8) — this service never calls a provider.
// 3. Compare and explicitly approve Takes. Upstream changes mark packages
//    stale / review_required with a reason; nothing is deleted.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProviderId, ProviderStatus } from "@aurastage/contracts";
import { promptCompiler, promptCompilerEngine } from "@aurastage/engines";
import { getAdapter, providerStatuses } from "../../providers";
import { mediaConfigured, signedMediaUrl } from "../../storage/media";
// Storyboard owns plan review state; we ask it to refresh (it refreshes Scene DNA first).
import { refreshShotPlanReview } from "../shots/shots.service";
// Project Settings owns the look, default frame shape/providers and the paid-take cap; Generation reads them.
import { readProjectSettings } from "../settings/settings.read";
import { assertPackageAccess, assertProjectAccess, assertTakeAccess } from "./generation.permissions";
import * as repo from "./generation.repository";
import { toTakeDTO } from "./generation.mapper";
import { GenerationNotFoundError, GenerationNotReadyError, GenerationValidationError, validateCompile, validateRequestTakes } from "./generation.validator";

export const COMPILER_ENGINE_VERSION = promptCompiler.ENGINE_VERSION;
type Row = Record<string, any>;
type Env = Record<string, string | undefined>;

async function takeDTO(t: Row, env: Env) {
  const url = t.status === "succeeded" && t.storage_key && mediaConfigured(env) ? await signedMediaUrl(t.storage_key, 3600, env) : null;
  return toTakeDTO(t, url);
}

function planUsable(plan: Row) {
  return plan.status === "approved" && plan.review_state === "current" && !!plan.approved_version_id;
}

const norm = (s: unknown) => (typeof s === "string" ? s.trim() : "") || null;

function packageReview(pkg: Row, plan: Row, versionNumber: number | null, look: string | null): { state: string; reason: string | null } {
  if (pkg.shot_plan_version_id !== plan.approved_version_id) {
    return { state: "stale", reason: `The shot plan was approved again${versionNumber ? ` (now version ${versionNumber})` : ""} after this was compiled.` };
  }
  if (plan.review_state !== "current") return { state: "review_required", reason: `The shot plan needs review. ${plan.review_reason ?? ""}`.trim() };
  if (plan.status !== "approved") return { state: "review_required", reason: "The shot plan has edits that aren't approved yet." };
  // Upstream Project Settings change (rule 11): flag, never recompile or delete.
  if (norm((pkg.content as Row)?.project?.look) !== norm(look)) {
    return { state: "review_required", reason: "The project's visual style changed in Project Settings after this prompt was compiled — recompile to apply it." };
  }
  return { state: "current", reason: null };
}

export async function getVisualWorkspace(db: SupabaseClient, projectId: string, env: Env = process.env) {
  await assertProjectAccess(db, projectId);
  await refreshShotPlanReview(db, projectId);
  const [current, paidUsed] = await Promise.all([readProjectSettings(db, projectId), repo.paidTakesThisMonth(db, projectId)]);
  const look = norm(current.settings.style.look);
  const [scenes, plans, versions, packages, takes] = await Promise.all([
    repo.listScenes(db, projectId),
    repo.listPlans(db, projectId),
    repo.listPlanVersions(db, projectId),
    repo.listPackages(db, projectId),
    repo.listTakes(db, projectId),
  ]);
  const versionById = new Map(versions.map((v) => [v.id as string, v]));

  const lastResults: Partial<Record<ProviderId, ProviderStatus["last_result"]>> = {};
  for (const t of [...takes].filter((x) => x.completed_at && (x.status === "succeeded" || x.status === "failed")).sort((a, b) => String(a.completed_at).localeCompare(String(b.completed_at)))) {
    lastResults[t.provider as ProviderId] = { status: t.status, at: t.completed_at, message: t.status === "failed" ? t.error : null };
  }

  const out = [];
  for (const scene of scenes) {
    const plan = plans.find((p) => p.scene_id === scene.id);
    const version = plan?.approved_version_id ? versionById.get(plan.approved_version_id) : undefined;
    if (!plan || !version) continue;
    const shots = [];
    for (const shot of (version.shots as Row[]) ?? []) {
      let pkg = packages.find((p) => p.shot_id === shot.id) ?? null;
      if (pkg) {
        const r = packageReview(pkg, plan, version.version_number, look);
        if (pkg.review_state !== r.state || (pkg.review_reason ?? null) !== r.reason) pkg = await repo.setPackageReview(db, pkg.id, r.state, r.reason);
      }
      const shotTakes = await Promise.all(takes.filter((t) => t.shot_id === shot.id).map((t) => takeDTO(t, env)));
      shots.push({
        shot: {
          id: shot.id, ordinal: shot.ordinal, purpose: shot.purpose, size: shot.size, angle: shot.angle, movement: shot.movement,
          lens_mm: shot.lens_mm, focus: shot.focus, duration_seconds: Number(shot.duration_seconds), description: shot.description,
          composition: shot.composition, character_ids: shot.character_ids ?? [], dialogue_line_ids: shot.dialogue_line_ids ?? [],
        },
        package: pkg
          ? { id: pkg.id, content: pkg.content, review_state: pkg.review_state, review_reason: pkg.review_reason, engine_version: pkg.engine_version, created_at: pkg.created_at }
          : null,
        takes: shotTakes,
        approved_take_id: shotTakes.find((t) => t.approval === "approved")?.id ?? null,
      });
    }
    out.push({
      scene: { id: scene.id, number: scene.number, heading: scene.heading },
      plan: { id: plan.id, version_number: version.version_number, usable: planUsable(plan), status: plan.status, review_state: plan.review_state, review_reason: plan.review_reason },
      shots,
    });
  }
  const all = out.flatMap((s) => s.shots);
  return {
    providers: providerStatuses(env, lastResults),
    defaults: {
      aspect_ratio: current.settings.technical.aspect_ratio,
      image_provider: current.settings.generation.default_image_provider,
      video_provider: current.settings.generation.default_video_provider,
    },
    budget: { monthly_paid_take_limit: current.settings.generation.monthly_paid_take_limit, used_this_month: paidUsed },
    media_ready: mediaConfigured(env),
    queue: { waiting: takes.filter((t) => t.status === "queued").length, running: takes.filter((t) => t.status === "running").length },
    scenes: out,
    summary: {
      scenes: out.length,
      shots: all.length,
      with_approved_take: all.filter((s) => s.approved_take_id).length,
      takes: takes.length,
    },
  };
}

export async function compileShot(db: SupabaseClient, projectId: string, shotId: string, payload: unknown) {
  const { aspect_ratio } = validateCompile(payload);
  await assertProjectAccess(db, projectId);
  await refreshShotPlanReview(db, projectId);
  const [project, scenes, plans, versions] = await Promise.all([
    repo.getProject(db, projectId), repo.listScenes(db, projectId), repo.listPlans(db, projectId), repo.listPlanVersions(db, projectId),
  ]);
  const version = versions.find((v) => (v.shots as Row[]).some((s) => s.id === shotId) && plans.some((p) => p.approved_version_id === v.id));
  if (!version) throw new GenerationNotFoundError("That shot is not in an approved shot plan.");
  const plan = plans.find((p) => p.id === version.plan_id)!;
  if (!planUsable(plan)) throw new GenerationNotReadyError(plan.review_reason ?? "Approve this scene's shot plan again first — it has changes.");
  const scene = scenes.find((s) => s.id === plan.scene_id)!;
  const shot = (version.shots as Row[]).find((s) => s.id === shotId)!;
  const current = await readProjectSettings(db, projectId);
  const [dna, scriptVersionId, chars, looks, lines] = await Promise.all([
    repo.getDnaVersion(db, version.scene_dna_version_id), repo.getScriptVersionId(db, projectId), repo.listCharacters(db, projectId),
    repo.listLooks(db, projectId), repo.listLines(db, projectId),
  ]);
  const editable = ((dna?.content as Row)?.editable ?? {}) as Row;
  const wardrobe = (editable.wardrobe ?? {}) as Record<string, string>;
  const lookText = (charId: string) => {
    const l = looks.find((x) => x.id === wardrobe[charId]);
    return l ? [l.name, l.description].filter(Boolean).join(": ") : null;
  };
  const { package: content, engine_version } = promptCompilerEngine({
    project: {
      title: project!.title, genre: project!.genre ?? null, tone: project!.tone ?? null, setting: project!.setting ?? null, time_period: project!.time_period ?? null,
      look: norm(current.settings.style.look),
    },
    scene: {
      number: scene.number, heading: scene.heading, location: scene.location, int_ext: scene.int_ext, time_of_day: scene.time_of_day,
      purpose: editable.purpose ?? null, mood: editable.mood ?? [], weather: editable.weather ?? null, atmosphere: editable.atmosphere ?? null,
      lighting_intent: editable.lighting_intent ?? null,
    },
    shot: {
      id: shot.id, size: shot.size, angle: shot.angle, movement: shot.movement, focus: shot.focus, lens_mm: shot.lens_mm,
      duration_seconds: Number(shot.duration_seconds), description: shot.description, composition: shot.composition ?? null,
      lighting: shot.lighting ?? null, character_ids: shot.character_ids ?? [], dialogue_line_ids: shot.dialogue_line_ids ?? [],
    },
    characters: chars.filter((c) => (shot.character_ids ?? []).includes(c.id)).map((c) => ({ id: c.id, name: c.name, age: c.age ?? null, description: c.description ?? null, wardrobe: lookText(c.id) })),
    dialogue: lines.filter((l) => (shot.dialogue_line_ids ?? []).includes(l.id)).map((l) => ({ id: l.id, speaker: l.speaker_name, text: l.text, emotion: l.emotion ?? null })),
    aspect_ratio,
    provenance: {
      shot_plan_version_id: version.id, scene_dna_version_id: version.scene_dna_version_id, script_version_id: scriptVersionId,
      settings_version: current.version_number || null,
    },
  });
  const pkg = await repo.createPackage(db, { projectId, sceneId: scene.id, shotId, planVersionId: version.id, content, engineVersion: engine_version });
  return { package_id: pkg.id, checks: content.checks, prompt: content.prompt };
}

export async function requestTakes(db: SupabaseClient, packageId: string, payload: unknown, idempotencyKey: string | null, env: Env = process.env) {
  const input = validateRequestTakes(payload);
  await assertPackageAccess(db, packageId);
  const adapter = getAdapter(input.provider)!;
  const model = adapter.models.find((m) => m.id === input.model);
  if (!model || model.capability !== input.capability) throw new GenerationValidationError([], `${adapter.name} doesn't offer that model for ${input.capability === "video" ? "video" : "images"}.`);
  if (!adapter.isConfigured(env)) throw new GenerationNotReadyError(`${adapter.name} isn't connected yet — its API key hasn't been added to the server.`);
  if (!mediaConfigured(env)) throw new GenerationNotReadyError("Media storage isn't set up on the server yet.");
  if (input.capability === "video" && !input.source_take_id) throw new GenerationNotReadyError("Pick a finished image take of this shot to start the video from.");
  const created = await repo.requestTakes(db, {
    packageId,
    provider: input.provider,
    model: input.model,
    capability: input.capability,
    params: { aspect_ratio: input.aspect_ratio, duration_seconds: input.duration_seconds },
    seed: input.seed,
    variations: input.variations,
    sourceTakeId: input.source_take_id,
    idempotencyKey: idempotencyKey && /^[A-Za-z0-9_-]{8,80}$/.test(idempotencyKey) ? idempotencyKey : null,
  });
  return { takes: await Promise.all((created ?? []).map((t) => takeDTO(t, env))) };
}

const APPROVAL: Record<string, string> = { approve: "approved", reject: "rejected", reopen: "pending" };
export async function setTakeApproval(db: SupabaseClient, takeId: string, action: string, env: Env = process.env) {
  if (!APPROVAL[action]) throw new GenerationValidationError([], "Unknown action");
  await assertTakeAccess(db, takeId);
  return takeDTO(await repo.setApproval(db, takeId, APPROVAL[action]), env);
}

export async function cancelTake(db: SupabaseClient, takeId: string, env: Env = process.env) {
  await assertTakeAccess(db, takeId);
  return takeDTO(await repo.cancelTake(db, takeId), env);
}
