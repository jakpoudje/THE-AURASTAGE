// apps/api/src/modules/scene-dna/sceneDna.service.ts
// Domain workflow for Scene DNA (SRS §8.1, §14).
// 1. Materialise each scene's inputs from canonical upstream records.
// 2. Run sceneDnaAssemblyEngine -> proposal + readiness predicates.
// 3. Compute the current dependency refs (with content fingerprints) and compare
//    them with the refs frozen in the approved version (production graph);
//    persist review_required / stale evidence. Nothing is ever deleted.
import type { SupabaseClient } from "@supabase/supabase-js";
import { ScreenplayElementSchema } from "@aurastage/contracts";
import type { SceneDnaDrift, SceneDnaEditable } from "@aurastage/contracts";
import { dialogueExtraction, sceneDnaAssembly, sceneDnaAssemblyEngine, storyTimeCueEngine } from "@aurastage/engines";
import type { SceneDnaProposal } from "@aurastage/engines";
import { computeDrift, descendantState } from "@aurastage/production-graph";
import type { DependencyRef, Drift } from "@aurastage/production-graph";
import { z } from "zod";
import { assertProjectAccess, assertSceneInProject } from "./sceneDna.permissions";
import * as repo from "./sceneDna.repository";
import { toEditable, toRecordDTO } from "./sceneDna.mapper";
import { SceneDnaNotReadyError, validateUpdateSceneDnaInput } from "./sceneDna.validator";

export const ASSEMBLY_ENGINE_VERSION = sceneDnaAssembly.ENGINE_VERSION;
const fp = (...parts: unknown[]) => dialogueExtraction.hash53(JSON.stringify(parts));

type Row = Record<string, any>;

interface Upstream {
  version: { id: string; version_number: number; elements: z.infer<typeof ScreenplayElementSchema>[] } | null;
  scenes: Row[];
  chars: Map<string, Row>;
  follow: (id: string) => string;
  apps: Row[];
  looks: Row[];
  ages: Row[];
  lines: Row[];
  records: Map<string, Row>;
  versions: Map<string, Row>;
}

async function loadUpstream(db: SupabaseClient, projectId: string): Promise<Upstream> {
  const [version, scenes, chars, apps, looks, lines, records, versions, ages] = await Promise.all([
    repo.getApprovedVersion(db, projectId),
    repo.listScenes(db, projectId),
    repo.listCharacters(db, projectId),
    repo.listAppearances(db, projectId),
    repo.listLooks(db, projectId),
    repo.listLines(db, projectId),
    repo.listSceneDna(db, projectId),
    repo.listVersions(db, projectId),
    repo.listAgeStates(db, projectId),
  ]);
  const byId = new Map(chars.map((c) => [c.id as string, c]));
  const follow = (id: string) => {
    let c = byId.get(id);
    for (let i = 0; i < 10 && c?.merged_into; i++) c = byId.get(c.merged_into) ?? c;
    return (c?.id as string) ?? id;
  };
  return {
    version: version ? { ...version, elements: z.array(ScreenplayElementSchema).parse(version.elements) } : null,
    scenes,
    chars: byId,
    follow,
    apps,
    looks,
    ages,
    lines,
    records: new Map(records.map((r) => [r.scene_id as string, r])),
    versions: new Map(versions.map((v) => [v.id as string, v])),
  };
}

function actionOf(u: Upstream, scene: Row) {
  const elements = u.version?.elements ?? [];
  return scene.status === "active"
    ? elements
        .filter((e) => e.index >= scene.element_start && e.index <= scene.element_end && e.type === "action")
        .map((e) => ({ line: e.line, text: e.text }))
    : [];
}

