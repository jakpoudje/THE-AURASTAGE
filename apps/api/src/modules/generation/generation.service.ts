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
import { promptCompiler, promptCompilerEngine, propContinuityEngine } from "@aurastage/engines";
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

export function planUsable(plan: Row) {
  return plan.status === "approved" && plan.review_state === "current" && !!plan.approved_version_id;
}

export const norm = (s: unknown) => (typeof s === "string" ? s.trim() : "") || null;

/** Current revision of every Locations & Props record (archived ones count as gone). */
export type WorldRevisions = Map<string, { name: string; revision: number }>;
export function packageReview(pkg: Row, plan: Row, versionNumber: number | null, look: string | null, world: WorldRevisions = new Map()): { state: string; reason: string | null } {
  if (pkg.shot_plan_version_id !== plan.approved_version_id) {
    return { state: "stale", reason: `The shot plan was approved again${versionNumber ? ` (now version ${versionNumber})` : ""} after this was compiled.` };
  }
  if (plan.review_state !== "current") return { state: "review_required", reason: `The shot plan needs review. ${plan.review_reason ?? ""}`.trim() };
  if (plan.status !== "approved") return { state: "review_required", reason: "The shot plan has edits that aren't approved yet." };
  // Upstream Project Settings change (rule 11): flag, never recompile or delete.
  if (norm((pkg.content as Row)?.project?.look) !== norm(look)) {
    return { state: "review_required", reason: "The project's visual style changed in Project Settings after this prompt was compiled — recompile to apply it." };
  }
  // A location or prop used by the prompt was edited (or archived) in Locations & Props (rule 11: flag, never rewrite).
  const used = ((pkg.content as Row)?.provenance?.world_revisions ?? {}) as Record<string, number>;
  const names = new Map<string, string>([
    ...((((pkg.content as Row)?.world?.location ? [(pkg.content as Row).world.location] : []) as Row[]).map((x) => [x.id, x.name] as [string, string])),
    ...((((pkg.content as Row)?.world?.props ?? []) as Row[]).map((x) => [x.id, x.name] as [string, string])),
  ]);
  const changed = Object.entries(used).filter(([id, rev]) => world.get(id)?.revision !== rev).map(([id]) => world.get(id)?.name ?? names.get(id) ?? "A location or prop");
  if (changed.length) {
    return { state: "review_required", reason: `${changed.join(", ")} changed in Locations & Props after this prompt was compiled — recompile to apply it.` };
  }
  return { state: "current", reason: null };
}

