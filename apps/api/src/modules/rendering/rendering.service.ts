// apps/api/src/modules/rendering/rendering.service.ts
// Domain workflow for Export & Deliver (SRS §12).
// Deliverables are made only from the CURRENT Picture Lock. The API compiles an
// immutable RenderManifest (engines/rendering/renderManifestEngine) that names
// every source version, checksums it and queues it through the MOS jobs table;
// the render worker (workers/render-worker) does the heavy work (rule 8), runs
// final QC and stores the files. Breaking the Picture Lock later marks existing
// deliverables stale — their files are never deleted (rule 11).
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TIMELINE_FPS, type DeliveryProfileId } from "@aurastage/contracts";
import { deliveryProfiles, getDeliveryProfile, renderManifest, renderManifestEngine } from "@aurastage/engines";
import { mediaConfigured, signedMediaUrl } from "../../storage/media";
import { assertProjectAccess, assertRenderAccess } from "./rendering.permissions";
import * as repo from "./rendering.repository";
import { toLockedClip } from "./rendering.mapper";
import { RenderingNotReadyError, validateCreateRender } from "./rendering.validator";

type Row = Record<string, any>;
type Env = Record<string, string | undefined>;
// Project Settings owns the loudness standard, required deliverables and credits; Delivery reads them.
import { LOUDNESS_STANDARDS, loudnessTarget, type ProjectSettings } from "@aurastage/contracts";
import { readProjectSettings } from "../settings/settings.read";

/** The delivery profile with the project's loudness standard (QC in the render worker checks against it). */
function profileFor(profileId: string, settings: ProjectSettings) {
  const p = getDeliveryProfile(profileId);
  const std = settings.technical.loudness_standard;
  return p.loudness ? { ...p, loudness: { ...loudnessTarget(std), standard: LOUDNESS_STANDARDS[std].label.split(" (")[0] } } : p;
}
function creditsOf(settings: ProjectSettings) {
  const c = settings.production;
  return { director: c.director, producer: c.producer, company: c.company, copyright: c.copyright, year: c.year };
}

/** Everything a manifest needs, read from the current Picture Lock (never the live timeline). */
async function loadLock(db: SupabaseClient, projectId: string) {
  const timeline = await repo.getTimeline(db, projectId);
  const lock = timeline?.status === "locked" && timeline.current_lock_id ? await repo.getLock(db, timeline.current_lock_id) : null;
  const version = lock ? await repo.getVersion(db, lock.version_id) : null;
  const clips = ((version?.clips as Row[]) ?? []).map(toLockedClip);
  const takeIds = [...new Set(clips.map((c) => c.take_id).filter((x): x is string => !!x))];
  const mixIds = [...new Set(clips.map((c) => c.audio_session_version_id).filter((x): x is string => !!x))];
  const [takes, mixes, sessions] = await Promise.all([repo.listTakes(db, takeIds), repo.listMixVersions(db, mixIds), repo.listSessions(db, projectId)]);
  const assetIds = [...new Set(mixes.flatMap((m) => ((m.clips as Row[]) ?? []).map((c) => c.asset_id).filter((x): x is string => !!x)))];
  const lineIds = [...new Set(mixes.flatMap((m) => ((m.clips as Row[]) ?? []).map((c) => c.source?.dialogue_line_id).filter((x): x is string => typeof x === "string")))];
  const [assets, lines] = await Promise.all([repo.listAssets(db, assetIds), repo.listLines(db, lineIds)]);
  return { timeline, lock, version, clips, takes, mixes, sessions, assets, lines };
}
type Locked = Awaited<ReturnType<typeof loadLock>>;

function manifestInput(project: { id: string; title: string }, L: Locked, profileId: string, options: { watermark: string | null; burn_timecode: boolean }, settings: ProjectSettings) {
  return {
    project: { id: project.id, title: project.title, credits: creditsOf(settings) },
    profile: profileFor(profileId, settings),
    options,
    picture_lock: { id: L.lock!.id, lock_number: L.lock!.lock_number, timeline_version_id: L.version!.id },
    fps: L.version?.fps ?? TIMELINE_FPS,
    clips: L.clips,
    takes: Object.fromEntries(L.takes.map((t) => [t.id, { storage_key: t.storage_key ?? null, media_type: t.media_type ?? null, capability: t.capability, duration_seconds: t.params?.duration_seconds ? Number(t.params.duration_seconds) : null }])),
    mixes: Object.fromEntries(
      L.mixes.map((m) => {
        const s = L.sessions.find((x) => x.id === m.session_id);
        return [m.id, { scene_id: s?.scene_id ?? null, version_number: m.version_number, seconds: Number(m.measurement?.duration_seconds) || Number(s?.scene_seconds) || 1, tracks: m.tracks ?? [], clips: m.clips ?? [], mix: m.mix ?? null }];
      })
    ),
    assets: Object.fromEntries(L.assets.map((a) => [a.id, { storage_key: a.storage_path ?? null, media_type: a.metadata?.media_type ?? null }])),
    lines: Object.fromEntries(L.lines.map((l) => [l.id, { speaker: l.speaker_name, text: l.text }])),
  };
}