/** Builds one scene's engine input and its current dependency refs. */
function assembleScene(u: Upstream, scene: Row, editable: SceneDnaEditable) {
  const active = u.scenes.filter((s) => s.status === "active");
  const pos = active.indexOf(scene);
  const adj = (s: Row | undefined) =>
    s ? { number: s.number, heading: s.heading, location: s.location, time_of_day: s.time_of_day, int_ext: s.int_ext } : null;

  const action = actionOf(u, scene);

  // Participants: Casting appearances for this scene, merge-followed and de-duplicated.
  const part = new Map<string, { voice_only: boolean; speaking: boolean; line_count: number }>();
  for (const a of u.apps) {
    if (a.scene_id !== scene.id) continue;
    const id = u.follow(a.character_id);
    const prev = part.get(id);
    part.set(id, {
      voice_only: prev ? prev.voice_only && a.voice_only : a.voice_only,
      speaking: (prev?.speaking ?? false) || a.speaking,
      line_count: (prev?.line_count ?? 0) + (a.line_count ?? 0),
    });
  }
  const participants = [...part.entries()]
    .map(([id, p]) => ({ c: u.chars.get(id), ...p, id }))
    .filter((p) => p.c && !p.c.merged_into)
    .map((p) => ({
      character_id: p.id,
      name: p.c!.name,
      kind: p.c!.kind,
      status: p.c!.status,
      voice_only: p.voice_only,
      speaking: p.speaking,
      line_count: p.line_count,
    }));

  const lines = u.lines.filter((l) => l.scene_id === scene.id && l.status === "active");
  const dialogue = lines.map((l) => ({
    id: l.id,
    speaker: l.speaker_name,
    character_id: l.character_id ? u.follow(l.character_id) : null,
    emotion: l.emotion,
    intensity: l.intensity,
    approval: l.approval,
    review_state: l.review_state,
  }));
  const participantIds = new Set(participants.map((p) => p.character_id));
  const wardrobe_available = u.looks
    .filter((l) => participantIds.has(u.follow(l.character_id)))
    .map((l) => ({ id: l.id, character_id: u.follow(l.character_id), name: l.name }));

  const { proposal, engine_version } = sceneDnaAssemblyEngine({
    scene: {
      id: scene.id,
      number: scene.number,
      heading: scene.heading,
      int_ext: scene.int_ext,
      location: scene.location,
      time_of_day: scene.time_of_day,
      estimated_seconds: Number(scene.estimated_seconds),
      status: scene.status,
    },
    action,
    participants,
    dialogue,
    adjacent: { previous: adj(pos > 0 ? active[pos - 1] : undefined), next: adj(pos >= 0 ? active[pos + 1] : undefined) },
    wardrobe_available,
    editable,
  });

  // Dependency refs (CLAUDE.md rule 10): the exact upstream content this blueprint uses.
  const deps: DependencyRef[] = [
    { type: "scene", id: scene.id, fingerprint: String(scene.content_hash), strength: "hard", label: `Scene ${scene.number}` },
    ...participants.map((p): DependencyRef => {
      const c = u.chars.get(p.character_id)!;
      return {
        type: "character",
        id: p.character_id,
        fingerprint: fp(c.name, c.kind, c.status, c.role, c.age, c.gender, c.description, p.voice_only),
        strength: "soft",
        label: c.name,
      };
    }),
    ...lines.map((l): DependencyRef => ({
      type: "dialogue_line",
      id: l.id,
      fingerprint: fp(l.text_hash, l.character_id, l.intention, l.subtext, l.emotion, l.intensity, l.approval),
      strength: "soft",
      label: `${l.speaker_name}: “${String(l.text).slice(0, 40)}${String(l.text).length > 40 ? "…" : ""}”`,
    })),
    ...proposal.participants
      .filter((p) => p.wardrobe_look_id)
      .map((p): DependencyRef => {
        const look = u.looks.find((l) => l.id === p.wardrobe_look_id)!;
        return { type: "wardrobe_look", id: look.id, fingerprint: fp(look.name, look.description), strength: "soft", label: `${p.name} — ${look.name}` };
      }),
  ];
  // Ages chosen for this scene (flashbacks, time jumps): only a participant's own ages count; a removed or changed age
  // flags the approved blueprint (drift), like a wardrobe look.
  const ages: Record<string, string> = {};
  for (const p of participants) {
    const id = editable.ages?.[p.character_id];
    const st = id ? u.ages.find((a) => a.id === id && u.follow(a.character_id) === p.character_id) : undefined;
    if (!st) continue;
    ages[p.character_id] = st.id;
    deps.push({ type: "character_age", id: st.id, fingerprint: fp(st.label, st.age, st.description), strength: "soft", label: `${p.name} — ${st.label} (age ${st.age})` });
  }
  return { proposal, engine_version, deps, ages };
}