export async function getVisualWorkspace(db: SupabaseClient, projectId: string, env: Env = process.env, opts: { sign?: boolean } = {}) {
  await assertProjectAccess(db, projectId);
  await refreshShotPlanReview(db, projectId);
  const [current, paidUsed] = await Promise.all([readProjectSettings(db, projectId), repo.paidTakesThisMonth(db, projectId)]);
  const look = norm(current.settings.style.look);
  const [scenes, plans, versions, packages, takes] = await Promise.all([
    repo.listScenes(db, projectId),
    repo.listPlans(db, projectId),
    repo.listPlanVersions(db, projectId),
    repo.listPackageHeads(db, projectId),
    repo.listTakes(db, projectId),
  ]);
  const worldItems = await repo.listWorldItems(db, projectId);
  const world: WorldRevisions = new Map([...worldItems.locations, ...worldItems.props].filter((x) => !x.archived_at).map((x) => [x.id as string, { name: x.name as string, revision: Number(x.revision) }]));
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
        const r = packageReview(pkg, plan, version.version_number, look, world);
        if (pkg.review_state !== r.state || (pkg.review_reason ?? null) !== r.reason) pkg = await repo.setPackageReview(db, pkg.id, r.state, r.reason);
      }
      // Counts-only callers (the Dashboard overview) skip signing a media link for every take.
      const shotTakes = await Promise.all(takes.filter((t) => t.shot_id === shot.id).map((t) => (opts.sign === false ? toTakeDTO(t, null) : takeDTO(t, env))));
      shots.push({
        shot: {
          id: shot.id, ordinal: shot.ordinal, purpose: shot.purpose, size: shot.size, angle: shot.angle, movement: shot.movement,
          lens_mm: shot.lens_mm, focus: shot.focus, duration_seconds: Number(shot.duration_seconds), description: shot.description,
          composition: shot.composition, character_ids: shot.character_ids ?? [], dialogue_line_ids: shot.dialogue_line_ids ?? [],
        },
        package: pkg
          // The prompt text is fetched per shot (GET /api/visual/packages/:id) — the list stays light on long films.
          ? { id: pkg.id, content: null, review_state: pkg.review_state, review_reason: pkg.review_reason, engine_version: pkg.engine_version, created_at: pkg.created_at }
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

/**
 * Everything the prompt compiler reads for a project, loaded once (2026-10-02: "Compile every shot's prompt" read the
 * whole project again for every shot — 69 shots took over 80 s and the request was cut off). Per-scene data (the locked
 * Scene DNA version, the scene's Locations & Props, the script's elements) is cached the first time a scene needs it.
 */
export async function loadCompileContext(db: SupabaseClient, projectId: string) {
  const [project, scenes, plans, versions, current, scriptVersionId, chars, looks, lines, ageStates, worldItems, worldRefs, charRefs, propApps] = await Promise.all([
    repo.getProject(db, projectId), repo.listScenes(db, projectId), repo.listPlans(db, projectId), repo.listPlanVersions(db, projectId),
    readProjectSettings(db, projectId), repo.getScriptVersionId(db, projectId), repo.listCharacters(db, projectId),
    repo.listLooks(db, projectId), repo.listLines(db, projectId), repo.listAgeStates(db, projectId),
    repo.listWorldItems(db, projectId), repo.listWorldRefs(db, projectId), repo.listCharacterRefs(db, projectId), repo.listPropAppearances(db, projectId),
  ]);
  const memo = <T,>(m: Map<string, Promise<T>>, k: string, f: () => Promise<T>) => (m.has(k) ? m.get(k)! : (m.set(k, f()), m.get(k)!));
  const dnaM = new Map<string, Promise<Row | null>>(), appM = new Map<string, Promise<Row[]>>(), elM = new Map<string, Promise<{ index: number; type: string; text: string }[]>>();
  return {
    projectId, project, scenes, plans, versions, current, scriptVersionId, chars, looks, lines, ageStates, worldItems, worldRefs, charRefs, propApps,
    dna: (id: string) => memo(dnaM, id, () => repo.getDnaVersion(db, id) as Promise<Row | null>),
    appearances: (sceneId: string) => memo(appM, sceneId, () => repo.listSceneAppearances(db, sceneId) as Promise<Row[]>),
    elements: (versionId: string) => memo(elM, versionId, () => repo.getScriptElements(db, versionId) as Promise<{ index: number; type: string; text: string }[]>),
  };
}
export type CompileContext = Awaited<ReturnType<typeof loadCompileContext>>;

/** One compiled package with its full prompt (the Visual page asks for the shot being viewed). */
export async function getPackageDetail(db: SupabaseClient, packageId: string) {
  await assertPackageAccess(db, packageId);
  const pkg = await repo.getPackage(db, packageId);
  if (!pkg) throw new GenerationNotFoundError("Package not found");
  return { id: pkg.id, shot_id: pkg.shot_id, content: pkg.content, review_state: pkg.review_state, review_reason: pkg.review_reason, engine_version: pkg.engine_version, created_at: pkg.created_at };
}

export async function compileShot(db: SupabaseClient, projectId: string, shotId: string, payload: unknown) {
  const { aspect_ratio } = validateCompile(payload);
  await assertProjectAccess(db, projectId);
  await refreshShotPlanReview(db, projectId);
  return compileWithContext(db, await loadCompileContext(db, projectId), shotId, aspect_ratio);
}

/** Compiles and saves one shot's package from a loaded context (same checks as the single-shot button). */
export async function compileWithContext(db: SupabaseClient, ctx: CompileContext, shotId: string, aspect_ratio: string) {
  const { projectId, project, scenes, plans, versions, current, scriptVersionId, chars, looks, lines, ageStates, worldItems, worldRefs, charRefs, propApps } = ctx;
  const version = versions.find((v) => (v.shots as Row[]).some((s) => s.id === shotId) && plans.some((p) => p.approved_version_id === v.id));
  if (!version) throw new GenerationNotFoundError("That shot is not in an approved shot plan.");
  const plan = plans.find((p) => p.id === version.plan_id)!;
  if (!planUsable(plan)) throw new GenerationNotReadyError(plan.review_reason ?? "Approve this scene's shot plan again first — it has changes.");
  const scene = scenes.find((s) => s.id === plan.scene_id)!;
  const shot = (version.shots as Row[]).find((s) => s.id === shotId)!;
  const dna = await ctx.dna(version.scene_dna_version_id as string);
  const editable = ((dna?.content as Row)?.editable ?? {}) as Row;
  const wardrobe = (editable.wardrobe ?? {}) as Record<string, string>;
  // The age each character is in this scene, as locked in Scene DNA (flashbacks, time jumps; migration 0035).
  // Ages stay with the character they were made for; after a merge they follow it, as Scene DNA does.
  const follow = (id: string) => {
    let c = chars.find((x) => x.id === id);
    for (let i = 0; i < 10 && c?.merged_into; i++) c = chars.find((x) => x.id === c!.merged_into) ?? c;
    return (c?.id as string) ?? id;
  };
  const ageOf = (cid: string) => {
    const id = ((editable.ages ?? {}) as Record<string, string>)[cid];
    return id ? ageStates.find((a) => a.id === id && follow(a.character_id) === cid) ?? null : null;
  };
  // Locations & Props for this scene, and finished reference images (consistency from the first frame to the last).
  const appearances = await ctx.appearances(scene.id as string);
  const here = (type: string) => new Set(appearances.filter((a) => a.object_type === type).map((a) => a.object_id as string));
  const loc = worldItems.locations.find((l) => here("location").has(l.id) && !l.archived_at) ?? null;
  const props = worldItems.props.filter((x) => here("prop").has(x.id) && !x.archived_at);
  // Each prop's state in this scene, from the script's continuity (Locations & Props lines): "Laptop — broken".
  const continuity = propContinuityEngine({ props: props.map((x) => ({ id: x.id as string, name: String(x.name), appearances: propApps.filter((a) => a.object_id === x.id).map((a) => ({ scene_number: Number(a.scene_number), evidence: String(a.evidence ?? "").slice(0, 4000) })) })) });
  const propState = new Map((continuity.set_dressing.find((d) => d.scene_number === Number(scene.number))?.items ?? []).map((it) => [it.prop_id, it.state]));
  const tod = String(scene.time_of_day ?? "").toUpperCase();
  const pickRef = (type: string, id: string, prefer: string[]) => {
    const mine = worldRefs.filter((r) => r.object_type === type && r.object_id === id && r.asset_id);
    for (const v of prefer) { const hit = mine.find((r) => r.view_key === v); if (hit) return hit; }
    return mine[0] ?? null;
  };
  const references: Row[] = [];
  for (const cid of (shot.character_ids ?? []) as string[]) {
    const c = chars.find((x) => x.id === cid);
    // Only views made at this scene's age (a flashback never borrows the adult face, and vice versa).
    const st = ageOf(cid);
    const mine = charRefs.filter((r) => follow(r.character_id) === cid && r.asset_id && (r.age_state_id ?? null) === (st?.id ?? null));
    // Prefer the look chosen for this scene, then a front medium shot.
    const ref = mine.find((r) => r.look_id && r.look_id === wardrobe[cid] && r.angle === "front") ?? mine.find((r) => r.angle === "front" && r.size === "MS") ?? mine.find((r) => r.angle === "front") ?? mine[0];
    if (c && ref) references.push({ kind: "character", object_id: cid, name: c.name, view: `${ref.angle} · ${ref.size}`, asset_id: ref.asset_id });
  }
  if (loc) {
    const ref = pickRef("location", loc.id, [`wide:${tod}`, `establishing:${tod}`, `medium:${tod}`, "wide", "establishing"]);
    if (ref) references.push({ kind: "location", object_id: loc.id, name: loc.name, view: String(ref.view_key).replace(":", " · "), asset_id: ref.asset_id });
  }
  for (const pr of props) {
    const ref = pickRef("prop", pr.id, ["hero", "three_quarter"]);
    if (ref) references.push({ kind: "prop", object_id: pr.id, name: pr.name, view: String(ref.view_key), asset_id: ref.asset_id });
  }
  // 2.0.0 (realism R1): the script's own action around this shot, screen direction kept from the master, and the
  // shots before and after it.
  const srcVersion = (scene.source_version_id as string | null) ?? (scriptVersionId as string | null);
  const elements = srcVersion ? await ctx.elements(srcVersion) : [];
  const lineIdx = lines.filter((l) => (shot.dialogue_line_ids ?? []).includes(l.id)).map((l) => Number(l.element_index)).filter((n) => Number.isFinite(n));
  const script_action = elements.length && scene.element_start !== null && scene.element_start !== undefined
    ? promptCompiler.scriptActionForShot({ elements, scene: { start: Number(scene.element_start), end: Number(scene.element_end) }, lineElementIndexes: lineIdx, purpose: (shot.purpose as string) ?? null })
    : [];
  const planShots = (version.shots as Row[]).map((x) => ({ id: x.id, ordinal: Number(x.ordinal), purpose: x.purpose ?? null, size: x.size ?? null, description: x.description ?? null, character_ids: x.character_ids ?? [], dialogue_line_ids: x.dialogue_line_ids ?? [] }));
  const screen = promptCompiler.screenDirection(planShots);
  const around = promptCompiler.neighbours(planShots, shotId, promptCompiler.SIZE_WORDS);
  // The location's sub-area when the scene heading names it ("INT. KUNLE'S HOME - KITCHEN - MORNING").
  const area = loc ? (((loc.areas as string[] | null) ?? []).find((a) => new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(String(scene.heading))) ?? null) : null;
  const lookText = (charId: string) => {
    const l = looks.find((x) => x.id === wardrobe[charId]);
    return l ? [l.name, l.description].filter(Boolean).join(": ") : null;
  };
  const { package: content, engine_version } = promptCompilerEngine({
    project: {
      title: project!.title, genre: project!.genre ?? null, tone: project!.tone ?? null, setting: project!.setting ?? null, time_period: project!.time_period ?? null,
      look: norm(current.settings.style.look), subgenre: project!.subgenre ?? null,
    },
    scene: {
      number: scene.number, heading: scene.heading, location: scene.location, int_ext: scene.int_ext, time_of_day: scene.time_of_day,
      purpose: editable.purpose ?? null, mood: editable.mood ?? [], weather: editable.weather ?? null, atmosphere: editable.atmosphere ?? null,
      lighting_intent: editable.lighting_intent ?? null,
      stakes: editable.stakes ?? null, story_time: editable.story_time ?? null, continuity_notes: editable.continuity_notes ?? null,
      silent: !!editable.silent_scene, area,
    },
    script_action,
    continuity: { screen: Object.fromEntries(Object.entries(screen).filter(([id]) => (shot.character_ids ?? []).includes(id))), previous: around.previous, next: around.next },
    shot: {
      id: shot.id, size: shot.size, angle: shot.angle, movement: shot.movement, focus: shot.focus, lens_mm: shot.lens_mm,
      duration_seconds: Number(shot.duration_seconds), description: shot.description, composition: shot.composition ?? null,
      lighting: shot.lighting ?? null, character_ids: shot.character_ids ?? [], dialogue_line_ids: shot.dialogue_line_ids ?? [],
      support: shot.support ?? null, transition_in: shot.transition_in ?? null, purpose: shot.purpose ?? null,
    },
    characters: chars.filter((c) => (shot.character_ids ?? []).includes(c.id)).map((c) => {
      const st = ageOf(c.id);
      return {
        id: c.id, name: c.name, age: st ? st.age : c.age ?? null, description: c.description ?? null, wardrobe: lookText(c.id), gender: c.gender ?? null,
        nationality: c.nationality ?? null, accent: c.accent ?? null, languages: c.languages ?? null, physicality: c.physicality ?? null, personality: c.personality ?? null,
        age_state: st ? { id: st.id, label: st.label, description: st.description ?? null } : null,
      };
    }),
    dialogue: lines.filter((l) => (shot.dialogue_line_ids ?? []).includes(l.id)).map((l) => ({ id: l.id, speaker: l.speaker_name, text: l.text, emotion: l.emotion ?? null,
      character_id: l.character_id ?? null, intensity: l.intensity ?? null, intention: l.intention ?? null, subtext: l.subtext ?? null, parenthetical: l.parenthetical ?? null,
      estimated_seconds: l.estimated_seconds === null || l.estimated_seconds === undefined ? null : Number(l.estimated_seconds) })),
    location: loc ? { id: loc.id, name: loc.name, description: loc.description ?? "", revision: Number(loc.revision) } : null,
    props: props.map((x) => ({ id: x.id, name: x.name, description: x.description ?? "", category: x.category ?? "prop", revision: Number(x.revision), state: propState.get(x.id) ?? null,
      descriptors: Array.isArray(x.descriptors) ? (x.descriptors as unknown[]).map(String).slice(0, 8) : [] })),
    references,
    aspect_ratio,
    provenance: {
      shot_plan_version_id: version.id, scene_dna_version_id: version.scene_dna_version_id, script_version_id: scriptVersionId,
      settings_version: current.version_number || null,
    },
  });
  const pkg = await repo.createPackage(db, { projectId, sceneId: scene.id, shotId, planVersionId: version.id, content, engineVersion: engine_version });
  return { package_id: pkg.id, checks: content.checks, prompt: content.prompt };
}

/** `opts.batch`: part of a whole-film run — queued behind anyone's own requests and bounded per project (migration 0055). */
export async function requestTakes(db: SupabaseClient, packageId: string, payload: unknown, idempotencyKey: string | null, env: Env = process.env, opts: { batch?: boolean } = {}) {
  const input = validateRequestTakes(payload);
  await assertPackageAccess(db, packageId);
  const adapter = getAdapter(input.provider)!;
  const model = adapter.models.find((m) => m.id === input.model);
  if (!model || model.capability !== input.capability) throw new GenerationValidationError([], `${adapter.name} doesn't offer that model for ${input.capability === "video" ? "video" : "images"}.`);
  if (!adapter.isConfigured(env)) throw new GenerationNotReadyError(`${adapter.name} isn't connected yet — its API key hasn't been added to the server.`);
  if (!mediaConfigured(env)) throw new GenerationNotReadyError("Media storage isn't set up on the server yet.");
  if (input.capability === "video" && adapter.videoNeedsFrame && !input.source_take_id) throw new GenerationNotReadyError(`${adapter.name} video starts from a finished image take of this shot — pick one to start from.`);
  const created = await repo.requestTakes(db, {
    packageId,
    provider: input.provider,
    model: input.model,
    capability: input.capability,
    params: { aspect_ratio: input.aspect_ratio, duration_seconds: input.duration_seconds, ...(opts.batch ? { batch: true } : {}) },
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