/** Pre-delivery checks with evidence (rule 12): what must be true before anything is rendered. */
function preflight(L: Locked, env: Env, settings: ProjectSettings, renders: Row[]) {
  const lockQc = (L.version?.qc ?? {}) as Row;
  const probe = L.lock ? renderManifestEngine(manifestInput({ id: "p", title: "p" }, L, "streaming_master", { watermark: null, burn_timecode: false }, settings)) : null;
  const target = loudnessTarget(settings.technical.loudness_standard);
  const standardName = LOUDNESS_STANDARDS[settings.technical.loudness_standard].label.split(" (")[0];
  const required = settings.delivery.required_profiles;
  const doneRequired = required.filter((id) => renders.some((r) => r.profile_id === id && r.status === "succeeded" && r.qc_passed && L.lock && r.picture_lock_id === L.lock.id));
  const mediaMissing = probe ? probe.missing.filter((m) => /media|file|offline|mix is missing/.test(m)) : [];
  const soundMissing = L.clips.filter((c) => c.track === "A1").length === 0;
  const mixNotes = L.mixes
    .map((m) => {
      const s = L.sessions.find((x) => x.id === m.session_id);
      const I = m.measurement?.integrated_lufs === null || m.measurement?.integrated_lufs === undefined ? null : Number(m.measurement.integrated_lufs);
      return { m, s, I };
    });
  const superseded = mixNotes.filter((x) => x.s && x.s.approved_version_id !== x.m.id);
  const offTarget = mixNotes.filter((x) => x.I === null || Math.abs(x.I - target.integrated_lufs) > target.tolerance_lu);
  const cues = probe?.manifest?.subtitles?.cues.length ?? 0;
  return [
    { id: "picture_locked", label: "The picture is locked", ok: !!L.lock, blocking: true, evidence: L.lock ? `Picture Lock ${L.lock.lock_number}, ${new Date(L.lock.locked_at).toLocaleString("en-GB")}` : L.timeline ? "The cut isn't locked — lock it in Editorial" : "No timeline yet — build it in Editorial" },
    { id: "lock_checks", label: "The locked cut passed the timeline checks", ok: !!L.lock && lockQc.ready_for_lock === true, blocking: true, evidence: L.lock ? (lockQc.ready_for_lock ? "Recorded with the lock" : "Checks were not passing when locked") : "—" },
    { id: "media_online", label: "Every picture and sound file is stored", ok: !!L.lock && mediaMissing.length === 0, blocking: true, evidence: !L.lock ? "—" : mediaMissing.length ? mediaMissing.slice(0, 3).join("; ") : `${L.takes.length} takes, ${L.assets.length} recordings` },
    { id: "storage_ready", label: "Delivery storage is set up", ok: mediaConfigured(env), blocking: true, evidence: mediaConfigured(env) ? "Private bucket connected" : "The media bucket isn't configured on the server" },
    { id: "sound_present", label: "The locked cut has sound", ok: !!L.lock && !soundMissing, blocking: false, evidence: soundMissing ? "No scene mixes on A1 — video deliverables need sound" : `${L.mixes.length} approved scene mix${L.mixes.length === 1 ? "" : "es"}` },
    { id: "mixes_current", label: "Scene mixes in the lock are still the approved ones", ok: superseded.length === 0, blocking: false, evidence: superseded.length ? `${superseded.length} scene mix${superseded.length === 1 ? " was" : "es were"} approved again after the lock — conform and re-lock to use ${superseded.length === 1 ? "it" : "them"}` : "Current" },
    { id: "mix_loudness", label: `Scene mixes were measured at ${target.integrated_lufs} LUFS ±${target.tolerance_lu} (${standardName})`, ok: L.mixes.length > 0 && offTarget.length === 0, blocking: false, evidence: offTarget.length ? offTarget.map((x) => `mix v${x.m.version_number}: ${x.I === null ? "silent" : `${x.I.toFixed(1)} LUFS`}`).join(", ") : L.mixes.length ? "On target" : "No mixes" },
    { id: "subtitles", label: "Dialogue is available for subtitles", ok: cues > 0, blocking: false, evidence: cues ? `${cues} subtitle cue${cues === 1 ? "" : "s"}` : "No dialogue heard in the locked cut" },
    ...(required.length
      ? [{ id: "required_deliverables", label: "Required deliverables (Project Settings) are rendered from this lock with QC passed", ok: doneRequired.length === required.length, blocking: false,
          evidence: `${doneRequired.length} of ${required.length} done${required.length > doneRequired.length ? ` — still to render: ${required.filter((id) => !doneRequired.includes(id)).map((id) => { try { return getDeliveryProfile(id).label; } catch { return id; } }).join(", ")}` : ""}` }]
      : []),
  ];
}