// jsonb reorders object keys, so compare drift evidence independent of key order.
const stable = (v: unknown): string =>
  Array.isArray(v)
    ? `[${v.map(stable).join(",")}]`
    : v && typeof v === "object"
      ? `{${Object.keys(v as Row).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Row)[k])}`).join(",")}}`
      : JSON.stringify(v);

const toDriftDTO = (d: Drift): SceneDnaDrift => ({ type: d.ref.type, id: d.ref.id, label: d.ref.label, kind: d.kind, effect: d.effect, message: d.message });

function sceneEntry(u: Upstream, scene: Row) {
  const row = u.records.get(scene.id);
  const editable = toEditable(row);
  const { proposal, engine_version, deps, ages } = assembleScene(u, scene, editable);
  const approved = row?.approved_version_id ? u.versions.get(row.approved_version_id) : undefined;
  const drift = approved ? computeDrift(approved.dependencies as DependencyRef[], deps) : [];
  return { row, editable, proposal, engine_version, deps, ages, approved, drift, state: approved ? descendantState(drift) : ("current" as const) };
}

function summary(scene: Row) {
  return {
    id: scene.id,
    number: scene.number,
    heading: scene.heading,
    int_ext: scene.int_ext,
    location: scene.location,
    time_of_day: scene.time_of_day,
    estimated_seconds: Number(scene.estimated_seconds),
    status: scene.status,
  };
}

/** MOS invalidation step: persist drift evidence when it differs from what is stored. */
async function persistDrift(db: SupabaseClient, e: ReturnType<typeof sceneEntry>) {
  let row = e.row;
  if (row && e.approved) {
    const drift = e.drift.map(toDriftDTO);
    if (row.review_state !== e.state || stable(row.drift ?? []) !== stable(drift)) {
      row = await repo.setDrift(db, row.id, e.state, drift);
    }
  }
  return row;
}

/**
 * Brings every locked Scene DNA's review state up to date with its upstream
 * (script, Casting, Dialogue) without building the whole workspace. Downstream
 * domains (Storyboard) call this before reading Scene DNA state, so an upstream
 * change is flagged even if nobody has opened Scene DNA since (production graph
 * propagation; regression: Casting change not reaching Storyboard).
 */
export async function refreshSceneDnaReview(db: SupabaseClient, projectId: string) {
  const u = await loadUpstream(db, projectId);
  if (!u.version) return;
  for (const scene of u.scenes) {
    const row = u.records.get(scene.id);
    if (row?.approved_version_id) await persistDrift(db, sceneEntry(u, scene));
  }
}

export async function getSceneDnaWorkspace(db: SupabaseClient, projectId: string) {
  await assertProjectAccess(db, projectId);
  const u = await loadUpstream(db, projectId);
  if (!u.version) return { script: null, scenes: [], summary: { scenes: 0, approved: 0, ready: 0, needs_review: 0 } };
  // Cut scenes stay listed only when they carry Scene DNA work (never silently dropped).
  const visible = u.scenes.filter((s) => s.status === "active" || u.records.has(s.id));
  // Story-time clues from the script's own words (flashbacks, time jumps, "YOUNG AMARA"), so ages can be chosen.
  const cues = storyTimeCueEngine({
    scenes: visible.map((s) => ({ id: s.id, number: s.number, heading: String(s.heading ?? ""), action: actionOf(u, s) })),
    characters: [...u.chars.values()].filter((c) => !c.merged_into).map((c) => ({ id: c.id, name: c.name, age: c.age ?? null })),
  });
  const scenes = [];
  for (const scene of visible) {
    const e = sceneEntry(u, scene);
    const row = await persistDrift(db, e);
    scenes.push({
      scene: summary(scene),
      record: row ? toRecordDTO(row, e.approved ? Number(e.approved.version_number) : null) : null,
      editable: e.editable,
      proposal: e.proposal,
      looks: u.looks
        .filter((l) => e.proposal.participants.some((p) => p.character_id === u.follow(l.character_id)))
        .map((l) => ({ id: l.id, character_id: u.follow(l.character_id), name: l.name, description: l.description ?? null })),
      ages: u.ages
        .filter((a) => e.proposal.participants.some((p) => p.character_id === u.follow(a.character_id)))
        .map((a) => ({ id: a.id, character_id: u.follow(a.character_id), label: a.label, age: a.age, description: a.description ?? null })),
      story_time: cues.scenes.find((c) => c.scene_id === scene.id) ?? { scene_id: scene.id, number: scene.number, cues: [], other_time: false },
      engine_version: e.engine_version,
    });
  }
  return {
    script: { approved_version_id: u.version.id, version_number: u.version.version_number },
    scenes,
    summary: {
      scenes: scenes.filter((s) => s.scene.status === "active").length,
      approved: scenes.filter((s) => s.record?.status === "approved" && s.record.review_state === "current").length,
      ready: scenes.filter((s) => s.proposal.ready_for_approval).length,
      needs_review: scenes.filter((s) => s.record && s.record.review_state !== "current").length,
    },
  };
}

export async function updateSceneDna(db: SupabaseClient, projectId: string, sceneId: string, payload: unknown) {
  const input = validateUpdateSceneDnaInput(payload);
  await assertProjectAccess(db, projectId);
  await assertSceneInProject(db, projectId, sceneId);
  const row = await repo.saveSceneDna(db, projectId, sceneId, input);
  return toRecordDTO(row, null);
}

export async function approveSceneDna(db: SupabaseClient, projectId: string, sceneId: string) {
  await assertProjectAccess(db, projectId);
  await assertSceneInProject(db, projectId, sceneId);
  const u = await loadUpstream(db, projectId);
  if (!u.version) throw new SceneDnaNotReadyError(undefined, "Approve the script in Scriptwriter first — Scene DNA is built from the approved script.");
  const scene = u.scenes.find((s) => s.id === sceneId)!;
  const e = sceneEntry(u, scene);
  if (!e.proposal.ready_for_approval) {
    const failing = e.proposal.readiness.filter((r) => r.blocking && !r.ok);
    throw new SceneDnaNotReadyError(failing, `Not ready to lock yet: ${failing.map((f) => f.label.toLowerCase()).join("; ")}.`);
  }
  const content: { editable: SceneDnaEditable; proposal: SceneDnaProposal; script_version_id: string } = {
    // Only ages that belong to this scene's characters are frozen with the blueprint.
    editable: { ...e.editable, ages: e.ages },
    proposal: e.proposal,
    script_version_id: u.version.id,
  };
  const v = await repo.approveSceneDna(db, projectId, sceneId, content, e.deps, e.engine_version);
  return { version_id: v.id, version_number: v.version_number, dependencies: e.deps.length };
}