export async function getDeliveryWorkspace(db: SupabaseClient, projectId: string, env: Env = process.env) {
  const project = await assertProjectAccess(db, projectId);
  const [L, renders, current] = await Promise.all([loadLock(db, projectId), repo.listRenders(db, projectId), readProjectSettings(db, projectId)]);
  // A deliverable made from a lock that is no longer current is stale (files kept).
  for (const r of renders) {
    const stale = !L.lock || L.lock.id !== r.picture_lock_id;
    const reason = stale ? `Made from Picture Lock ${r.lock_number}, which is no longer the current lock${L.lock ? ` (now Picture Lock ${L.lock.lock_number})` : ""}.` : null;
    if (r.review_state !== (stale ? "stale" : "current") || (r.review_reason ?? null) !== reason) Object.assign(r, await repo.setReview(db, r.id, stale ? "stale" : "current", reason));
  }
  const slug = project.title.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "").slice(0, 60) || "project";
  const sign = async (key: string, name: string | null) => (mediaConfigured(env) ? signedMediaUrl(key, 3600, env, name ?? undefined) : null);
  const out: Row[] = [];
  for (const r of renders) {
    const outputs: Row[] = [];
    for (const o of (r.outputs as Row[]) ?? []) {
      outputs.push({ ...o, download_name: `${slug}_${o.name}`, url: await sign(o.storage_key, `${slug}_${o.name}`), stream_url: /video/.test(o.media_type) ? await sign(o.storage_key, null) : null });
    }
    out.push({ ...r, profile_label: (() => { try { return getDeliveryProfile(r.profile_id).label; } catch { return r.profile_id; } })(), outputs });
  }
  const preview = out.find((r) => r.status === "succeeded" && r.review_state === "current" && r.outputs.some((o: Row) => o.stream_url));
  return {
    project: { id: project.id, title: project.title },
    picture_lock: L.lock ? { id: L.lock.id, lock_number: L.lock.lock_number, locked_at: L.lock.locked_at, duration_frames: L.version?.duration_frames ?? 0, fps: L.version?.fps ?? TIMELINE_FPS } : null,
    timeline_status: L.timeline?.status ?? null,
    profiles: deliveryProfiles(),
    required_profiles: current.settings.delivery.required_profiles,
    preflight: preflight(L, env, current.settings, renders),
    renders: out,
    preview: preview ? { render_id: preview.id, label: preview.profile_label, url: preview.outputs.find((o: Row) => o.stream_url)!.stream_url } : null,
    queue: { waiting: renders.filter((r) => r.status === "queued").length, running: renders.filter((r) => r.status === "running").length },
    destinations: [
      { id: "download", label: "Download", state: "ready", note: "Signed links to every file, valid for an hour" },
      { id: "youtube", label: "YouTube", state: "not_connected", note: "Needs a YouTube account connection" },
      { id: "vimeo", label: "Vimeo", state: "not_connected", note: "Needs a Vimeo account connection" },
      { id: "frameio", label: "Frame.io", state: "not_connected", note: "Needs a Frame.io account connection" },
      { id: "s3", label: "Your own cloud storage (S3)", state: "not_connected", note: "Needs bucket credentials" },
    ],
  };
}

export async function createRender(db: SupabaseClient, projectId: string, payload: unknown, env: Env = process.env) {
  const input = validateCreateRender(payload);
  const project = await assertProjectAccess(db, projectId);
  const profile = getDeliveryProfile(input.profile_id as DeliveryProfileId);
  if (!profile.available) throw new RenderingNotReadyError(`${profile.label} isn't available: ${profile.unavailable_reason}`);
  if (!mediaConfigured(env)) throw new RenderingNotReadyError("Delivery storage isn't set up on the server yet.");
  const L = await loadLock(db, projectId);
  if (!L.lock || !L.version) throw new RenderingNotReadyError("Lock the picture in Editorial first — deliverables are made from a Picture Lock.");
  const options = { watermark: input.options?.watermark ?? null, burn_timecode: input.options?.burn_timecode ?? false };
  const { settings } = await readProjectSettings(db, projectId);
  const r = renderManifestEngine(manifestInput(project, L, profile.id, options, settings));
  if (!r.manifest) throw new RenderingNotReadyError(`Can't render yet: ${r.missing.join("; ")}.`, r.missing);
  const sha256 = createHash("sha256").update(JSON.stringify(r.manifest)).digest("hex");
  const row = await repo.createRender(db, {
    projectId, lockId: L.lock.id, profileId: profile.id, profileVersion: profile.version, options: r.manifest.options, manifest: r.manifest, sha256, engineVersion: renderManifest.ENGINE_VERSION,
  });
  return { render_id: row.id as string, manifest_sha256: sha256, files: r.manifest.files };
}

export async function cancelRender(db: SupabaseClient, renderId: string) {
  await assertRenderAccess(db, renderId);
  const r = await repo.cancelRender(db, renderId);
  return { status: r.status as string, cancel_requested: !!r.cancel_requested };
}

export async function getRenderManifest(db: SupabaseClient, renderId: string) {
  const r = await assertRenderAccess(db, renderId);
  return { manifest_sha256: r.manifest_sha256, manifest: r.manifest };
}
